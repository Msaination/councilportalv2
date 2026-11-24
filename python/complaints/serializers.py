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

