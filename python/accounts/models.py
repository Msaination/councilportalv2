"""Teams, memberships, and per-user workspace selection."""

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


class Team(models.Model):
    """A workspace whose categories and files are isolated from other teams."""
    name = models.CharField(max_length=120)
    slug = models.SlugField(unique=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='created_teams',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        permissions = [
            ('view_teams', 'Can view teams and their members'),
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
        unique_together = ('team', 'user')
        ordering = ['joined_at']

    def __str__(self):
        return f'{self.user} in {self.team} ({self.role})'

    @property
    def can_manage(self):
        return self.role in (self.Role.OWNER, self.Role.ADMIN)


class UserProfile(models.Model):
    """Tracks which team a user is currently working in, plus their profile."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='profile',
    )
    active_team = models.ForeignKey(
        Team, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='active_profiles',
    )
    cell_number = models.CharField(
        max_length=10, blank=True, validators=[CELL_NUMBER_VALIDATOR],
    )
    employee_number = models.CharField(
        max_length=7, unique=True, null=True, blank=True,
        validators=[EMPLOYEE_NUMBER_VALIDATOR],
    )
    bio = models.TextField(max_length=500, blank=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True)
    must_change_password = models.BooleanField(default=False)

    class Meta:
        permissions = [
            ('edit_employee_numbers', 'Can edit employee numbers'),
        ]

    def __str__(self):
        return f'Profile of {self.user}'


def get_active_team(user):
    """Return the user's selected team, falling back to first membership."""
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
