"""Backfill placeholder identity data so unique constraints can be enforced.

Why this exists
---------------
`cell_number` and `employee_number` are unique *and* optional. SQL treats NULL
as distinct, so any number of users may omit them — but that means unique
constraints never see those rows at all. When you want the constraint to cover
*every* user (or you are preparing to make a column required), the NULLs must
first be filled with real, unique values.

This command generates deterministic placeholder values:

    cell_number     0820 + zero-padded user id   -> 10 digits, starts with 0
    employee_number S    + zero-padded user id   -> 'S' + 6 digits (7 chars max)

Both are checked against existing values and bumped with a numeric suffix if a
collision would occur, so the command is safe to re-run.

Usage
-----
    manage.py backfill_identity_data --dry-run
    manage.py backfill_identity_data
    manage.py backfill_identity_data --username-from-cell
    manage.py backfill_identity_data --only admin,manager

WARNING
-------
`--username-from-cell` RENAMES users, which changes their login credential.
It is refused for superusers and staff, and it is off by default.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.models import UserProfile

User = get_user_model()

CELL_PREFIX = '0820'
EMP_PREFIX = 'S'


class Command(BaseCommand):
    help = 'Fill NULL cell/employee numbers with unique placeholder values.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Report what would change without writing anything.',
        )
        parser.add_argument(
            '--only', default='',
            help='Comma-separated usernames to limit the run to.',
        )
        parser.add_argument(
            '--username-from-cell', action='store_true',
            help='Also rename non-privileged users to their cell number '
                 '(changes their login credential).',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        only = {u.strip() for u in options['only'].split(',') if u.strip()}
        rename = options['username_from_cell']

        # Renaming is destructive (it changes the login credential), so it must
        # be aimed at specific accounts rather than applied to everyone.
        if rename and not only:
            raise CommandError(
                '--username-from-cell requires --only <usernames>. '
                'Renaming every account to a phone number would lock out '
                'anyone who chose their own username.\n'
                'Example: --only alice,bob --username-from-cell'
            )

        users = User.objects.select_related('profile').order_by('id')
        if only:
            users = users.filter(username__in=only)
            found = {u.username for u in users}
            for missing in sorted(only - found):
                self.stderr.write(f'Not found: {missing}')

        # Seed the "taken" sets with everything already in the database so the
        # generated values never collide with real data.
        taken_cells = set(
            UserProfile.objects.exclude(cell_number__isnull=True)
            .values_list('cell_number', flat=True)
        )
        taken_emps = set(
            UserProfile.objects.exclude(employee_number__isnull=True)
            .values_list('employee_number', flat=True)
        )
        taken_usernames = set(User.objects.values_list('username', flat=True))

        filled_cells = filled_emps = renamed = 0
        skipped = 0

        with transaction.atomic():
            for user in users:
                profile, _ = UserProfile.objects.get_or_create(user=user)
                changed = []

                if not profile.cell_number:
                    value = self._next_cell(user.id, taken_cells)
                    taken_cells.add(value)
                    profile.cell_number = value
                    changed.append(f'cell={value}')
                    filled_cells += 1

                if not profile.employee_number:
                    value = self._next_employee(user.id, taken_emps)
                    taken_emps.add(value)
                    profile.employee_number = value
                    changed.append(f'emp={value}')
                    filled_emps += 1

                if changed:
                    if not dry_run:
                        profile.save(update_fields=[
                            'cell_number', 'employee_number',
                        ])
                    self.stdout.write(
                        f'  {user.username:<24} {"  ".join(changed)}')
                else:
                    skipped += 1

                # Optional rename — never for privileged accounts.
                if rename and not user.is_superuser and not user.is_staff:
                    new_name = profile.cell_number
                    if new_name and new_name != user.username:
                        if new_name in taken_usernames:
                            self.stderr.write(
                                f'  {user.username}: cannot rename to '
                                f'{new_name} (username taken)')
                        else:
                            taken_usernames.discard(user.username)
                            taken_usernames.add(new_name)
                            if not dry_run:
                                user.username = new_name
                                user.save(update_fields=['username'])
                            renamed += 1
                            self.stdout.write(
                                f'    renamed {user.username} -> {new_name}')

            if dry_run:
                transaction.set_rollback(True)

        verb = 'would fill' if dry_run else 'filled'
        self.stdout.write(self.style.SUCCESS(
            f'\n{verb} {filled_cells} cell + {filled_emps} employee number(s); '
            f'{renamed} renamed; {skipped} already complete.'
        ))
        if dry_run:
            self.stdout.write('Dry run — nothing was written.')
        if rename:
            self.stdout.write(self.style.WARNING(
                'Users renamed to cell numbers must sign in with the new '
                'username from now on.'
            ))

    # ── generators ───────────────────────────────────────────────────────

    @staticmethod
    def _next_cell(user_id: int, taken: set[str]) -> str:
        """0820 + 6 digits, e.g. user 11 -> 0820000011 (10 chars)."""
        candidate = f'{CELL_PREFIX}{user_id:06d}'
        suffix = 0
        while candidate in taken:
            suffix += 1
            # Keep 10 digits by consuming digits from the id padding.
            candidate = f'{CELL_PREFIX}{user_id:06d}'[:10 - len(str(suffix))]
            candidate += str(suffix)
        return candidate

    @staticmethod
    def _next_employee(user_id: int, taken: set[str]) -> str:
        """S + 6 digits, e.g. user 11 -> S000011 (7 chars)."""
        candidate = f'{EMP_PREFIX}{user_id:06d}'
        suffix = 0
        while candidate in taken:
            suffix += 1
            candidate = f'{EMP_PREFIX}{user_id:06d}'
            candidate = candidate[:7 - len(str(suffix))] + str(suffix)
        return candidate
