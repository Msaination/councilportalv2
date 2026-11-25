"""Server-side Supabase (PostgREST) client for the complaint gateway.

Reads the CMS's credentials from settings (loaded from the CMS repo's
.env.local, see council_portal.settings) and queries the Supabase REST API.

Security rules (PORTAL_PLAN.md §6.1/§6.4):
- The service-role key NEVER reaches the browser — only Django calls it.
- Query results are ALWAYS filtered by the caller's ward; the browser only
  ever sees rows for the authenticated councillor's own ward.
"""

import logging
from datetime import datetime, timedelta, timezone

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

COMPLAINTS_TABLE = 'complaints'

# A councillor may escalate a complaint only once it has been open this long.
ESCALATION_WINDOW_HOURS = 72

# Status values the CMS actually accepts (complaints_status_check).
# There is deliberately no 'escalated' status: escalation is expressed by
# raising `priority` to 'urgent', which complaints_priority_check allows.
STATUSES = frozenset({'submitted', 'inProgress', 'closed', 'resolved'})
PRIORITIES = frozenset({'normal', 'urgent'})

# A complaint in one of these states is finished; escalating is pointless.
FINAL_STATUSES = frozenset({'resolved', 'closed'})

ESCALATED_PRIORITY = 'urgent'

# Map the live Supabase schema onto the stable field names used by the portal.
COMPLAINT_FIELDS = (
    'id,reference_number,subject:title,status,priority,ward:ward_number,'
    'area:location_address,department:assigned_department,'
    'issue_type,description,received_channel:received_via,'
    'date_reported:created_at,created_at'
)


def _normalise_status(value):
    return (value or '').strip().lower()


