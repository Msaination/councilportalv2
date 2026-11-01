"""Serializers for the calendar app."""

from rest_framework import serializers

from .models import Meeting


class MeetingSerializer(serializers.ModelSerializer):
    team_name = serializers.SerializerMethodField()
    category_title = serializers.SerializerMethodField()
    category_slug = serializers.SerializerMethodField()
    file_title = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()
    attendee_names = serializers.SerializerMethodField()
    group_names = serializers.SerializerMethodField()

    class Meta:
        model = Meeting
        fields = (
            'id', 'title', 'description', 'location', 'starts_at', 'ends_at',
            'team', 'team_name', 'category', 'category_title', 'category_slug',
            'file', 'file_title', 'attendees', 'attendee_names',
            'groups', 'group_names', 'is_mine', 'created_at',
        )
        read_only_fields = ('created_at',)

    def get_team_name(self, obj):
        return obj.team.name if obj.team else 'All teams'

    def get_category_title(self, obj):
        return obj.category.title if obj.category else None

    def get_category_slug(self, obj):
        return obj.category.slug if obj.category else None

    def get_file_title(self, obj):
        return obj.file.title if obj.file else None

    def get_is_mine(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        return obj.is_mine(user) if user and user.is_authenticated else False

    def get_attendee_names(self, obj):
        return [user.username for user in obj.attendees.all()]

    def get_group_names(self, obj):
        return [group.name for group in obj.groups.all()]

    def validate(self, attrs):
        starts_at = attrs.get('starts_at')
        ends_at = attrs.get('ends_at')
        if self.instance is not None:
            starts_at = starts_at or self.instance.starts_at
            if 'ends_at' not in attrs:
                ends_at = self.instance.ends_at
        if starts_at and ends_at and ends_at <= starts_at:
            raise serializers.ValidationError({
                'ends_at': 'The end time must be after the start time.',
            })
        return attrs
