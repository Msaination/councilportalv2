"""Council meetings shown in the portal calendar."""

from django.conf import settings
from django.db import models


class Meeting(models.Model):
    """A scheduled meeting, optionally scoped to a team and attendees."""
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    location = models.CharField(max_length=200, blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)

    team = models.ForeignKey(
        'accounts.Team', null=True, blank=True, on_delete=models.CASCADE,
        related_name='meetings',
        help_text='Blank means the meeting is visible to every team.',
    )
    category = models.ForeignKey(
        'documents.Category', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='meetings',
        help_text='Optional collection this meeting belongs to.',
    )
    file = models.ForeignKey(
        'documents.StoredFile', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='meetings',
        help_text='Optional document this meeting links to.',
    )
    attendees = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name='meetings',
    )
    groups = models.ManyToManyField(
        'auth.Group', blank=True, related_name='meetings',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='created_meetings',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['starts_at']

    def __str__(self):
        return f'{self.title} — {self.starts_at:%Y-%m-%d %H:%M}'

    def is_visible_to(self, user):
        """Team-scoped meetings are team-only; empty ACL means open."""
        if user.is_superuser or user.is_staff:
            return True
        if (self.team_id and not
                user.team_memberships.filter(team_id=self.team_id).exists()):
            return False
        if not self.attendees.exists() and not self.groups.exists():
            return True
        if self.attendees.filter(pk=user.pk).exists():
            return True
        return self.groups.filter(pk__in=user.groups.all()).exists()

    def is_mine(self, user):
        """True when the meeting is targeted at this user."""
        if (self.team_id and
                user.team_memberships.filter(team_id=self.team_id).exists()):
            return True
        if self.attendees.filter(pk=user.pk).exists():
            return True
        return self.groups.filter(pk__in=user.groups.all()).exists()