def _supabase_config():
    """(rest_url, headers) or None when the gateway is not configured."""
    url = getattr(settings, 'SUPABASE_URL', '').rstrip('/')
    key = getattr(settings, 'SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not key:
        return None
    headers = {
        'apikey': key,
        'Accept': 'application/json',
    }
    # New sb_secret keys are API keys, not JWTs, and Supabase rejects them
    # when sent as Authorization bearer tokens. Legacy service-role keys are
    # JWTs and still require both headers for compatibility.
    if not key.startswith('sb_secret_'):
        headers['Authorization'] = f'Bearer {key}'
    return f'{url}/rest/v1', headers


def fetch_complaints_for_ward(ward, *, limit=100):
    """Return complaints for *ward* (int), newest first.

    Returns [] and logs on any failure — a down CMS must never break the
    portal (same best-effort policy as Authentik provisioning).
    """
    config = _supabase_config()
    if config is None:
        logger.warning(
            'Complaints gateway skipped: SUPABASE_URL / '
            'SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) '
            'not configured.',
        )
        return None  # None = not configured (distinct from "no rows")

    if not ward:
        return []

    rest_url, headers = config
    try:
        response = requests.get(
            f'{rest_url}/{COMPLAINTS_TABLE}',
            headers=headers,
            params={
                # ward_number is text containing the bare ward number.
                'ward_number': f'eq.{ward}',
                'select': COMPLAINT_FIELDS,
                'order': 'created_at.desc',
                'limit': str(limit),
            },
            timeout=10,
        )
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.error('Supabase complaints query failed (ward=%s): %s', ward, exc)
        return None


def fetch_replies_for_complaint(complaint_id):
    """Return replies for a complaint, oldest first."""
    config = _supabase_config()
    if config is None:
        logger.warning('Complaints gateway skipped: Supabase not configured.')
        return None

    rest_url, headers = config
    try:
        response = requests.get(
            f'{rest_url}/report_replies',
            headers=headers,
            params={
                'complaint_id': f'eq.{complaint_id}',
                'select': 'created_at,body,from_staff,user.full_name',
                'order': 'created_at.asc',
            },
            timeout=10,
        )
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.error('Supabase replies query failed (complaint_id=%s): %s', complaint_id, exc)
        return None


def _fetch_one(complaint_id, ward):
    """Single complaint, or None when it is not in *ward*.

    Ward-scoped on purpose: a councillor must not be able to read or mutate
    a complaint belonging to another ward by guessing an id.
    """
    config = _supabase_config()
    if config is None:
        return None

    rest_url, headers = config
    response = requests.get(
        f'{rest_url}/{COMPLAINTS_TABLE}',
        headers=headers,
        params={
            'id': f'eq.{complaint_id}',
            'ward_number': f'eq.{ward}',
            'select': 'id,reference_number,title,status,priority,'
                      'ward_number,created_at',
            'limit': '1',
        },
        timeout=10,
    )
    response.raise_for_status()
    rows = response.json()
    return rows[0] if rows else None


def _parse_timestamp(value):
    """Parse a Supabase ISO timestamp into an aware datetime."""
    if not value:
        return None
    text = str(value).replace('Z', '+00:00')
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def escalation_deadline(complaint):
    """When the complaint becomes eligible for escalation, or None."""
    created = _parse_timestamp(complaint.get('created_at'))
    if created is None:
        return None
    return created + timedelta(hours=ESCALATION_WINDOW_HOURS)


def can_escalate(complaint, *, now=None):
    """Has this complaint been open long enough, and is it still open?"""
    if _normalise_status(complaint.get('status')) in FINAL_STATUSES:
        return False
    if _normalise_status(complaint.get('priority')) == ESCALATED_PRIORITY:
        return False
    deadline = escalation_deadline(complaint)
    if deadline is None:
        return False
    return (now or datetime.now(timezone.utc)) >= deadline


def escalate_complaint(complaint_id, ward, reason=''):
    """Escalate a complaint in *ward*, or report why that is not allowed.

    Returns ``(complaint, error)`` where exactly one is set. ``error`` is a
    dict carrying ``detail`` and an HTTP status code.
    """
    config = _supabase_config()
    if config is None:
        return None, {
            'detail': 'Complaints gateway is not configured.',
            'status': 503,
        }

    try:
        complaint = _fetch_one(complaint_id, ward)
    except (requests.RequestException, ValueError) as exc:
        logger.error('Supabase complaint lookup failed (%s): %s', complaint_id, exc)
        return None, {
            'detail': 'Complaint system is unreachable right now.',
            'status': 502,
        }

    if complaint is None:
        return None, {'detail': 'Complaint not found in your ward.', 'status': 404}

    if not can_escalate(complaint):
        status_text = _normalise_status(complaint.get('status'))
        if status_text in FINAL_STATUSES:
            detail = f'This complaint is already {status_text}.'
        elif _normalise_status(complaint.get('priority')) == ESCALATED_PRIORITY:
            detail = 'This complaint has already been escalated.'
        else:
            detail = ('A complaint can only be escalated after '
                      f'{ESCALATION_WINDOW_HOURS} hours.')
        return None, {'detail': detail, 'status': 400}

    # Escalation = urgent priority. The CMS has no 'escalated' status, and
    # `priority` is the only column that carries "this needs attention now".
    rest_url, headers = config
    try:
        response = requests.patch(
            f'{rest_url}/{COMPLAINTS_TABLE}',
            headers={**headers, 'Prefer': 'return=representation'},
            params={'id': f'eq.{complaint_id}', 'ward_number': f'eq.{ward}'},
            json={'priority': ESCALATED_PRIORITY},
            timeout=10,
        )
        response.raise_for_status()
        rows = response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.error('Supabase escalation failed (%s): %s', complaint_id, exc)
        return None, {
            'detail': 'Could not escalate the complaint right now.',
            'status': 502,
        }

    return (rows[0] if rows else
            {**complaint, 'priority': ESCALATED_PRIORITY}), None


def create_complaint(fields):
    """Insert a complaint and return the created row, or ``(None, error)``."""
    config = _supabase_config()
    if config is None:
        return None, {
            'detail': 'Complaints gateway is not configured.',
            'status': 503,
        }

    rest_url, headers = config
    try:
        response = requests.post(
            f'{rest_url}/{COMPLAINTS_TABLE}',
            headers={**headers, 'Prefer': 'return=representation'},
            json=fields,
            timeout=10,
        )
        response.raise_for_status()
        rows = response.json()
    except requests.HTTPError as exc:
        logger.error('Supabase complaint insert failed: %s — %s', exc,
                     getattr(exc.response, 'text', '')[:500])
        return None, {
            'detail': 'Could not log the complaint right now.',
            'status': 502,
        }
    except (requests.RequestException, ValueError) as exc:
        logger.error('Supabase complaint insert failed: %s', exc)
        return None, {
            'detail': 'Could not log the complaint right now.',
            'status': 502,
        }

    return (rows[0] if rows else fields), None
