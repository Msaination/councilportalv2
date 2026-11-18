from django import forms
from django.contrib import admin

from .models import (
    Category, StoredFile, SharedLink, Comment, Rating, DownloadLog, UploadLog,
)


class StoredFileAdminForm(forms.ModelForm):
    """Validate the file payload before the database check constraint.

    StoredFile requires either a local upload or an external URL, depending
    on its storage kind. Enforcing that here turns a raw
    ``file_has_payload`` IntegrityError into a field-level admin error.
    """

    class Meta:
        model = StoredFile
        fields = (
            'title', 'slug', 'description', 'category', 'team',
            'storage', 'local_file', 'external_url',
            'is_published', 'access_groups', 'access_users', 'owner',
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['category'].required = False
        self.fields['category'].help_text = (
            'Optional file category. Leave empty to file this under the root '
            'Files area.'
        )
        self.fields['storage'].help_text = (
            'Local file: upload a file. External: provide a full URL.'
        )
        self.fields['local_file'].help_text = (
            'Required when storage is "Local file".'
        )
        self.fields['external_url'].help_text = (
            'Required when storage is "External (URL)".'
        )
        self.fields['owner'].required = False
        self.fields['owner'].help_text = (
            'Optional — defaults to the admin creating the file.'
        )

    def clean(self):
        cleaned_data = super().clean()
        storage = cleaned_data.get('storage')
        external_url = (cleaned_data.get('external_url') or '').strip()
        local_file = cleaned_data.get('local_file')

        # FileField returns False when the admin's "Clear" checkbox is used.
        if local_file is False:
            has_local_file = False
        else:
            has_local_file = bool(local_file) or bool(
                self.instance.pk and self.instance.local_file
            )

        if storage == StoredFile.StorageKind.EXTERNAL:
            if not external_url:
                self.add_error(
                    'external_url',
                    'Enter the full URL for this external file.',
                )
        elif storage == StoredFile.StorageKind.LOCAL:
            if not has_local_file:
                self.add_error(
                    'local_file',
                    'Choose a file to upload, or switch storage to '
                    '"External (URL)".',
                )
        return cleaned_data


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('title', 'parent', 'is_published', 'is_shareable', 'ordering')
    list_filter = ('is_published', 'is_shareable')
    search_fields = ('title', 'slug', 'description')
    prepopulated_fields = {'slug': ('title',)}
    filter_horizontal = ('access_groups', 'access_users')
    raw_id_fields = ('owner',)


@admin.register(StoredFile)
class StoredFileAdmin(admin.ModelAdmin):
    form = StoredFileAdminForm
    list_display = ('title', 'category', 'storage', 'filesize',
                    'mime_type', 'is_published', 'download_count', 'created')
    list_filter = ('storage', 'is_published', 'category', 'created')
    search_fields = ('title', 'slug', 'description')
    prepopulated_fields = {'slug': ('title',)}
    filter_horizontal = ('access_groups', 'access_users')
    raw_id_fields = ('owner',)

    def save_model(self, request, obj, form, change):
        if obj.owner_id is None:
            obj.owner = request.user
        super().save_model(request, obj, form, change)


@admin.register(SharedLink)
class SharedLinkAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'file', 'created_by', 'expires_at',
                    'is_revoked', 'created_at')
    list_filter = ('is_revoked', 'created_at', 'expires_at')
    search_fields = ('token', 'file__title', 'created_by__username')
    raw_id_fields = ('file', 'created_by')
    date_hierarchy = 'created_at'


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
