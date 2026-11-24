"""GET /api/complaints/ — the logged-in councillor's ward complaints.

Resolution order (PORTAL_PLAN.md §6.7):
    JWT → portal user → UserProfile.ward → Supabase complaints WHERE ward=...
All filtering happens server-side; the browser never sees the service key
nor another councillor's ward.
"""

from django.conf import settings
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from rest_framework import viewsets

from accounts.models import UserProfile, get_active_team
from accounts.permissions import PasswordChangeRequired

from .client import fetch_complaints_for_ward, fetch_replies_for_complaint
from .serializers import ReportReplySerializer


class ComplaintViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated, PasswordChangeRequired]

    def list(self, request):
        """Complaints belonging to the requesting user's ward."""
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        request.user.profile = profile
        request.user.refresh_from_db()
        profile = UserProfile.objects.get(user=request.user)
        request.user.profile = profile

        if not (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY):
            return Response(
                {'detail': 'Complaints gateway is not configured.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if profile.ward is None:
            return Response(
                {
                    'detail': 'No ward is assigned to your profile yet. '
                              'Ask the superadmin to set your ward.',
                    'ward': None,
                    'count': 0,
                    'results': [],
                },
                status=status.HTTP_200_OK,
            )

        complaints = fetch_complaints_for_ward(profile.ward)
        if complaints is None:
            return Response(
                {'detail': 'Complaint system is unreachable right now.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        active_team = get_active_team(request.user)
        return Response({
            'ward': profile.ward,
            'count': len(complaints),
            'results': complaints,
            'team': ({'id': active_team.id, 'name': active_team.name}
                     if active_team else None),
        })

    @action(detail=True, methods=['get'])
    def replies(self, request, pk=None):
        """Replies for a specific complaint."""
        replies = fetch_replies_for_complaint(pk)
        if replies is None:
            return Response(
                {'detail': 'Complaint system is unreachable right now.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        serializer = ReportReplySerializer(replies, many=True)
        return Response(serializer.data)