from django.contrib import admin
from .models import (
    Category, StoredFile, Comment, Rating, DownloadLog, UploadLog,
)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('title', 'parent', 'is_published', 'ordering')
    list_filter = ('is_published',)
    search_fields = ('title', 'slug', 'description')
    prepopulated_fields = {'slug': ('title',)}
    filter_horizontal = ('access_groups', 'access_users')
    raw_id_fields = ('owner',)


@admin.register(StoredFile)
class StoredFileAdmin(admin.ModelAdmin):
    list_display = ('title', 'category', 'storage', 'filesize',
                    'mime_type', 'is_published', 'download_count', 'created')
    list_filter = ('storage', 'is_published', 'category', 'created')
    search_fields = ('title', 'slug', 'description')
    prepopulated_fields = {'slug': ('title',)}
    filter_horizontal = ('access_groups', 'access_users')
    raw_id_fields = ('owner',)


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'user', 'is_approved', 'created')
    list_filter = ('is_approved', 'created')
    search_fields = ('text',)
    raw_id_fields = ('user', 'content_type')


@admin.register(Rating)
class RatingAdmin(admin.ModelAdmin):
    list_display = ('value', '__str__', 'user')
    list_filter = ('value',)
    raw_id_fields = ('user', 'content_type')


@admin.register(DownloadLog)
class DownloadLogAdmin(admin.ModelAdmin):
    list_display = ('file', 'user', 'ip_address', 'downloaded_at')
    list_filter = ('downloaded_at',)
    search_fields = ('file__title',)
    raw_id_fields = ('file', 'user')
    date_hierarchy = 'downloaded_at'


@admin.register(UploadLog)
class UploadLogAdmin(admin.ModelAdmin):
    list_display = ('file', 'user', 'action', 'uploaded_at')
    list_filter = ('action', 'uploaded_at')
    search_fields = ('file__title',)
    raw_id_fields = ('file', 'user')
    date_hierarchy = 'uploaded_at'
