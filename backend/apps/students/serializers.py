from django.apps import apps
from rest_framework import serializers

from apps.core.files import signed_file_url
from apps.core.serializers import TenantModelSerializer

from .models import Student, StudentDocument, StudentStatusChange

FAMILY_FIELDS = [
    "father_name", "father_phone", "mother_name", "mother_phone",
    "guardian_name", "guardian_phone", "emergency_contact", "emergency_phone",
]
IDENTITY_FIELDS = [
    "first_name", "last_name", "full_name", "gender", "birth_date", "birth_place", "nationality", "address",
]


class StudentSerializer(TenantModelSerializer):
    """Dossier complet (directeur, assistant). Lecture seule des champs dérivés."""

    full_name = serializers.CharField(read_only=True)
    photo = serializers.ImageField(write_only=True, required=False, allow_null=True)
    photo_url = serializers.SerializerMethodField()
    # Création : inscription immédiate (facultative). Année = année active par défaut.
    classroom = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    # --- dérivés (lecture seule) ---
    class_id = serializers.SerializerMethodField()
    class_name = serializers.SerializerMethodField()
    teacher_id = serializers.SerializerMethodField()
    teacher_name = serializers.SerializerMethodField()
    academic_year_id = serializers.SerializerMethodField()
    is_boarding = serializers.SerializerMethodField()
    room_id = serializers.SerializerMethodField()
    room_name = serializers.SerializerMethodField()
    bed_number = serializers.SerializerMethodField()
    current_surah_number = serializers.SerializerMethodField()
    current_surah_name = serializers.SerializerMethodField()
    current_ayah = serializers.SerializerMethodField()
    current_juz = serializers.SerializerMethodField()
    current_hizb = serializers.SerializerMethodField()
    last_progress_date = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = (
            ["id", "registration_number", *IDENTITY_FIELDS, "photo", "photo_url", *FAMILY_FIELDS, "status",
             "enrollment_date", "notes", "is_archived", "archived_at", "created_at", "classroom",
             "class_id", "class_name", "teacher_id", "teacher_name", "academic_year_id",
             "is_boarding", "room_id", "room_name", "bed_number",
             "current_surah_number", "current_surah_name", "current_ayah", "current_juz", "current_hizb",
             "last_progress_date"]
        )
        # ``status`` n'est fixé qu'à la création ; ensuite seul « change-status » le modifie (historisé).
        read_only_fields = ["id", "registration_number", "is_archived", "archived_at", "created_at"]

    # ---- helpers ----
    def _enrollment(self, obj):
        cur = getattr(obj, "current_enrollments", None)
        if cur is None:
            cur = list(obj.enrollments.filter(academic_year__is_current=True).select_related("classroom", "classroom__teacher"))
        active = [e for e in cur if e.status == "ACTIVE"]
        return (active or cur or [None])[0]

    def _boarding(self, obj):
        act = getattr(obj, "active_boarding", None)
        if act is None:
            act = list(obj.boarding_assignments.filter(end_date__isnull=True).select_related("room", "room__building"))
        return act[0] if act else None

    def get_photo_url(self, obj):
        return signed_file_url(self.context.get("request"), obj.photo)

    def get_class_id(self, obj):
        e = self._enrollment(obj)
        return str(e.classroom_id) if e and e.classroom_id else None

    def get_class_name(self, obj):
        e = self._enrollment(obj)
        return e.classroom.name if e and e.classroom else ""

    def get_teacher_id(self, obj):
        e = self._enrollment(obj)
        return str(e.classroom.teacher_id) if e and e.classroom and e.classroom.teacher_id else None

    def get_teacher_name(self, obj):
        e = self._enrollment(obj)
        t = e.classroom.teacher if e and e.classroom else None
        return t.full_name if t else ""

    def get_academic_year_id(self, obj):
        e = self._enrollment(obj)
        return str(e.academic_year_id) if e else None

    def get_is_boarding(self, obj):
        return self._boarding(obj) is not None

    def get_room_id(self, obj):
        b = self._boarding(obj)
        return str(b.room_id) if b else None

    def get_room_name(self, obj):
        b = self._boarding(obj)
        return f"{b.room.name or b.room.number} ({b.room.building.name})" if b else ""

    def get_bed_number(self, obj):
        b = self._boarding(obj)
        return b.bed_number if b else ""

    def _surah(self, obj):
        sid = getattr(obj, "prog_surah_id", None)
        if not sid:
            return None
        cache = self.context.setdefault("_surahs", {})
        if sid not in cache:
            cache[sid] = apps.get_model("quran", "Surah").objects.filter(pk=sid).first()
        return cache[sid]

    def get_current_surah_number(self, obj):
        return getattr(obj, "prog_surah_id", None)

    def get_current_surah_name(self, obj):
        s = self._surah(obj)
        return s.name_simple if s else ""

    def get_current_ayah(self, obj):
        return getattr(obj, "prog_ayah", None)

    def get_current_juz(self, obj):
        return getattr(obj, "prog_juz", None)

    def get_current_hizb(self, obj):
        return getattr(obj, "prog_hizb", None)

    def get_last_progress_date(self, obj):
        return getattr(obj, "prog_date", None)

    def validate_photo(self, value):
        from apps.core.validators import validate_image

        if value:
            validate_image(value)
        return value

    def create(self, validated):
        validated.pop("classroom", None)  # géré par la vue (inscription)
        return super().create(validated)

    def update(self, instance, validated):
        validated.pop("classroom", None)
        validated.pop("status", None)
        return super().update(instance, validated)


class StudentFamilySerializer(StudentSerializer):
    """Ce qu'un parent voit : pas de notes administratives ni d'informations internes."""

    class Meta(StudentSerializer.Meta):
        fields = [f for f in StudentSerializer.Meta.fields if f not in ("notes", "classroom", "photo")]
        read_only_fields = fields


class StudentTeacherSerializer(StudentFamilySerializer):
    """Ce qu'un maître voit : identité, classe, progression ; pas de notes administratives."""

    pass


class StudentDocumentSerializer(TenantModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = StudentDocument
        fields = ["id", "student", "kind", "title", "file", "file_url", "created_at"]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {"file": {"write_only": True}}

    def get_file_url(self, obj):
        return signed_file_url(self.context.get("request"), obj.file)


class StudentStatusChangeSerializer(TenantModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.full_name", read_only=True, default="")

    class Meta:
        model = StudentStatusChange
        fields = ["id", "student", "from_status", "to_status", "reason", "effective_date", "changed_by_name", "created_at"]
        read_only_fields = fields
