"""Import the gazetted councillor roster (MP312) as portal users.

Usage:
    manage.py import_councillors tmp/MP312.csv --dry-run
    manage.py import_councillors tmp/MP312.csv
    manage.py import_councillors tmp/MP312.csv --group Councillors
    manage.py import_councillors tmp/MP312.csv --update-existing

The CSV is produced from the Municipal Demarcation Board gazette (see
PORTAL_PLAN.md §7). Column contract:
    full_name, surname, first_names, party, representation,
    ward_code, ward_number, pr_seat, capacity, source_line

Design notes
------------
* Idempotent: a councillor already present (matched on the normalised
  "surname first_names") is skipped unless --update-existing is passed.
* Usernames are derived deterministically from the name and de-duplicated
  with a numeric suffix, so re-running never produces a second account.
* No emails or employee numbers exist in the gazette. Both are left blank;
  they can be filled later via /dashboard/access.
* `party` is stored as a plain column, never as a Django group: groups are
  content-role ACL carriers (PORTAL_PLAN.md §Access Model).
"""

from __future__ import annotations

import csv
from dataclasses import dataclass

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from accounts.models import UserProfile

User = get_user_model()

# Keep in sync with settings.DEFAULT_NEW_USER_PASSWORD.
FALLBACK_PASSWORD = '#ECOP26-31'

REQUIRED_COLUMNS = {
    'full_name', 'surname', 'first_names', 'party',
    'representation', 'ward_number', 'pr_seat',
}


@dataclass
class Row:
    full_name: str
    surname: str
    first_names: str
    party: str
    representation: str
    ward_number: int | None
    pr_seat: int | None
    ward_code: str


def norm(value: str | None) -> str:
    """Collapse whitespace and uppercase for comparison."""
    return ' '.join((value or '').split()).upper()


def to_int(value: str | None):
    """Parse an optional integer cell."""
    value = (value or '').strip()
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None


