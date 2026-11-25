from rest_framework import serializers


class ReportReplySerializer(serializers.Serializer):
    created_at = serializers.DateTimeField()
    body = serializers.CharField()
    from_staff = serializers.BooleanField()
    author_name = serializers.SerializerMethodField()

    def get_author_name(self, obj):
        # Safely access data assuming obj is a dictionary
        if isinstance(obj, dict):
            if obj.get('from_staff'):
                user_data = obj.get('user', {})
                # Safely get full_name from user_data, defaulting to 'Staff' if missing or if user_data is empty
                return user_data.get('full_name', 'Staff')
            return 'User'
        return 'Unknown' # Fallback if obj is not a dict or unexpected structure


class ComplaintCreateSerializer(serializers.Serializer):
    """Fields a councillor supplies when logging a complaint.

    ``ward_number`` and ``status`` are deliberately absent: both are stamped
    server-side so a ward cannot be forged and a complaint cannot be created
    pre-escalated.
    """
    title = serializers.CharField(max_length=200)
    description = serializers.CharField(max_length=2000)
    # `category` is NOT NULL with no default in Supabase, so it is required.
    category = serializers.CharField(max_length=100)
    issue_type = serializers.CharField(
        max_length=100, required=False, allow_blank=True, default='',
    )
    assigned_department = serializers.CharField(
        max_length=100, required=False, allow_blank=True, default='',
    )
    location_address = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default='',
    )
    # The CMS only uses these two values.
    priority = serializers.ChoiceField(
        choices=['normal', 'urgent'], required=False, default='normal',
    )

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('A subject is required.')
        return value

    def validate_description(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('A description is required.')
        return value

    def validate_category(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Choose a category.')
        return value


class ComplaintEscalateSerializer(serializers.Serializer):
    """Optional note explaining why the complaint is being escalated."""
    reason = serializers.CharField(
        max_length=500, required=False, allow_blank=True, default='',
    )
