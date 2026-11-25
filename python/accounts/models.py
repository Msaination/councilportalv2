"""Committee memberships and per-user workspace selection."""

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models
from django.utils.text import slugify

CELL_NUMBER_VALIDATOR = RegexValidator(
    regex=r'^0\d{9}$',
    message='Cell number must be exactly 10 digits starting with 0.',
)

EMPLOYEE_NUMBER_VALIDATOR = RegexValidator(
    regex=r'^S[A-Za-z0-9]{1,6}$',
    message='Employee number must start with S and be at most 7 characters.',
)

# Gazette party names that do not abbreviate cleanly from their initials,
# either because the initials are already taken or because the gazette
# spells the party out in full. Anything absent falls back to initials.
PARTY_ABBREVIATIONS = {
    'AFRICAN NATIONAL CONGRESS': 'ANC',
    'ACTIONSA': 'ACT',
    'DEMOCRATIC ALLIANCE': 'DA',
    'UMKHONTO WESIZWE PARTY': 'MK',
    'ECONOMIC FREEDOM FIGHTERS': 'EFF',
    'VRYHEIDSFRONT PLUS | FREEDOM FRONT PLUS': 'VF+',
    'SERVICE DELIVERY PARTY': 'SDP',
    'SOUTH AFRICAN COMMUNIST PARTY': 'SACP',
    'LABOUR PARTY OF SOUTH AFRICA': 'LP',
    'INKATHA FREEDOM PARTY': 'IFP',
    'AFRIKA MAYIBUYE MOVEMENT': 'ATM',
}

# Words that carry no distinguishing meaning in a party name.
_PARTY_STOPWORDS = frozenset({'OF', 'THE', 'AND', 'A', 'FOR', 'SOUTH'})


def abbreviate_party(name):
    """Short form of a gazetted party name, e.g. 'ANC', 'VF+', 'SACP'.

    Known parties use the curated abbreviation; anything else is built from
    the initials of its significant words so new parties need no code change.
    """
    normalised = ' '.join((name or '').split()).upper()
    if not normalised:
        return ''
    known = PARTY_ABBREVIATIONS.get(normalised)
    if known:
        return known
    words = [w for w in normalised.split() if w not in _PARTY_STOPWORDS]
    return ''.join(w[0] for w in words)