class Command(BaseCommand):
    help = 'Import councillors from the MP312 gazette CSV.'

    def add_arguments(self, parser):
        parser.add_argument('csv_path', help='Path to the MP312 CSV file.')
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Validate and report without writing anything.',
        )
        parser.add_argument(
            '--update-existing', action='store_true',
            help='Refresh party/ward/representation for users already imported.',
        )
        parser.add_argument(
            '--group',
            help='Django group to add every imported councillor to '
                 '(e.g. Councillors). Must already exist.',
        )

    def handle(self, *args, **options):
        path = options['csv_path']
        dry_run = options['dry_run']
        update_existing = options['update_existing']
        group_name = options['group']

        group = None
        if group_name:
            from django.contrib.auth.models import Group
            try:
                group = Group.objects.get(name=group_name)
            except Group.DoesNotExist:
                raise CommandError(f'Group "{group_name}" does not exist.')

        rows, errors = self._read_rows(path)
        if errors:
            self.stderr.write(self.style.ERROR(
                f'{len(errors)} row(s) failed validation:'))
            for line, message in errors:
                self.stderr.write(f'  line {line}: {message}')
            raise CommandError('Aborting — fix the CSV first.')

        password = getattr(
            settings, 'DEFAULT_NEW_USER_PASSWORD', FALLBACK_PASSWORD,
        )

        created = updated = skipped = 0
        seen_usernames: set[str] = set()

        with transaction.atomic():
            for row in rows:
                existing = self._find_existing(row)

                if existing and not update_existing:
                    skipped += 1
                    self.stdout.write(
                        f'  skip   {row.full_name}  (user: {existing.username})')
                    continue

                if existing:
                    self._apply_profile(existing, row)
                    updated += 1
                    self.stdout.write(
                        f'  update {row.full_name}  (user: {existing.username})')
                    continue

                username = self._unique_username(row, seen_usernames)
                seen_usernames.add(username)

                if dry_run:
                    created += 1
                    self.stdout.write(
                        f'  create {row.full_name}  →  {username} '
                        f'[{row.representation}'
                        f'{f" {row.ward_number}" if row.ward_number else ""}'
                        f'{f" seat {row.pr_seat}" if row.pr_seat else ""}]')
                    continue

                user = User.objects.create_user(
                    username=username,
                    email='',
                    password=password,
                    first_name=row.first_names.title(),
                    last_name=row.surname.title(),
                )
                profile, _ = UserProfile.objects.get_or_create(user=user)
                profile.must_change_password = True
                if group:
                    user.groups.add(group)
                self._apply_profile(user, row)
                created += 1
                self.stdout.write(
                    f'  create {row.full_name}  →  {username}')

            if dry_run:
                transaction.set_rollback(True)

        verb = 'would create' if dry_run else 'created'
        self.stdout.write(self.style.SUCCESS(
            f'\n{verb} {created}, updated {updated}, skipped {skipped} '
            f'(of {len(rows)} rows).'
        ))
        if dry_run:
            self.stdout.write('Dry run — nothing was written.')

    # ── helpers ──────────────────────────────────────────────────────────

    def _read_rows(self, path):
        try:
            handle = open(path, newline='', encoding='utf-8-sig')
        except OSError as exc:
            raise CommandError(f'Cannot read {path}: {exc}')

        rows: list[Row] = []
        errors: list[tuple[int, str]] = []

        with handle:
            reader = csv.DictReader(handle)
            missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
            if missing:
                raise CommandError(
                    f'CSV is missing required column(s): {sorted(missing)}')

            for line, raw in enumerate(reader, start=2):
                surname = norm(raw.get('surname'))
                first_names = norm(raw.get('first_names'))
                if not surname:
                    errors.append((line, 'missing surname'))
                    continue

                representation = norm(raw.get('representation')).lower()
                if representation not in ('ward', 'pr'):
                    errors.append((line, f'bad representation {representation!r}'))
                    continue

                ward_number = to_int(raw.get('ward_number'))
                pr_seat = to_int(raw.get('pr_seat'))

                if representation == 'ward' and ward_number is None:
                    errors.append((line, 'ward councillor without ward_number'))
                    continue
                if representation == 'pr' and pr_seat is None:
                    errors.append((line, 'PR councillor without pr_seat'))
                    continue

                rows.append(Row(
                    full_name=norm(raw.get('full_name'))
                    or f'{surname} {first_names}'.strip(),
                    surname=surname,
                    first_names=first_names,
                    party=norm(raw.get('party')),
                    representation=representation,
                    ward_number=ward_number if representation == 'ward' else None,
                    pr_seat=pr_seat if representation == 'pr' else None,
                    ward_code=(raw.get('ward_code') or '').strip(),
                ))

        return rows, errors

    def _find_existing(self, row: Row):
        """Match on the normalised name, case-insensitively."""
        first = row.first_names.split()[0] if row.first_names else ''
        candidates = User.objects.filter(
            last_name__iexact=row.surname.title(),
            first_name__istartswith=first.title() if first else '',
        ).select_related('profile')
        return candidates.first() if first else None

    def _apply_profile(self, user, row: Row):
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.political_party = row.party
        profile.representation = row.representation
        profile.ward = row.ward_number
        profile.pr_seat = row.pr_seat
        profile.ward_code = row.ward_code
        profile.must_change_password = True
        profile.save(update_fields=[
            'political_party', 'representation', 'ward',
            'pr_seat', 'ward_code', 'must_change_password',
        ])

    @staticmethod
    def _unique_username(row: Row, seen: set[str]) -> str:
        """surname + first initial, e.g. 'sithole' -> 'sithole', 'sithole-s'."""
        base = slugify(row.surname) or 'councillor'
        candidate = base
        if candidate in seen or User.objects.filter(
                username__iexact=candidate).exists():
            initial = slugify(row.first_names[:1]) or 'x'
            candidate = f'{base}-{initial}'
            suffix = 1
            while (candidate in seen
                   or User.objects.filter(username__iexact=candidate).exists()):
                suffix += 1
                candidate = f'{base}-{initial}{suffix}'
        return candidate
