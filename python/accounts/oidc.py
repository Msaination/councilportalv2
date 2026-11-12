"""Authentik OIDC integration for the Council Portal."""

from __future__ import annotations

from typing import Any

from django.contrib.auth import get_user_model
from mozilla_django_oidc.auth import OIDCAuthenticationBackend

from .models import UserProfile

User = get_user_model()


class CouncilPortalOIDCBackend(OIDCAuthenticationBackend):
    """Map Authentik claims onto the Council Portal user model."""

    def get_username(self, claims: dict[str, Any]) -> str:
        return (
            (claims.get('preferred_username') or '').strip()
            or (claims.get('email') or '').strip()
            or super().get_username(claims)
        )

    def filter_users_by_claims(self, claims: dict[str, Any]):
        username = self.get_username(claims)
        email = (claims.get('email') or '').strip()

        if username:
            users = User.objects.filter(username__iexact=username)
            if users.exists():
                return users

        if email:
            return User.objects.filter(email__iexact=email)

        return User.objects.none()

    def create_user(self, claims: dict[str, Any]):
        email = (claims.get('email') or '').strip()
        username = self.get_username(claims)
        if not username:
            raise ValueError('OIDC claims do not include a usable username/email.')

        user = User.objects.create_user(
            username=username[:150],
            email=email,
            first_name=(claims.get('given_name') or '').strip(),
            last_name=(claims.get('family_name') or '').strip(),
        )

        profile, _ = UserProfile.objects.get_or_create(user=user)
        employee_number = (
            claims.get('employee_number')
            or claims.get('employeeNumber')
            or ''
        ).strip()
        if employee_number:
            profile.employee_number = employee_number
        profile.save(update_fields=['employee_number'])
        # must_change_password stays True (creation signal): every new portal
        # user changes their password at first login, however they were made.
        user.profile = profile
        return user

    def update_user(self, user, claims):
        email = (claims.get('email') or '').strip()
        username = self.get_username(claims)
        if email:
            user.email = email
        if username:
            user.username = username
        user.first_name = (claims.get('given_name') or '').strip()
        user.last_name = (claims.get('family_name') or '').strip()
        user.save(update_fields=['username', 'email', 'first_name', 'last_name'])

        profile, _ = UserProfile.objects.get_or_create(user=user)
        employee_number = (
            claims.get('employee_number')
            or claims.get('employeeNumber')
            or ''
        ).strip()
        if employee_number:
            profile.employee_number = employee_number
        profile.save(update_fields=['employee_number'])
        user.profile = profile
        return user
