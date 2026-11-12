"""Push portal users into Authentik — the SSO broker (PORTAL_PLAN.md §6.5).

The Council Portal is the system of record for identities; Authentik is a
downstream subscriber. Whenever a user is created in the portal, or their
identity fields (name/email/username) change, this module mirrors them into
Authentik so the person can log in with Council SSO.

Design notes:
- **Best effort.** If Authentik is down, portal operations still succeed — the
  portal is the source of truth and provisioning can be re-run (see the
  ``provision_authentik_users`` management command).
- **Idempotent.** Looks the user up by username first: PATCH when present,
  POST when absent. Passwords are only set on explicit request (create flows),
  never on profile updates — Authentik owns credentials (§6.5, Option A).
"""

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

AUTHENTIK_USER_ENDPOINT = '/api/v3/core/users/'


def _client_config():
    """(base_url, headers) or None when provisioning is not configured."""
    url = getattr(settings, 'AUTHENTIK_API_URL', '').rstrip('/')
    token = getattr(settings, 'AUTHENTIK_ADMIN_TOKEN', '')
    if not url or not token:
        return None
    return url, {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }


def _identity_payload(user):
    """Authentik-visible identity fields — mirror of the portal profile."""
    full_name = f'{user.first_name} {user.last_name}'.strip()
    return {
        'username': user.username[:150],
        'name': full_name or user.username,
        'email': (user.email or '').strip(),
    }


def _find_user(base_url, headers, username):
    """Return the Authentik pk for *username*, or None."""
    response = requests.get(
        f'{base_url}{AUTHENTIK_USER_ENDPOINT}',
        params={'username': username[:150]},
        headers=headers,
        timeout=10,
    )
    response.raise_for_status()
    results = response.json().get('results') or []
    return results[0]['pk'] if results else None


def provision_user(user, *, temp_password=None, password_hash=None):
    """Create-or-update *user* in Authentik; return the Authentik pk.

    Credentials (one of, applied after the account exists):
    - ``temp_password``: a plain-text starter password (create flows) —
      the person replaces it in Authentik on first SSO login (§6.5 Option A).
    - ``password_hash``: the user's Django password hash, mirrored verbatim
      via Authentik's ``set_password_hash`` action so an admin-set (or portal-
      changed) password also works for SSO. Hashes only ever travel portal →
      Authentik; Authentik-side changes are never read back.

    Never raises: failures are logged so a down broker cannot break portal
    user management.
    """
    config = _client_config()
    if config is None:
        logger.warning(
            'Authentik provisioning skipped for %s: AUTHENTIK_API_URL / '
            'AUTHENTIK_ADMIN_TOKEN not configured.', user.username,
        )
        return None

    base_url, headers = config
    payload = _identity_payload(user)

    try:
        pk = _find_user(base_url, headers, payload['username'])
        if pk is None:
            response = requests.post(
                f'{base_url}{AUTHENTIK_USER_ENDPOINT}',
                json=payload,
                headers=headers,
                timeout=10,
            )
            response.raise_for_status()
            pk = response.json()['pk']
        else:
            response = requests.patch(
                f'{base_url}{AUTHENTIK_USER_ENDPOINT}{pk}/',
                json=payload,
                headers=headers,
                timeout=10,
            )
            response.raise_for_status()

        if temp_password:
            # Passwords are blueprint/excluded from the user serializer;
            # Authentik exposes dedicated actions for them.
            response = requests.post(
                f'{base_url}{AUTHENTIK_USER_ENDPOINT}{pk}/set_password/',
                json={'password': temp_password},
                headers=headers,
                timeout=10,
            )
            response.raise_for_status()
        elif password_hash:
            # Pre-hashed Django value (pbkdf2_sha256$...) — the verifier is
            # copied so the very same password works in both systems.
            response = requests.post(
                f'{base_url}{AUTHENTIK_USER_ENDPOINT}{pk}/set_password_hash/',
                json={'password': password_hash},
                headers=headers,
                timeout=10,
            )
            response.raise_for_status()

        return pk
    except (requests.RequestException, KeyError, ValueError) as exc:
        logger.error(
            'Authentik provisioning failed for %s: %s', user.username, exc,
        )
        return None