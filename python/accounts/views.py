"""Committee workspace API: list, create, members, and switching."""

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import (
    action, api_view, parser_classes, permission_classes,
)
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from .models import Membership, Team, UserProfile
from .permissions import (
    CanEditEmployeeNumbers, CanViewTeams, PasswordChangeRequired,
)
from .serializers import (
    CAPABILITY_PERMISSIONS, ChangePasswordSerializer, MembershipSerializer,
    ProfileSerializer, TeamSerializer, UserAccessSerializer, UserCreateSerializer,
)

User = get_user_model()

# Read from settings so each environment can override the bootstrap password.
DEFAULT_NEW_USER_PASSWORD = getattr(
    settings, 'DEFAULT_NEW_USER_PASSWORD', '#ECOP26-31',
)


class TeamViewSet(viewsets.ModelViewSet):
    """Committees the requesting user belongs to."""
    serializer_class = TeamSerializer
    permission_classes = [
        permissions.IsAuthenticated, PasswordChangeRequired,
    ]
    lookup_field = 'slug'

    def get_queryset(self):
        qs = Team.objects.prefetch_related('memberships__user')
        if self.request.user.is_staff:
            return qs
        return qs.filter(memberships__user=self.request.user).distinct()

    def _membership(self, team):
        return team.memberships.filter(user=self.request.user).first()

    def _can_manage(self, team):
        """Only owners/admins (or staff) can mutate committee membership."""
        membership = self._membership(team)
        return self.request.user.is_staff or bool(
            membership and membership.can_manage,
        )

    def perform_create(self, serializer):
        team = serializer.save(created_by=self.request.user)
        Membership.objects.create(
            team=team, user=self.request.user, role=Membership.Role.OWNER,
        )
        profile, _ = UserProfile.objects.get_or_create(user=self.request.user)
        if profile.active_team_id is None:
            profile.active_team = team
            profile.save(update_fields=['active_team'])
        # Keep the reverse relation cache in sync with the saved profile
        self.request.user.profile = profile

    def update(self, request, *args, **kwargs):
        if not self._can_manage(self.get_object()):
            return Response({'detail': 'Not allowed.'},
                            status=status.HTTP_403_FORBIDDEN)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Delete a committee and its resources — owner or staff only."""
        team = self.get_object()
        membership = self._membership(team)
        is_owner = membership and membership.role == Membership.Role.OWNER
        if not (request.user.is_staff or is_owner):
            return Response({'detail': 'Only the owner can delete a committee.'},
                            status=status.HTTP_403_FORBIDDEN)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['get', 'post'], url_path='members')
    def members(self, request, slug=None):
        team = self.get_object()
        if request.method == 'GET':
            return Response(MembershipSerializer(
                team.memberships.select_related('user').all(), many=True,
            ).data)

        if not self._can_manage(team):
            return Response({'detail': 'Not allowed.'},
                            status=status.HTTP_403_FORBIDDEN)
        username = (request.data.get('username') or '').strip()
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({'error': 'User not found.'},
                            status=status.HTTP_404_NOT_FOUND)

        membership, created = Membership.objects.get_or_create(
            team=team, user=user,
        )
        return Response(
            MembershipSerializer(membership).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=['delete'],
            url_path=r'members/(?P<user_id>\d+)')
    def remove_member(self, request, slug=None, user_id=None):
        team = self.get_object()
        if not self._can_manage(team):
            return Response({'detail': 'Not allowed.'},
                            status=status.HTTP_403_FORBIDDEN)
        if int(user_id) == request.user.id:
            return Response({'error': 'You cannot remove yourself.'},
                            status=status.HTTP_400_BAD_REQUEST)

        deleted, _ = Membership.objects.filter(
            team=team, user_id=user_id,
        ).delete()
        if not deleted:
            return Response({'error': 'Member not found.'},
                            status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='switch')
    def switch(self, request, slug=None):
        """Make this committee the user's active workspace."""
        team = self.get_object()
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.active_team = team
        profile.save(update_fields=['active_team'])
        return Response(self.get_serializer(team).data)


class UserAccessViewSet(mixins.ListModelMixin,
                        mixins.CreateModelMixin,
                        mixins.UpdateModelMixin,
                        viewsets.GenericViewSet):
    """Superadmin manages users/capabilities; editors manage employee numbers."""
    serializer_class = UserAccessSerializer
    permission_classes = [CanEditEmployeeNumbers, PasswordChangeRequired]
    queryset = User.objects.order_by('username')
    http_method_names = ['get', 'post', 'patch', 'put', 'head', 'options']

    def create(self, request, *args, **kwargs):
        """Create a user with the default password and a forced change."""
        if not request.user.is_superuser:
            return Response(
                {'detail': 'Only the superadmin can create users.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = User.objects.create_user(
            username=data['username'],
            email=data.get('email') or '',
            password=DEFAULT_NEW_USER_PASSWORD,
            first_name=data.get('first_name') or '',
            last_name=data.get('last_name') or '',
        )
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.employee_number = data.get('employee_number') or None
        profile.cell_number = data.get('cell_number') or None
        profile.must_change_password = True
        profile.save(update_fields=[
            'employee_number', 'cell_number', 'must_change_password',
        ])
        user.refresh_from_db()
        # The post_save signal already mirrored this user (with the default
        # password's hash) to Authentik, so Council SSO works immediately.

        return Response(
            UserAccessSerializer(
                user, context=self.get_serializer_context(),
            ).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        if (not request.user.is_superuser and
                set(CAPABILITY_PERMISSIONS) & set(request.data)):
            return Response(
                {'detail': 'Only the superadmin can change capabilities.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)


# ─── Public config ──────────────────────────────────────────

@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def auth_config(request):
    """Capabilities the login screen needs to know before authenticating.

    Kept server-side so the SSO button can be switched on per environment by
    setting OIDC_ISSUER / OIDC_CLIENT_ID — no frontend rebuild required. A
    NEXT_PUBLIC_* flag would be baked in at build time and could not follow the
    backend's configuration.
    """
    sso_enabled = bool(settings.OIDC_ISSUER and settings.OIDC_CLIENT_ID)
    return Response({
        'sso_enabled': sso_enabled,
        # Only advertise the path when it will actually resolve.
        'sso_login_url': (
            request.build_absolute_uri('/api/auth/oidc/authenticate/')
            if sso_enabled else None
        ),
    })


# ─── Own profile ────────────────────────────────────────────

@api_view(['GET', 'PATCH'])
@permission_classes([permissions.IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def my_profile(request):
    """Read or update the requesting user's own profile."""
    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    request.user.profile = profile

    if request.method == 'GET':
        return Response(ProfileSerializer(
            request.user, context={'request': request},
        ).data)

    serializer = ProfileSerializer(
        request.user, data=request.data, partial=True,
        context={'request': request},
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()  # accounts.signals mirrors identity to Authentik
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def change_password(request):
    """Change the requesting user's password (requires current password)."""
    serializer = ChangePasswordSerializer(
        data=request.data, context={'request': request},
    )
    serializer.is_valid(raise_exception=True)
    request.user.set_password(serializer.validated_data['new_password'])
    request.user.save(update_fields=['password'])
    # accounts.signals mirrors the new hash to Authentik automatically.

    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    request.user.profile = profile
    if profile.must_change_password:
        profile.must_change_password = False
        profile.save(update_fields=['must_change_password'])
        request.user.profile = profile

    return Response({'detail': 'Password updated.'})
