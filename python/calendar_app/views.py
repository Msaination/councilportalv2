"""Calendar API — meetings list with scope, date, and upcoming filters."""

from datetime import datetime

from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, viewsets
from rest_framework.exceptions import ValidationError

from accounts.permissions import PasswordChangeRequired

from .models import Meeting
from .serializers import MeetingSerializer


class IsStaffOrReadOnly(permissions.BasePermission):
    """Read: any authenticated user. Write: staff only."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return bool(request.user and request.user.is_staff)


class MeetingViewSet(viewsets.ModelViewSet):
    serializer_class = MeetingSerializer
    permission_classes = [
        permissions.IsAuthenticated, PasswordChangeRequired, IsStaffOrReadOnly,
    ]

    def get_queryset(self):
        user = self.request.user
        qs = Meeting.objects.select_related('team').prefetch_related(
            'attendees', 'groups',
        )

        if not (user.is_staff or user.is_superuser):
            team_ids = user.team_memberships.values('team_id')
            qs = qs.filter(
                Q(team__isnull=True) | Q(team_id__in=team_ids),
            ).filter(
                Q(attendees__isnull=True, groups__isnull=True) |
                Q(attendees=user) |
                Q(groups__in=user.groups.all()),
            ).distinct()

        if self.request.query_params.get('scope') == 'mine':
            team_ids = user.team_memberships.values('team_id')
            qs = qs.filter(
                Q(team_id__in=team_ids) |
                Q(attendees=user) |
                Q(groups__in=user.groups.all()),
            ).distinct()

        include_past = self.request.query_params.get('include_past')
        if (self.action == 'list' and
                include_past not in ('1', 'true', 'yes')):
            qs = qs.filter(starts_at__gte=timezone.now())

        date_param = self.request.query_params.get('date')
        if self.action == 'list' and date_param:
            try:
                meeting_date = datetime.strptime(date_param, '%Y-%m-%d').date()
            except ValueError:
                raise ValidationError({
                    'date': 'Use the YYYY-MM-DD format.',
                })
            qs = qs.filter(starts_at__date=meeting_date)

        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
