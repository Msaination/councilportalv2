"""Mirror portal users into Authentik (SSO broker) — PORTAL_PLAN.md §6.5.

Usage:
    manage.py provision_authentik_users            # everyone
    manage.py provision_authentik_users alice bob   # a subset

Existing users are updated in Authentik (no passwords touched — Authentik
owns credentials, Option A). Only explicitly created users get passwords via
the portal's normal create flow.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from accounts.authentik import provision_user

User = get_user_model()


class Command(BaseCommand):
    help = 'Push portal users into Authentik so they can use Council SSO.'

    def add_arguments(self, parser):
        parser.add_argument(
            'usernames', nargs='*',
            help='Usernames to provision (default: all users).',
        )

    def handle(self, *args, **options):
        usernames = options['usernames']
        queryset = (
            User.objects.filter(username__in=usernames).order_by('username')
            if usernames else User.objects.order_by('username')
        )
        if usernames:
            found = set(queryset.values_list('username', flat=True))
            for missing in set(usernames) - found:
                self.stderr.write(f'Not found: {missing}')

        ok = failed = 0
        for user in queryset:
            pk = provision_user(user)
            if pk:
                ok += 1
                self.stdout.write(f'  {user.username} → authentik pk {pk}')
            else:
                failed += 1

        self.stdout.write(self.style.SUCCESS(
            f'Provisioned {ok} user(s); {failed} failed/skipped.',
        ))