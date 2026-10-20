"""
API views for the Emalahleni Council Portal.

ACL is enforced server-side on every endpoint via the model-level
``can_view`` / ``can_download`` helpers.  The Next.js frontend must never
trust client-side permission checks.
"""

from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import UploadedFile
from django.http import FileResponse, Http404, HttpResponseForbidden, JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import serializers, viewsets, permissions, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

import magic  # python-magic for MIME detection

from .models import (
    Category, StoredFile, Comment, Rating, DownloadLog, UploadLog,
)
from .serializers import (
    CategoryTreeSerializer, StoredFileSerializer,
    CommentSerializer, RatingSerializer,
    DownloadLogSerializer, UploadLogSerializer,
)


# ─── Permissions ────────────────────────────────────────────

class IsAdminOrReadOnly(permissions.BasePermission):
    """Read: any authenticated user. Write: superuser or staff only."""

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return request.user.is_authenticated
        return request.user and request.user.is_staff


def _visible_categories(user):
    """All published categories the user is allowed to see."""
    cats = Category.objects.filter(is_published=True).prefetch_related(
        'access_groups', 'access_users',
    )
    return [c for c in cats if c.can_view(user)]


# ─── Categories ─────────────────────────────────────────────

class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """Root category tree (ACL-filtered)."""
    serializer_class = CategoryTreeSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'slug'

    def get_queryset(self):
        return Category.objects.filter(is_published=True).prefetch_related(
            'access_groups', 'access_users', 'children',
        )

    def list(self, request):
        """Return only root-level categories visible to the user."""
        user = request.user
        qs = self.filter_queryset(self.get_queryset())
        roots = [c for c in qs if c.is_root and c.can_view(user)]
        page = self.paginate_queryset(roots)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(roots, many=True)
        return Response(serializer.data)

    def get_object(self):
        """Fetch and ACL-check before returning."""
        obj = super().get_object()
        if not obj.can_view(self.request.user):
            raise Http404()
        return obj

    @action(detail=True, methods=['get'], url_path='files')
    def files(self, request, slug=None):
        """Files directly in this category (ACL-filtered)."""
        category = self.get_object()
        user = request.user
        fs = category.files.filter(is_published=True)
        visible = [f for f in fs if f.can_view(user)]
        serializer = StoredFileSerializer(visible, many=True,
                                          context=self.get_serializer_context())
        return Response(serializer.data)


# ─── Files ──────────────────────────────────────────────────

class StoredFileViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only files endpoint with download tracking."""
    serializer_class = StoredFileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """Return all files — ACL filtering happens in get_object / list."""
        qs = StoredFile.objects.select_related('category').all()
        cat_slug = self.request.query_params.get('category')
        if cat_slug:
            qs = qs.filter(category__slug=cat_slug)
        return qs

    def list(self, request):
        """Override to apply ACL filtering on every item."""
        user = request.user
        qs = self.filter_queryset(self.get_queryset())
        visible = [f for f in qs if f.can_view(user)]
        page = self.paginate_queryset(visible)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(visible, many=True)
        return Response(serializer.data)

    def get_object(self):
        """Fetch the file and enforce ACL before returning it."""
        obj = super().get_object()
        if not obj.can_view(self.request.user):
            raise Http404()
        return obj

    @action(detail=True, methods=['get'], url_path='download')
    def download(self, request, pk=None):
        """Serve or redirect — ACL + counter + log."""
        file_obj = self.get_object()
        user = request.user

        if not file_obj.can_download(user):
            return HttpResponseForbidden()

        DownloadLog.objects.create(
            file=file_obj,
            user=user if user.is_authenticated else None,
            ip_address=self._client_ip(request),
        )
        file_obj.download_count += 1
        file_obj.save(update_fields=['download_count'])

        if file_obj.storage == StoredFile.StorageKind.EXTERNAL:
            return Response({'url': file_obj.external_url})

        if file_obj.local_file:
            response = FileResponse(
                file_obj.local_file.open('rb'),
                as_attachment=True,
                filename=file_obj.local_file.name.split('/')[-1],
            )
            return response
        raise Http404()

    def _client_ip(self, request):
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        if forwarded:
            return forwarded.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')

    # ─── Upload / replace ─────────────────────────────────────

    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
    ALLOWED_EXTENSIONS = {
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'txt', 'csv', 'zip', 'rar', '7z',
        # media that the frontend can preview/play
        'png', 'jpg', 'jpeg', 'gif', 'webp',
        'mp3', 'wav', 'ogg', 'mp4', 'webm',
    }

    @action(detail=False, methods=['post'], url_path='upload',
            permission_classes=[permissions.IsAdminUser])
    def upload(self, request):
        """Upload a new file into a category (admin only).

        Accepts multipart form:
            file        — the uploaded file
            title       — display name
            slug        — URL slug
            category    — category slug
            description — optional
        """
        return self._do_upload(request)

    @action(detail=True, methods=['post'], url_path='replace',
            permission_classes=[permissions.IsAdminUser])
    def replace(self, request, pk=None):
        """Replace an existing file's payload (admin only).

        Writes a new UploadLog entry; does NOT change metadata.
        """
        self.get_object()
        return self._do_replace(request)

    def _validate_file(self, uploaded: UploadedFile):
        errors = []
        if uploaded.size > self.MAX_FILE_SIZE:
            errors.append(f'File too large (max {self.MAX_FILE_SIZE // (1024*1024)} MB).')

        ext = uploaded.name.rsplit('.', 1)[-1].lower() if '.' in uploaded.name else ''
        if ext not in self.ALLOWED_EXTENSIONS:
            errors.append(
                f'Extension ".{ext}" not allowed. '
                f'Permitted: {", ".join(sorted(self.ALLOWED_EXTENSIONS))}'
            )
        return errors

    def _mime_and_size(self, uploaded: UploadedFile):
        mime = magic.from_buffer(uploaded.read(2048), mime=True)
        uploaded.seek(0)
        return {
            'mime_type': mime,
            'filesize': uploaded.size,
        }

    @action(detail=False, methods=['get'], url_path='content-types')
    def content_types(self, request):
        """Return ContentType IDs for file and category models."""
        file_ct = ContentType.objects.get_for_model(StoredFile)
        cat_ct = ContentType.objects.get_for_model(Category)
        return Response({
            'storedfile': file_ct.id,
            'category': cat_ct.id,
        })

    def _do_upload(self, request):
        errors = []
        file_obj = request.data.get('file')
        if not file_obj:
            return Response({'error': 'No file provided.'},
                            status=status.HTTP_400_BAD_REQUEST)

        errors.extend(self._validate_file(file_obj))

        category_slug = request.data.get('category')
        try:
            category = Category.objects.get(slug=category_slug)
        except (Category.DoesNotExist, TypeError):
            errors.append('Valid category slug required.')

        if errors:
            return Response({'errors': errors},
                            status=status.HTTP_400_BAD_REQUEST)

        meta = self._mime_and_size(file_obj)
        obj = StoredFile.objects.create(
            category=category,
            title=request.data.get('title', file_obj.name),
            slug=request.data.get('slug') or file_obj.name.rsplit('.', 1)[0]
                .replace(' ', '-').lower(),
            description=request.data.get('description', ''),
            storage=StoredFile.StorageKind.LOCAL,
            local_file=file_obj,
            mime_type=meta['mime_type'],
            filesize=meta['filesize'],
            owner=request.user,
            is_published=True,
        )
        UploadLog.objects.create(
            file=obj, user=request.user,
            action=UploadLog.Action.CREATED,
        )
        return Response(StoredFileSerializer(obj, context={'request': request}).data,
                        status=status.HTTP_201_CREATED)

    def _do_replace(self, request):
        """Replace only the file payload — metadata stays unchanged."""
        file_obj = request.data.get('file')
        if not file_obj:
            return Response({'error': 'No file provided.'},
                            status=status.HTTP_400_BAD_REQUEST)

        errors = self._validate_file(file_obj)
        if errors:
            return Response({'errors': errors},
                            status=status.HTTP_400_BAD_REQUEST)

        self.get_object()  # ACL / 404
        obj = self.get_object()
        meta = self._mime_and_size(file_obj)
        obj.local_file = file_obj
        obj.mime_type = meta['mime_type']
        obj.filesize = meta['filesize']
        obj.save(update_fields=['local_file', 'mime_type', 'filesize'])

        UploadLog.objects.create(
            file=obj, user=request.user,
            action=UploadLog.Action.REPLACED,
        )
        return Response(StoredFileSerializer(obj, context={'request': request}).data)


# ─── Comments ───────────────────────────────────────────────

class CommentViewSet(viewsets.ModelViewSet):
    """Create / list / moderate comments for any commentable object.

    The target object (file or category) must exist and be viewable by
    the requesting user — otherwise the comment is rejected.
    """
    serializer_class = CommentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Comment.objects.filter(is_approved=True).select_related('user')

    def _target_object(self):
        """Resolve the content_type + object_id to validate visibility."""
        ct_id = self.request.data.get('content_type') or \
            self.request.query_params.get('content_type')
        obj_id = self.request.data.get('object_id') or \
            self.request.query_params.get('object_id')
        if not ct_id or not obj_id:
            return None, None
        try:
            ct = ContentType.objects.get(pk=ct_id)
            obj = ct.get_object_for_this_type(pk=obj_id)
            return ct, obj
        except (ContentType.DoesNotExist, ct.model_class().DoesNotExist):
            return None, None

    def perform_create(self, serializer):
        """Only allow comments on objects the user can view."""
        ct, obj = self._target_object()
        if obj is None:
            raise serializers.ValidationError(
                'Target object does not exist or is not accessible.')
        # Check ACL — use can_view if available, otherwise require is_published
        if hasattr(obj, 'can_view'):
            if not obj.can_view(self.request.user):
                raise serializers.ValidationError('You cannot view this object.')
        elif not getattr(obj, 'is_published', False) and not self.request.user.is_staff:
            raise serializers.ValidationError('Object is not published.')

        serializer.save(
            user=self.request.user,
            is_approved=self.request.user.is_staff,  # auto-approve staff
        )


# ─── Ratings ────────────────────────────────────────────────

class RatingViewSet(viewsets.ModelViewSet):
    """Upsert ratings (1–5 stars) for files or categories.

    Users can only rate objects they can view.  The unique_together
    constraint on (content_type, object_id, user) enforces one rating
    per user per object; ``create`` handles the upsert.
    """
    serializer_class = RatingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Rating.objects.filter(user=self.request.user)


# ─── Statistics (admin only) ────────────────────────────────

class AdminStatsViewSet(viewsets.ReadOnlyModelViewSet):
    """Download / upload logs and summary totals — staff only."""
    permission_classes = [permissions.IsAdminUser]

    @action(detail=False, methods=['get'], url_path='downloads')
    def downloads(self, request):
        qs = DownloadLog.objects.select_related('file', 'user').all()
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(
                DownloadLogSerializer(page, many=True).data)
        return Response(DownloadLogSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'], url_path='uploads')
    def uploads(self, request):
        qs = UploadLog.objects.select_related('file', 'user').all()
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(
                UploadLogSerializer(page, many=True).data)
        return Response(UploadLogSerializer(qs, many=True).data)

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        return Response({
            'total_downloads': DownloadLog.objects.count(),
            'total_uploads': UploadLog.objects.count(),
            'top_files': list(
                StoredFile.objects
                .order_by('-download_count')[:10]
                .values('id', 'title', 'download_count')
            ),
        })


# ─── Session auth helpers ────────────────────────────────────

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def current_user(request):
    """Return the current authenticated user + their groups."""
    return Response({
        'id': request.user.id,
        'username': request.user.username,
        'first_name': request.user.first_name,
        'last_name': request.user.last_name,
        'email': request.user.email,
        'groups': [g.name for g in request.user.groups.all()],
        'is_staff': request.user.is_staff,
    })


@ensure_csrf_cookie
def csrf_cookie(request):
    """Set the CSRF cookie so the Next.js frontend can make POSTs."""
    return JsonResponse({'detail': 'CSRF cookie set.'})