class Team(models.Model):
    """A committee workspace whose resource categories and files are isolated."""
    name = models.CharField(max_length=120)
    slug = models.SlugField(unique=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='created_teams',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Committee'
        verbose_name_plural = 'Committees'
        ordering = ['name']
        permissions = [
            ('view_teams', 'Can view committees and their members'),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = self._unique_slug()
        super().save(*args, **kwargs)

    def _unique_slug(self):
        base = slugify(self.name) or 'team'
        slug = base
        suffix = 1
        while Team.objects.filter(slug=slug).exclude(pk=self.pk).exists():
            suffix += 1
            slug = f'{base}-{suffix}'
        return slug


class Membership(models.Model):
    class Role(models.TextChoices):
        OWNER = 'owner', 'Owner'
        ADMIN = 'admin', 'Admin'
        MEMBER = 'member', 'Member'

    team = models.ForeignKey(
        Team, on_delete=models.CASCADE, related_name='memberships',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='team_memberships',
    )
    role = models.CharField(
        max_length=10, choices=Role.choices, default=Role.MEMBER,
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Committee membership'
        verbose_name_plural = 'Committee memberships'
        unique_together = ('team', 'user')
        ordering = ['joined_at']

    def __str__(self):
        return f'{self.user} in {self.team} ({self.role})'

    @property
    def can_manage(self):
        return self.role in (self.Role.OWNER, self.Role.ADMIN)


class UserProfile(models.Model):
    """Tracks which team a user is currently working in, plus their profile."""

    class Representation(models.TextChoices):
        WARD = 'ward', 'Ward councillor'
        PR = 'pr', 'Proportional representation'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='profile',
    )
    active_team = models.ForeignKey(
        Team, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='active_profiles',
    )
    cell_number = models.CharField(
        max_length=10, null=True, blank=True,
        validators=[CELL_NUMBER_VALIDATOR],
        help_text='SA mobile number: 10 digits starting with 0.',
    )
    employee_number = models.CharField(
        max_length=7, null=True, blank=True,
        validators=[EMPLOYEE_NUMBER_VALIDATOR],
    )
    bio = models.TextField(max_length=500, blank=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True)
    must_change_password = models.BooleanField(default=False)
    # Ward councillor's ward — the join key to the Complaint Management
    # System (PORTAL_PLAN.md §6.7): complaints are keyed by ward in
    # Supabase; the portal owns this assignment like employee_number.
    ward = models.PositiveSmallIntegerField(
        null=True, blank=True,
        help_text='Municipal ward number this user represents (if any).',
    )

    # ── Councillor identity (source: MP312 government gazette) ────────────
    # These describe *who the person is*, never what they may access.
    # Deliberately plain columns — NOT Django groups, which are content
    # roles consumed by Category.access_groups (PORTAL_PLAN.md §Access Model).
    political_party = models.CharField(
        max_length=120, blank=True,
        help_text='Political party as gazetted, '
                  'e.g. "AFRICAN NATIONAL CONGRESS".',
    )
    representation = models.CharField(
        max_length=4, choices=Representation.choices, blank=True,
        help_text='Ward seat or proportional-representation seat.',
    )
    pr_seat = models.PositiveSmallIntegerField(
        null=True, blank=True,
        help_text='Position on the party PR list (PR councillors only).',
    )
    ward_code = models.CharField(
        max_length=8, blank=True,
        help_text='IEC ward code from the gazette, e.g. "83102001" '
                  '(audit / re-import key only).',
    )
    capacity = models.CharField(
        max_length=20, blank=True,
        help_text='Gazetted capacity, e.g. "LC" (local councillor).',
    )

    class Meta:
        verbose_name = 'User profile'
        verbose_name_plural = 'User profiles'
        permissions = [
            ('edit_employee_numbers', 'Can edit employee numbers'),
        ]
        constraints = [
            # A PR seat number is meaningless for a ward councillor. Existing
            # rows hold NULL, so this is additive and safe.
            models.CheckConstraint(
                condition=(
                    models.Q(pr_seat__isnull=True)
                    | models.Q(representation='pr')
                ),
                name='pr_seat_requires_pr_representation',
            ),
            # Identity columns are unique *when present*. They are nullable so
            # that any number of users may omit them (gazetted councillors
            # carry no cell/employee number); SQL treats NULLs as distinct,
            # whereas two '' values would collide.
            models.UniqueConstraint(
                fields=['employee_number'],
                name='unique_employee_number',
            ),
            models.UniqueConstraint(
                fields=['cell_number'],
                name='unique_cell_number',
            ),
        ]

    def __str__(self):
        return f'Profile of {self.user}'

    @property
    def party_abbreviation(self):
        """Short party form for compact tables, e.g. 'ANC'."""
        return abbreviate_party(self.political_party)

    def save(self, *args, **kwargs):
        # `unique` columns together with optional values would clash on ''
        # (two blank cells are equal). Store absence as NULL instead — SQL
        # treats NULLs as distinct, so any number of users may omit these.
        for field in ('cell_number', 'employee_number'):
            value = getattr(self, field)
            if value is not None:
                value = value.strip()
                setattr(self, field, value or None)
        super().save(*args, **kwargs)


def get_active_team(user):
    """Return the user's selected committee, falling back to their first membership."""
    if not user.is_authenticated:
        return None
    profile, _ = UserProfile.objects.get_or_create(user=user)
    user.profile = profile  # keep reverse relation cache in sync
    if (profile.active_team_id and
            user.team_memberships.filter(team_id=profile.active_team_id).exists()):
        return profile.active_team

    membership = user.team_memberships.select_related('team').first()
    if membership is None:
        return None
    profile.active_team = membership.team
    profile.save(update_fields=['active_team'])
    return membership.team
