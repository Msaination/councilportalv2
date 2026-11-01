"""Team / workspace API: list, create, members, and switching."""

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

DEFAULT_NEW_USER_PASSWORD = 'Password#v2cp2026'


class TeamViewSet(viewsets.ModelViewSet):
    """Teams the requesting user belongs to (requires view_teams)."""
    serializer_class = TeamSerializer
    permission_classes = [
        permissions.IsAuthenticated, CanViewTeams, PasswordChangeRequired,
    ]
    lookup_field = 'slug'

    def get_queryset(self):
        qs = Team.objects.prefetch_related('memberships__user')
        if self.request.user.is_staff:
            return qs
        return qs.filter(memberships__user=self.request.user)

    def _membership(self, team):
        return team.memberships.filter(user=self.request.user).first()

    def _can_manage(self, team):
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
        """Delete a team and its assets — owner or staff only."""
        team = self.get_object()
        membership = self._membership(team)
        is_owner = membership and membership.role == Membership.Role.OWNER
        if not (request.user.is_staff or is_owner):
            return Response({'detail': 'Only the owner can delete a team.'},
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
        """Make this team the user's active workspace."""
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
            email=data['email'],
            password=DEFAULT_NEW_USER_PASSWORD,
        )
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.employee_number = data['employee_number']
        profile.must_change_password = True
        profile.save(update_fields=['employee_number', 'must_change_password'])
        user.refresh_from_db()

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


# ─── Own profile ────────────────────────────────────────────

@api_view(['GET', 'PATCH'])
@permission_classes([permissions.IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def my_profile(request):
    """Read or update the requesting user's own profile."""
    UserProfile.objects.get_or_create(user=request.user)

    if request.method == 'GET':
        return Response(ProfileSerializer(
            request.user, context={'request': request},
        ).data)

    serializer = ProfileSerializer(
        request.user, data=request.data, partial=True,
        context={'request': request},
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
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

    profile, _ = UserProfile.objects.get_or_create(user=request.user)
    if profile.must_change_password:
        profile.must_change_password = False
        profile.save(update_fields=['must_change_password'])

    return Response({'detail': 'Password updated.'})
