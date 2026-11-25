"""API routing for teams / workspaces."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    TeamViewSet, UserAccessViewSet, auth_config, change_password, my_profile,
)

router = DefaultRouter()
router.register(r'teams', TeamViewSet, basename='team')
router.register(r'access/users', UserAccessViewSet, basename='user-access')

urlpatterns = [
    path('', include(router.urls)),
    # Public: lets the login page discover whether SSO is configured.
    path('auth/config/', auth_config, name='auth-config'),
    path('profile/', my_profile, name='my-profile'),
    path('profile/password/', change_password, name='change-password'),
]
