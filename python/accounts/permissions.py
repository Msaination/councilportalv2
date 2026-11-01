"""Capability-based permissions granted by the superadmin."""

from rest_framework import permissions

VIEW_TEAMS = 'accounts.view_teams'
SHARE_FILES = 'documents.share_files'
EDIT_EMPLOYEE_NUMBERS = 'accounts.edit_employee_numbers'


class HasCapability(permissions.BasePermission):
    """Allow superusers, or users holding the required capability."""
    capability = None
    message = 'You do not have permission to perform this action.'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        return bool(self.capability) and user.has_perm(self.capability)


class CanViewTeams(HasCapability):
    capability = VIEW_TEAMS


class CanShareFiles(HasCapability):
    capability = SHARE_FILES


class CanEditEmployeeNumbers(HasCapability):
    capability = EDIT_EMPLOYEE_NUMBERS


class IsSuperUser(permissions.BasePermission):
    message = 'Only the superadmin can manage access.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_superuser)


class PasswordChangeRequired(permissions.BasePermission):
    """Block normal API access until a forced password change is done."""
    message = 'You must change your password before continuing.'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return True
        profile = getattr(user, 'profile', None)
        return not (profile and profile.must_change_password)
