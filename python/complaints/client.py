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
# Columns the portal dashboard renders (CMS schema: §6.7 discovery).
COMPLAINT_FIELDS = (
    'id,reference_number,subject,status,priority,ward,area,department,'
    'section,description,received_channel,date_reported,created_at'
)


def _supabase_config():
    """(rest_url, headers) or None when the gateway is not configured."""
    url = getattr(settings, 'SUPABASE_URL', '').rstrip('/')
    key = getattr(settings, 'SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not key:
        return None
    return f'{url}/rest/v1', {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Accept': 'application/json',
    }


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
                # CMS stores wards as "Ward 12" (verified 2026-11-12 against
                # live data: all 19 rows use the prefixed format).
                'ward': f'eq.Ward {ward}',
                'select': COMPLAINT_FIELDS,
                'order': 'date_reported.desc',
                'limit': str(limit),
            },
            timeout=10,
        )
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        logger.error('Supabase complaints query failed (ward=%s): %s', ward, exc)
        return None