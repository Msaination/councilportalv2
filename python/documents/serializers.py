"""
Serializers for the Emalahleni Council Portal REST API.

Every serializer that returns file/category data exposes computed ACL and
social fields so the Next.js frontend never has to trust the client for
permissions:
    preview_kind   — what player/preview component to render
    can_download   — whether the requesting user may fetch the file
    rating_avg     — average star rating (1–5) or None
    rating_count   — how many ratings exist
    comment_count  — approved comments only
"""

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.db.models import Avg
from rest_framework import serializers

from .models import (
    Category, StoredFile, Comment, Rating, DownloadLog, UploadLog,
)

User = get_user_model()


# ─── File-type detection ─────────────────────────────────────

import os

PREVIEW_MAP = {
    'pdf': 'pdf',
    'png': 'image', 'jpg': 'image', 'jpeg': 'image',
    'gif': 'image', 'webp': 'image',
    'mp3': 'audio', 'wav': 'audio', 'ogg': 'audio',
    'mp4': 'video', 'webm': 'video',
}


def preview_kind(filename):
    """Return the preview category for a filename/extension."""
    ext = os.path.splitext(filename)[1].lower().lstrip('.')
    return PREVIEW_MAP.get(ext, 'download')


def _ct_for(obj):
    """Get ContentType for a model instance."""
    return ContentType.objects.get_for_model(obj)


# ─── Auth serializer ─────────────────────────────────────────

class UserSerializer(serializers.ModelSerializer):
    groups = serializers.StringRelatedField(many=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'first_name', 'last_name',
                  'email', 'groups')


# ─── Category ───────────────────────────────────────────────

class CategoryTreeSerializer(serializers.ModelSerializer):
    """Lightweight category for recursive tree views."""
    children = serializers.SerializerMethodField()
    file_count = serializers.SerializerMethodField()
    can_view = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ('id', 'title', 'slug', 'is_published', 'ordering',
                  'children', 'file_count', 'can_view')

    def _user(self):
        request = self.context.get('request')
        return getattr(request, 'user', None) if request else None

    def get_can_view(self, obj):
        user = self._user()
        return obj.can_view(user) if user else False

    def get_children(self, obj):
        user = self._user()
        kids = obj.children.filter(is_published=True)
        visible = [c for c in kids if c.can_view(user)] if user else []
        return CategoryTreeSerializer(visible, many=True,
                                      context=self.context).data

    def get_file_count(self, obj):
        user = self._user()
        if not user:
            return 0
        return sum(1 for f in obj.files.filter(is_published=True)
                   if f.can_view(user))


# ─── File ───────────────────────────────────────────────────

class StoredFileSerializer(serializers.ModelSerializer):
    preview_kind = serializers.SerializerMethodField()
    can_download = serializers.SerializerMethodField()
    rating_avg = serializers.SerializerMethodField()
    rating_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()

    class Meta:
        model = StoredFile
        fields = (
            'id', 'title', 'slug', 'description', 'storage',
            'local_file', 'external_url', 'filesize', 'mime_type',
            'is_published', 'download_count', 'created', 'modified',
            'preview_kind', 'can_download',
            'rating_avg', 'rating_count', 'comment_count',
        )

    def _user(self):
        request = self.context.get('request')
        return getattr(request, 'user', None) if request else None

    def get_preview_kind(self, obj):
        name = obj.external_url or (obj.local_file.name if obj.local_file else '')
        return preview_kind(name)

    def get_can_download(self, obj):
        user = self._user()
        return obj.can_download(user) if user else False

    def get_rating_avg(self, obj):
        ct = _ct_for(obj)
        qs = Rating.objects.filter(content_type=ct, object_id=obj.id)
        if not qs.exists():
            return None
        return round(qs.aggregate(Avg('value'))['value__avg'], 1)

    def get_rating_count(self, obj):
        ct = _ct_for(obj)
        return Rating.objects.filter(content_type=ct, object_id=obj.id).count()

    def get_comment_count(self, obj):
        ct = _ct_for(obj)
        return Comment.objects.filter(
            content_type=ct, object_id=obj.id, is_approved=True,
        ).count()


# ─── Comment ────────────────────────────────────────────────

class CommentSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = Comment
        fields = ('id', 'content_type', 'object_id', 'user',
                  'text', 'is_approved', 'created')

    def create(self, validated):
        validated['user'] = self.context['request'].user
        return super().create(validated)


# ─── Rating ─────────────────────────────────────────────────

class RatingSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = Rating
        fields = ('id', 'content_type', 'object_id', 'user', 'value')
        validators = []  # custom upsert below

    def create(self, validated):
        request = self.context['request']
        validated['user'] = request.user
        obj, _ = Rating.objects.update_or_create(
            content_type=validated['content_type'],
            object_id=validated['object_id'],
            user=request.user,
            defaults={'value': validated['value']},
        )
        return obj


# ─── Logs ───────────────────────────────────────────────────

class DownloadLogSerializer(serializers.ModelSerializer):
    file = serializers.StringRelatedField()
    user = UserSerializer(read_only=True)

    class Meta:
        model = DownloadLog
        fields = ('id', 'file', 'user', 'ip_address', 'downloaded_at')


class UploadLogSerializer(serializers.ModelSerializer):
    file = serializers.StringRelatedField()
    user = UserSerializer(read_only=True)

    class Meta:
        model = UploadLog
        fields = ('id', 'file', 'user', 'action', 'uploaded_at')
