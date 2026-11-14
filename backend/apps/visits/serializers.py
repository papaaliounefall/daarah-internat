from rest_framework import serializers

from apps.core.serializers import TenantModelSerializer

from .models import VisitRequest, VisitStatus


class VisitRequestSerializer(TenantModelSerializer):
    """Lecture seule : toute écriture passe par les services (création / transitions)."""

    guardian_id = serializers.UUIDField(read_only=True)
    guardian_name = serializers.CharField(source="guardian.full_name", read_only=True)
    student_id = serializers.UUIDField(read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    decision_date = serializers.DateTimeField(source="decided_at", read_only=True)
    decided_by_name = serializers.CharField(source="decided_by.full_name", read_only=True, default="")
    admin_note = serializers.CharField(source="reason", read_only=True)
    confirmed_date = serializers.SerializerMethodField()
    confirmed_time = serializers.SerializerMethodField()

    class Meta:
        model = VisitRequest
        fields = ["id", "guardian", "guardian_id", "guardian_name", "student", "student_id", "student_name",
                  "requested_date", "requested_time", "message", "status", "status_label", "decision_date",
                  "decided_by", "decided_by_name", "admin_note", "proposed_date", "proposed_time",
                  "confirmed_date", "confirmed_time", "created_at", "updated_at"]
        read_only_fields = fields

    def _confirmed(self, obj):
        if obj.status != VisitStatus.ACCEPTED:
            return None, None
        return (obj.proposed_date or obj.requested_date), (obj.proposed_time or obj.requested_time)

    def get_confirmed_date(self, obj) -> str | None:
        return self._confirmed(obj)[0]

    def get_confirmed_time(self, obj) -> str | None:
        t = self._confirmed(obj)[1]
        return t.isoformat() if t else None


class VisitCreateSerializer(serializers.Serializer):
    student = serializers.UUIDField()
    requested_date = serializers.DateField()
    requested_time = serializers.TimeField()
    message = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


class AcceptSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class RefuseSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, error_messages={
        "required": "Le motif du refus est obligatoire.", "blank": "Le motif du refus est obligatoire.",
    })


class ProposeSerializer(serializers.Serializer):
    proposed_date = serializers.DateField()
    proposed_time = serializers.TimeField()
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
