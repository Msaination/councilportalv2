"""Signals that keep every user paired with a profile row, and keep
Authentik (the SSO broker) mirroring the portal's identities.
"""

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from .authentik import provision_user
from .models import UserProfile

# A save that only touches this field is a login timestamp, not an identity or
# credential change — never worth a broker round-trip.
LOGIN_ONLY_FIELDS = {'last_login'}


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        # Every new user — regardless of where they were created (portal API,
        # Django admin, shell) — must change their password at first login.
        UserProfile.objects.get_or_create(
            user=instance,
            defaults={'must_change_password': True},
        )


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def mirror_user_to_authentik(sender, instance, created, **kwargs):
    """Push identity + password hash into Authentik on every portal save.

    This single hook covers all credential paths (portal change-password,
    Django admin's separate "set password" view, shell edits) — PORTAL_PLAN
    §6.5: the portal is the source of truth; one save mirrors everywhere.
    """
    if kwargs.get('raw'):  # loaddata/fixtures
        return
    update_fields = kwargs.get('update_fields')
    if update_fields is not None and set(update_fields) <= LOGIN_ONLY_FIELDS:
        return
    provision_user(
        instance,
        password_hash=instance.password if instance.has_usable_password()
        else None,
    )
