from django.db.models import Count, Q
from rest_framework import serializers

from apps.core.serializers import TenantModelSerializer

from .models import AcademicYear, ClassAssignment, ClassRoom, Enrollment


class AcademicYearSerializer(TenantModelSerializer):
    class Meta:
        model = AcademicYear
        fields = ["id", "name", "start_date", "end_date", "is_current", "is_closed"]
        read_only_fields = ["id", "is_current", "is_closed"]  # via « activate » / « close »

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"end_date": "La date de fin doit suivre la date de début."})
        return attrs


class ClassRoomSerializer(TenantModelSerializer):
    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True, default="")
    enrolled_count = serializers.SerializerMethodField()

    class Meta:
        model = ClassRoom
        fields = ["id", "name", "level", "academic_year", "teacher", "teacher_name", "room_number", "capacity", "enrolled_count"]
        read_only_fields = ["id"]

    def get_enrolled_count(self, obj):
        annotated = getattr(obj, "enrolled", None)
        if annotated is not None:
            return annotated
        return obj.enrollments.filter(status="ACTIVE").count()

    def validate_teacher(self, value):
        if value is not None and value.role != "MAITRE":
            raise serializers.ValidationError("Seul un maître coranique peut être responsable d'une classe.")
        return value


def annotate_classes(qs):
    return qs.select_related("teacher").annotate(enrolled=Count("enrollments", filter=Q(enrollments__status="ACTIVE")))


class ClassAssignmentSerializer(TenantModelSerializer):
    classroom_name = serializers.CharField(source="classroom.name", read_only=True)
    changed_by_name = serializers.CharField(source="changed_by.full_name", read_only=True, default="")

    class Meta:
        model = ClassAssignment
        fields = ["id", "classroom", "classroom_name", "start_date", "end_date", "reason", "changed_by_name"]
        read_only_fields = fields


class EnrollmentSerializer(TenantModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    registration_number = serializers.CharField(source="student.registration_number", read_only=True)
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True)
    class_name = serializers.CharField(source="classroom.name", read_only=True, default="")
    assignments = ClassAssignmentSerializer(many=True, read_only=True)

    class Meta:
        model = Enrollment
        fields = [
            "id", "student", "student_name", "registration_number", "academic_year", "academic_year_name",
            "classroom", "class_name", "kind", "status", "student_status", "enrolled_on", "notes", "assignments",
        ]
        read_only_fields = ["id", "kind", "status", "student_status", "assignments"]
