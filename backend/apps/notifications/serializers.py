from rest_framework import serializers

from apps.core.roles import Role
from apps.core.serializers import TenantModelSerializer

from .models import Announcement, Notification


class NotificationSerializer(serializers.ModelSerializer):
    kind_display = serializers.CharField(source="get_kind_display", read_only=True)
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ["id", "kind", "kind_display", "title", "message", "channel", "link_type", "link_id",
                  "is_read", "read_at", "created_at"]
        read_only_fields = fields

    def get_is_read(self, obj):
        return obj.read_at is not None


class AnnouncementSerializer(TenantModelSerializer):
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default="")
    audience = serializers.ListField(
        child=serializers.ChoiceField(choices=Role.values), required=False, allow_empty=True,
        help_text="Rôles destinataires ; liste vide = tous les rôles.",
    )

    class Meta:
        model = Announcement
        fields = ["id", "title", "message", "audience", "created_by_name", "created_at"]
        read_only_fields = ["id", "created_by_name", "created_at"]
        extra_kwargs = {
            "title": {"max_length": 200},
            "message": {"max_length": 5000},
        }

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Le titre est obligatoire.")
        return value

    def validate_message(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Le message est obligatoire.")
        return value

    def validate_audience(self, value):
        return sorted(set(value))
