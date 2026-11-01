"""API routing for teams / workspaces."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import TeamViewSet, UserAccessViewSet, change_password, my_profile

router = DefaultRouter()
router.register(r'teams', TeamViewSet, basename='team')
router.register(r'access/users', UserAccessViewSet, basename='user-access')

urlpatterns = [
    path('', include(router.urls)),
    path('profile/', my_profile, name='my-profile'),
    path('profile/password/', change_password, name='change-password'),
]
