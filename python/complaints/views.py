"""Ward-scoped complaint gateway.

Reads and writes go through Supabase (PostgREST) using the service-role key,
which never leaves Django. Resolution order (PORTAL_PLAN.md §6.7):

    JWT → portal user → UserProfile.ward → Supabase complaints WHERE ward=...

All filtering happens server-side; the browser never sees the service key
nor another councillor's ward.
"""

from django.conf import settings
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import UserProfile, get_active_team
from accounts.permissions import PasswordChangeRequired

from .client import (
    create_complaint, escalate_complaint, fetch_complaints_for_ward,
    fetch_replies_for_complaint,
)
from .serializers import (
    ComplaintCreateSerializer, ComplaintEscalateSerializer,
    ReportReplySerializer,
)

GATEWAY_UNCONFIGURED = 'Complaints gateway is not configured.'


def _profile_for(request):
    """The caller's profile, always re-read so a stale ward is never used."""
    UserProfile.objects.get_or_create(user=request.user)
    return UserProfile.objects.get(user=request.user)


def reporter_name(user):
    """Who the CMS should show as having logged this complaint.

    Includes the username in brackets so a complaint can be traced back to a
    portal account — the Supabase identity columns are uuids the portal does
    not own, so this text column is the only place the link can live.
    """
    full = f'{user.first_name} {user.last_name}'.strip()
    if full and user.username:
        return f'{full} ({user.username})'
    return full or user.username


class ComplaintViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated, PasswordChangeRequired]

    def list(self, request):
        """Complaints belonging to the requesting user's ward."""
        profile = _profile_for(request)

        if not (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY):
            return Response(
                {'detail': GATEWAY_UNCONFIGURED},
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

    def create(self, request):
        """Log a new complaint against the caller's ward."""
        profile = _profile_for(request)
        if profile.ward is None:
            return Response(
                {'detail': 'Set your ward before logging a complaint.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ComplaintCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Column names and value spellings mirror the live Supabase schema:
        # status defaults to 'submitted', priority is normal|urgent, and
        # received_via is constrained to website|app|phone|whatsapp by
        # complaints_received_via_check. The portal runs in a browser, so
        # 'website' is the honest value.
        #
        # Attribution: `user_id` and `logged_by` are both uuid columns, and
        # `user_id` is a FK to Supabase's own `profiles.id`. A portal user has
        # no Supabase auth uuid, so writing Django's integer id there is
        # rejected with 22P02. `caller_name` is the text column the CMS
        # already uses for "who reported this", so the councillor goes there.
        fields = {
            'title': data['title'],
            'description': data['description'],
            'category': data['category'],
            'ward_number': str(profile.ward),
            'location_address': data['location_address'],
            'caller_name': reporter_name(request.user),
            'priority': data['priority'],
            'status': 'submitted',
            'received_via': 'website',
        }
        for optional in ('issue_type', 'assigned_department'):
            if data.get(optional):
                fields[optional] = data[optional]

        complaint, error = create_complaint(fields)
        if error:
            return Response(
                {'detail': error['detail']},
                status=error['status'],
            )
        return Response(complaint, status=status.HTTP_201_CREATED)

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

    @action(detail=True, methods=['post'])
    def escalate(self, request, pk=None):
        """Escalate a ward complaint that has been open beyond the window.

        The 72-hour rule is enforced here, not in the browser: the button is
        only a hint about what the server will allow.
        """
        profile = _profile_for(request)
        if profile.ward is None:
            return Response(
                {'detail': 'Set your ward before escalating a complaint.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = ComplaintEscalateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        complaint, error = escalate_complaint(
            pk, profile.ward, serializer.validated_data['reason'],
        )
        if error:
            return Response({'detail': error['detail']}, status=error['status'])
        return Response(complaint)
