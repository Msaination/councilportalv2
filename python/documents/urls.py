"""API URL routing for the Emalahleni Council Portal."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CategoryViewSet,
    StoredFileViewSet,
    CommentViewSet,
    RatingViewSet,
    AdminStatsViewSet,
    current_user,
    csrf_cookie,
)
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

router = DefaultRouter()
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'files', StoredFileViewSet, basename='file')
router.register(r'comments', CommentViewSet, basename='comment')
router.register(r'ratings', RatingViewSet, basename='rating')
router.register(r'admin/stats', AdminStatsViewSet, basename='admin-stats')

urlpatterns = [
    path('', include(router.urls)),
    # JWT auth endpoints (for API-first clients / mobile / SaaS)
    path('auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    # Session auth (web browser)
    path('auth/login/', include('rest_framework.urls', namespace='rest_framework')),
    path('auth/me/', current_user, name='current-user'),
    path('auth/csrf/', csrf_cookie, name='csrf-cookie'),
]
