from django.contrib import admin

from .models import Meeting


@admin.register(Meeting)
class MeetingAdmin(admin.ModelAdmin):
    list_display = ('title', 'starts_at', 'ends_at', 'location', 'team',
                    'created_by')
    list_filter = ('team', 'starts_at')
    search_fields = ('title', 'description', 'location')
    filter_horizontal = ('attendees', 'groups')
    raw_id_fields = ('created_by', 'category', 'file')
    date_hierarchy = 'starts_at'
