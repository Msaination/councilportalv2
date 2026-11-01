"""Serializers for teams, memberships, and the active workspace."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import (
    Team, Membership, UserProfile, CELL_NUMBER_VALIDATOR,
    EMPLOYEE_NUMBER_VALIDATOR,
)

User = get_user_model()

CAPABILITY_PERMISSIONS = {
    'view_teams': 'accounts.view_teams',
    'share_files': 'documents.share_files',
    'edit_employee_numbers': 'accounts.edit_employee_numbers',
}


class MembershipSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Membership
        fields = ('user_id', 'username', 'role', 'joined_at')


class TeamSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    members = MembershipSerializer(source='memberships', many=True,
                                   read_only=True)

    class Meta:
        model = Team
        fields = ('id', 'name', 'slug', 'created_at', 'role',
                  'member_count', 'members')
        read_only_fields = ('slug', 'created_at')

    def get_role(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return None
        membership = obj.memberships.filter(user=user).first()
        return membership.role if membership else None

    def get_member_count(self, obj):
        return obj.memberships.count()


class UserAccessSerializer(serializers.ModelSerializer):
    """Superadmin/editor view of users, capabilities, and employee numbers."""
    capabilities = serializers.SerializerMethodField()
    employee_number = serializers.CharField(
        source='profile.employee_number', required=False, allow_blank=True,
        allow_null=True, validators=[EMPLOYEE_NUMBER_VALIDATOR],
    )
    must_change_password = serializers.BooleanField(
        source='profile.must_change_password', read_only=True,
    )
    view_teams = serializers.BooleanField(write_only=True, required=False)
    share_files = serializers.BooleanField(write_only=True, required=False)
    edit_employee_numbers = serializers.BooleanField(
        write_only=True, required=False,
    )

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'employee_number',
                  'must_change_password', 'is_superuser', 'capabilities',
                  'view_teams', 'share_files', 'edit_employee_numbers')
        read_only_fields = ('username', 'email', 'is_superuser')

    def get_capabilities(self, obj):
        return {
            name: obj.is_superuser or obj.has_perm(permission)
            for name, permission in CAPABILITY_PERMISSIONS.items()
        }

    def validate_employee_number(self, value):
        if not value:
            return None
        qs = UserProfile.objects.filter(employee_number=value)
        if self.instance is not None:
            qs = qs.exclude(user=self.instance)
        if qs.exists():
            raise serializers.ValidationError(
                'This employee number is already in use.')
        return value

    def update(self, instance, validated_data):
        request = self.context['request']
        profile_data = validated_data.pop('profile', {})

        if 'employee_number' in profile_data:
            can_edit = (request.user.is_superuser or
                        request.user.has_perm('accounts.edit_employee_numbers'))
            if not can_edit:
                raise serializers.ValidationError({
                    'employee_number': 'You cannot edit employee numbers.',
                })
            profile = instance.profile
            profile.employee_number = profile_data['employee_number'] or None
            profile.save(update_fields=['employee_number'])

        for name, permission in CAPABILITY_PERMISSIONS.items():
            if name not in validated_data:
                continue
            app_label, codename = permission.split('.')
            perm = Permission.objects.get(
                content_type__app_label=app_label, codename=codename,
            )
            if validated_data[name]:
                instance.user_permissions.add(perm)
            else:
                instance.user_permissions.remove(perm)
        return instance


class UserCreateSerializer(serializers.Serializer):
    """Superadmin creates a user with an employee number."""
    username = serializers.CharField(min_length=3, max_length=150)
    email = serializers.EmailField()
    employee_number = serializers.CharField(
        max_length=7, validators=[EMPLOYEE_NUMBER_VALIDATOR],
    )

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('This username is already taken.')
        return value

    def validate_employee_number(self, value):
        if UserProfile.objects.filter(employee_number=value).exists():
            raise serializers.ValidationError(
                'This employee number is already in use.')
        return value


class ProfileSerializer(serializers.ModelSerializer):
    """A user's own profile: identity fields plus bio, cell, and avatar."""
    cell_number = serializers.CharField(
        source='profile.cell_number', required=False, allow_blank=True,
        validators=[CELL_NUMBER_VALIDATOR],
    )
    bio = serializers.CharField(
        source='profile.bio', required=False, allow_blank=True,
        max_length=500,
    )
    avatar = serializers.ImageField(
        source='profile.avatar', required=False, allow_null=True,
    )
    employee_number = serializers.CharField(
        source='profile.employee_number', read_only=True,
    )
    email = serializers.EmailField()

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'employee_number',
                  'cell_number', 'bio', 'avatar')
        extra_kwargs = {
            'username': {'min_length': 3, 'max_length': 150},
        }

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exclude(
                pk=self.instance.pk).exists():
            raise serializers.ValidationError('This username is already taken.')
        return value

    def validate_avatar(self, value):
        if value and value.size > 2 * 1024 * 1024:
            raise serializers.ValidationError('Avatar must be 2 MB or smaller.')
        return value

    def update(self, instance, validated_data):
        profile_data = validated_data.pop('profile', {})
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        profile = instance.profile
        old_avatar = profile.avatar if 'avatar' in profile_data else None
        for attr, value in profile_data.items():
            setattr(profile, attr, value)
        profile.save()

        if old_avatar and old_avatar.name != profile.avatar.name:
            old_avatar.delete(save=False)
        return instance


class ChangePasswordSerializer(serializers.Serializer):
    """Self-service password change — requires the current password."""
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_current_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def validate_new_password(self, value):
        validate_password(value, self.context['request'].user)
        return value

    def validate(self, attrs):
        if attrs['current_password'] == attrs['new_password']:
            raise serializers.ValidationError({
                'new_password': 'Choose a password different from the current one.',
            })
        return attrs
