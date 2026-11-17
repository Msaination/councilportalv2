"""Server-side Supabase (PostgREST) client for the complaint gateway.

Reads the CMS's credentials from settings (loaded from the CMS repo's
.env.local, see council_portal.settings) and queries the Supabase REST API.

Security rules (PORTAL_PLAN.md §6.1/§6.4):
- The service-role key NEVER reaches the browser — only Django calls it.
- Query results are ALWAYS filtered by the caller's ward; the browser only
  ever sees rows for the authenticated councillor's own ward.
"""

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

COMPLAINTS_TABLE = 'complaints'
# Map the live Supabase schema onto the stable field names used by the portal.
COMPLAINT_FIELDS = (
    'id,reference_number,subject:title,status,priority,ward:ward_number,'
    'area:location_address,department:assigned_department,'
    'issue_type,description,received_channel:received_via,'
    'date_reported:created_at,created_at'
)


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