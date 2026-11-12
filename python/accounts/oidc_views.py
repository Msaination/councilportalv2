"""OIDC callback that hands JWT tokens to the Next.js frontend.

After Authentik authenticates the user, the portal backend logs them into a
Django session (library behaviour) AND mints SimpleJWT access/refresh tokens,
then redirects to the frontend route ``/login/oidc/`` with the tokens in the
URL *fragment* (never sent to the server). That route stores them in
localStorage — the same place the existing password login puts them — so the
whole dashboard keeps working unchanged.
"""

from django.conf import settings
from django.http import HttpResponseRedirect
from mozilla_django_oidc.views import OIDCAuthenticationCallbackView
from rest_framework_simplejwt.tokens import RefreshToken


class JwtOIDCCallbackView(OIDCAuthenticationCallbackView):
    """Exchange a successful Authentik login for portal JWT tokens."""

    def login_success(self):
        super().login_success()  # side effect: auth.login(...) + session state
        refresh = RefreshToken.for_user(self.user)
        fragment = (
            f'#access={refresh.access_token}&refresh={refresh}'
            f'&username={self.user.username}'
        )
        # Swallow the library's session redirect — the SPA is the real landing
        # page; it routes internally after storing the tokens.
        return HttpResponseRedirect(f'{settings.OIDC_FRONTEND_REDIRECT}{fragment}')