"""
Domain models for the Emalahleni Council Portal document repository.

Heavily inspired by Phoca Download (Joomla).  Categories form a recursive tree;
files live in categories and may be stored locally or on an external server.
Access control is group/user based (Phoca-style ACL) so that a category or file
is visible only to whitelisted groups/users (or public if unrestricted).
"""

from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.utils import timezone


# ─── ACL helpers (Phoca-style) ───────────────────────────────

def _can_view(obj, user):
    """Return True if *user* is allowed to view *obj* (Category or StoredFile)."""
    if user.is_superuser:
        return True
    if not getattr(obj, 'is_published', True):
        return False
    if obj.access_users.filter(pk=user.pk).exists():
        return True
    # If groups are restricted, the user must belong to an allowed group
    if obj.access_groups.exists() and not obj.access_groups.filter(
        pk__in=user.groups.all()
    ).exists():
        return False
    return True


# ─── Category (recursive tree) ───────────────────────────────

class Category(models.Model):
    parent = models.ForeignKey(
        'self', null=True, blank=True,
        on_delete=models.CASCADE, related_name='children',
    )
    title = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)            # Phoca "alias"
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to='categories/', blank=True)

    # ACL
    access_groups = models.ManyToManyField(
        'auth.Group', blank=True, related_name='category_access',
    )
    access_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True,
        related_name='category_access',
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='owned_categories',
    )
    is_published = models.BooleanField(default=True)
    ordering = models.PositiveIntegerField(default=0,
                                           help_text='Used by the frontend tree sort.')

    class Meta:
        verbose_name_plural = 'categories'
        ordering = ['ordering', 'title']

    def __str__(self):
        return self.title

    @property
    def is_root(self):
        return self.parent is None

    def can_view(self, user):
        return _can_view(self, user)

    def children_for(self, user):
        return [c for c in self.children.filter(is_published=True)
                if c.can_view(user)]


# ─── StoredFile (local or external) ─────────────────────────

class StoredFile(models.Model):
    class StorageKind(models.TextChoices):
        LOCAL = 'local', 'Local file'
        EXTERNAL = 'external', 'External (URL)'

    category = models.ForeignKey(
        Category, on_delete=models.CASCADE, related_name='files',
    )
    title = models.CharField(max_length=255)
    slug = models.SlugField()
    description = models.TextField(blank=True)

    storage = models.CharField(
        max_length=10, choices=StorageKind.choices,
        default=StorageKind.LOCAL,
    )
    local_file = models.FileField(upload_to='files/%Y/%m/', blank=True)
    external_url = models.URLField(blank=True,
                                   help_text='Full URL when storage == external.')

    filesize = models.BigIntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True)

    # ACL — mirrors Category
    access_groups = models.ManyToManyField(
        'auth.Group', blank=True, related_name='file_access',
    )
    access_users = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True,
        related_name='file_access',
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
    )
    is_published = models.BooleanField(default=True)
    download_count = models.PositiveIntegerField(default=0)

    created = models.DateTimeField(default=timezone.now)
    modified = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

    def can_view(self, user):
        return _can_view(self, user)

    def can_download(self, user):
        """Alias kept for the API; same ACL gates download."""
        return self.can_view(user)

    class Meta:
        ordering = ['-created']
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(storage='external', external_url__gt='') |
                    models.Q(storage='local', local_file__gt='')
                ),
                name='file_has_payload',
            ),
        ]


# ─── Comments (generic FK — files AND categories) ──────────

class Comment(models.Model):
    content_type = models.ForeignKey(
        'contenttypes.ContentType', on_delete=models.CASCADE,
    )
    object_id = models.PositiveIntegerField()
    # content_object via GenericForeignKey in the module below
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='document_comments',
    )
    text = models.TextField()
    is_approved = models.BooleanField(default=True)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created']

    def __str__(self):
        return f'Comment by {self.user} on {self.content_type}:{self.object_id}'


class Rating(models.Model):
    """One rating (1–5) per user per object (file or category)."""
    content_type = models.ForeignKey(
        'contenttypes.ContentType', on_delete=models.CASCADE,
    )
    object_id = models.PositiveIntegerField()
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='document_ratings',
    )
    value = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )

    class Meta:
        unique_together = ('content_type', 'object_id', 'user')
        ordering = ['-value']

    def __str__(self):
        return f'{self.value}★ by {self.user}'


# ─── Statistics logs ───────────────────────────────────────

class DownloadLog(models.Model):
    file = models.ForeignKey(
        StoredFile, on_delete=models.CASCADE, related_name='download_logs',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='download_logs',
    )
    downloaded_at = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ['-downloaded_at']

    def __str__(self):
        return f'Download of "{self.file}" at {self.downloaded_at}'


class UploadLog(models.Model):
    class Action(models.TextChoices):
        CREATED = 'created'
        REPLACED = 'replaced'

    file = models.ForeignKey(
        StoredFile, on_delete=models.CASCADE, related_name='upload_logs',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='upload_logs',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    action = models.CharField(max_length=10, choices=Action.choices)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f'{self.action.title()} upload of "{self.file}" by {self.user}'


# Now attach GenericForeignKey fields (need the import)
from django.contrib.contenttypes.fields import GenericForeignKey  # noqa: E402
Comment.add_to_class(
    'content_object', GenericForeignKey('content_type', 'object_id')
)
Rating.add_to_class(
    'content_object', GenericForeignKey('content_type', 'object_id')
)
