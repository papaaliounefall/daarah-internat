from rest_framework import serializers

from apps.core.serializers import TenantModelSerializer

from .models import AttendanceRecord, AttendanceStatus, Period
from .services import MAX_BATCH


class AttendanceRecordSerializer(TenantModelSerializer):
    student_id = serializers.UUIDField(read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    registration_number = serializers.CharField(source="student.registration_number", read_only=True)
    class_id = serializers.UUIDField(source="classroom_id", read_only=True)
    class_name = serializers.CharField(source="classroom.name", read_only=True, default="")
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True, default="")

    class Meta:
        model = AttendanceRecord
        fields = ["id", "student", "student_id", "student_name", "registration_number", "classroom", "class_id",
                  "class_name", "date", "period", "status", "reason", "recorded_by", "recorded_by_name",
                  "created_at", "updated_at"]
        read_only_fields = fields


class AttendanceItemSerializer(serializers.Serializer):
    student = serializers.UUIDField()
    status = serializers.ChoiceField(choices=AttendanceStatus.choices)
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class AttendanceBulkSerializer(serializers.Serializer):
    """Corps de ``POST /attendance/bulk/``."""

    date = serializers.DateField(required=False)
    period = serializers.ChoiceField(choices=Period.choices, default=Period.MORNING)
    classroom = serializers.UUIDField(required=False, allow_null=True)
    records = AttendanceItemSerializer(many=True, allow_empty=False, max_length=MAX_BATCH)


class AttendanceCreateSerializer(AttendanceItemSerializer):
    """Corps de ``POST /attendance/`` (un seul pointage, upsert)."""

    date = serializers.DateField(required=False)
    period = serializers.ChoiceField(choices=Period.choices, default=Period.MORNING)
    classroom = serializers.UUIDField(required=False, allow_null=True)
