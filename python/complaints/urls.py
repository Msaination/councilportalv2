"""URLs for the complaints gateway."""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import ComplaintViewSet

router = DefaultRouter()
router.register(r'complaints', ComplaintViewSet, basename='complaint')

urlpatterns = [
    path('', include(router.urls)),
]