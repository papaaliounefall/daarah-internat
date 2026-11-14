"""Sérialiseurs du suivi coranique.

Deux familles : « staff » (directeur, assistant, maître : tous les champs) et « famille » (parent :
SANS observations, notes internes, difficultés, recommandations ni motif de correction ; seule
l'appréciation est partagée).
"""
import re
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import NotFound

from apps.core.roles import Role
from apps.core.serializers import TenantModelSerializer, TenantRelatedField
from apps.students.models import Student
from apps.students.selectors import student_scope

from . import services
from .models import Evaluation, EvaluationCriterion, EvaluationScore, Lesson, QualityLevel, Revision

User = get_user_model()


# ---------------------------------------------------------------- champs communs ---------
class ScopedStudentField(serializers.PrimaryKeyRelatedField):
    """Talibé du périmètre de l'utilisateur. Inconnu, d'un autre Daara ou hors classes du maître : 404 identique."""

    def get_queryset(self):
        user = self.context["request"].user
        return student_scope(Student.objects.filter(establishment_id=user.establishment_id), user)

    def to_internal_value(self, data):
        try:
            student = super().to_internal_value(data)
        except serializers.ValidationError as exc:
            if any(getattr(d, "code", "") == "does_not_exist" for d in exc.detail):
                raise NotFound("Talibé introuvable.") from None
            raise
        if student.is_archived:
            raise serializers.ValidationError("Ce dossier est archivé : aucune saisie n'est possible.")
        return student


def _labels(serializer):
    ctx = serializer.context
    if "_quality_labels" not in ctx:
        ctx["_quality_labels"] = services.quality_labels(ctx["request"].user.establishment)
    return ctx["_quality_labels"]


class _VersionedSerializer(TenantModelSerializer):
    student = ScopedStudentField(queryset=Student.objects.none())
    student_id = serializers.UUIDField(read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    teacher = TenantRelatedField(queryset=User.objects.filter(role=Role.MAITRE), required=False)
    teacher_id = serializers.UUIDField(read_only=True)
    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True)
    date = serializers.DateField(required=False)
    quality_label = serializers.SerializerMethodField()
    quality_label_ar = serializers.SerializerMethodField()
    is_correction = False  # les sérialiseurs de correction ne fixent aucune date par défaut

    def get_quality_label(self, obj) -> str:
        return _labels(self).get(obj.quality, (obj.quality, ""))[0]

    def get_quality_label_ar(self, obj) -> str:
        return _labels(self).get(obj.quality, ("", ""))[1]

    def validate_date(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError("La date ne peut pas être dans le futur.")
        return value

    def validate_teacher(self, value):
        if self.context["request"].user.role == Role.MAITRE:
            return None  # un maître saisit toujours en son nom
        return value

    def validate(self, attrs):
        # Création : la date vaut aujourd'hui par défaut.
        if not self.is_correction:
            attrs.setdefault("date", timezone.localdate())
        return attrs


# ---------------------------------------------------------------- leçons -----------------
LESSON_FAMILY = [
    "id", "student", "student_id", "student_name", "teacher_name", "date", "surah", "surah_number", "surah_name",
    "surah_name_arabic", "ayah_start", "ayah_end", "juz", "hizb", "page", "quality", "quality_label",
    "quality_label_ar", "appreciation", "class_name", "created_at",
]


class LessonSerializer(_VersionedSerializer):
    surah = serializers.IntegerField(source="surah_id", min_value=1)
    surah_number = serializers.IntegerField(source="surah_id", read_only=True)
    surah_name = serializers.CharField(source="surah.name_simple", read_only=True)
    surah_name_arabic = serializers.CharField(source="surah.name_arabic", read_only=True)
    class_id = serializers.UUIDField(source="classroom_id", read_only=True)
    class_name = serializers.CharField(source="classroom.name", read_only=True, default="")

    class Meta:
        model = Lesson
        fields = LESSON_FAMILY + [
            "teacher", "teacher_id", "class_id", "observations", "is_current", "supersedes", "correction_reason",
        ]
        read_only_fields = ["id", "juz", "hizb", "page", "is_current", "supersedes", "correction_reason", "created_at"]


class LessonFamilySerializer(LessonSerializer):
    class Meta(LessonSerializer.Meta):
        fields = LESSON_FAMILY
        read_only_fields = LESSON_FAMILY


class LessonCorrectionSerializer(LessonSerializer):
    """Corps de ``POST /lessons/{id}/correct/`` : tous les champs facultatifs, motif obligatoire."""

    is_correction = True
    surah = serializers.IntegerField(source="surah_id", min_value=1, required=False)
    correction_reason = serializers.CharField(max_length=255, allow_blank=False)

    class Meta(LessonSerializer.Meta):
        fields = ["surah", "ayah_start", "ayah_end", "quality", "observations", "appreciation", "date", "teacher",
                  "correction_reason"]
        read_only_fields = []
        extra_kwargs = {"surah": {"required": False}, "ayah_start": {"required": False},
                        "ayah_end": {"required": False}, "quality": {"required": False}}


# ---------------------------------------------------------------- révisions --------------
REVISION_FAMILY = [
    "id", "student", "student_id", "student_name", "teacher_name", "date", "surah", "surah_number", "surah_name",
    "surah_name_arabic", "ayah_start", "ayah_end", "ayah_range", "quality", "quality_label", "quality_label_ar",
    "appreciation", "created_at",
]


class RevisionSerializer(_VersionedSerializer):
    surah = serializers.IntegerField(source="surah_id", min_value=1)
    surah_number = serializers.IntegerField(source="surah_id", read_only=True)
    surah_name = serializers.CharField(source="surah.name_simple", read_only=True)
    surah_name_arabic = serializers.CharField(source="surah.name_arabic", read_only=True)
    ayah_range = serializers.SerializerMethodField()

    class Meta:
        model = Revision
        fields = REVISION_FAMILY + [
            "teacher", "teacher_id", "difficulties", "recommendations", "is_current", "supersedes", "correction_reason",
        ]
        read_only_fields = ["id", "is_current", "supersedes", "correction_reason", "created_at"]

    def get_ayah_range(self, obj) -> str:
        return str(obj.ayah_start) if obj.ayah_start == obj.ayah_end else f"{obj.ayah_start}-{obj.ayah_end}"


class RevisionFamilySerializer(RevisionSerializer):
    class Meta(RevisionSerializer.Meta):
        fields = REVISION_FAMILY
        read_only_fields = REVISION_FAMILY


class RevisionCorrectionSerializer(RevisionSerializer):
    is_correction = True
    surah = serializers.IntegerField(source="surah_id", min_value=1, required=False)
    correction_reason = serializers.CharField(max_length=255, allow_blank=False)

    class Meta(RevisionSerializer.Meta):
        fields = ["surah", "ayah_start", "ayah_end", "quality", "difficulties", "recommendations", "appreciation",
                  "date", "teacher", "correction_reason"]
        read_only_fields = []
        extra_kwargs = {"surah": {"required": False}, "ayah_start": {"required": False},
                        "ayah_end": {"required": False}, "quality": {"required": False}}


# ---------------------------------------------------------------- évaluations ------------
class ScoreSerializer(serializers.ModelSerializer):
    criterion = TenantRelatedField(queryset=EvaluationCriterion.objects.all())
    criterion_name = serializers.CharField(source="criterion.name", read_only=True)
    max_score = serializers.DecimalField(source="criterion.max_score", max_digits=5, decimal_places=2, read_only=True)
    score = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0)

    class Meta:
        model = EvaluationScore
        fields = ["criterion", "criterion_name", "score", "max_score"]


EVALUATION_FAMILY = [
    "id", "student", "student_id", "student_name", "teacher_name", "date", "scope", "surah_evaluated", "scores",
    "overall_score", "appreciation", "created_at",
]


class EvaluationSerializer(_VersionedSerializer):
    scores = ScoreSerializer(many=True, required=False)
    surah_evaluated = serializers.CharField(source="scope", read_only=True)

    class Meta:
        model = Evaluation
        fields = EVALUATION_FAMILY + [
            "teacher", "teacher_id", "internal_notes", "is_current", "supersedes", "correction_reason",
        ]
        read_only_fields = ["id", "overall_score", "is_current", "supersedes", "correction_reason", "created_at"]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not self.is_correction and not attrs.get("scores"):
            raise serializers.ValidationError({"scores": "Notez au moins un critère."})
        return attrs


class EvaluationFamilySerializer(EvaluationSerializer):
    class Meta(EvaluationSerializer.Meta):
        fields = EVALUATION_FAMILY
        read_only_fields = EVALUATION_FAMILY


class EvaluationCorrectionSerializer(EvaluationSerializer):
    is_correction = True
    correction_reason = serializers.CharField(max_length=255, allow_blank=False)

    class Meta(EvaluationSerializer.Meta):
        fields = ["scope", "scores", "appreciation", "internal_notes", "date", "teacher", "correction_reason"]
        read_only_fields = []


# ---------------------------------------------------------------- configuration ----------
class QualityLevelSerializer(TenantModelSerializer):
    code = serializers.CharField(max_length=30)
    rank = serializers.IntegerField(min_value=0, required=False)

    class Meta:
        model = QualityLevel
        fields = ["id", "code", "label", "label_ar", "rank", "is_active"]
        read_only_fields = ["id"]

    def validate_code(self, value):
        value = value.strip().upper()
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", value):
            raise serializers.ValidationError("Le code ne contient que des lettres majuscules, chiffres et « _ ».")
        if self.instance is not None:
            if value != self.instance.code:
                raise serializers.ValidationError("Le code d'un niveau ne peut plus être modifié (il est utilisé dans l'historique).")
            return value
        est_id = self.context["request"].user.establishment_id
        if QualityLevel.objects.filter(establishment_id=est_id, code=value).exists():
            raise serializers.ValidationError("Ce code existe déjà.")
        return value


class EvaluationCriterionSerializer(TenantModelSerializer):
    max_score = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal('0.01'), required=False)
    weight = serializers.DecimalField(max_digits=4, decimal_places=2, min_value=Decimal('0.01'), required=False)

    class Meta:
        model = EvaluationCriterion
        fields = ["id", "name", "max_score", "weight", "order", "is_active"]
        read_only_fields = ["id"]

    def validate_name(self, value):
        value = value.strip()
        est_id = self.context["request"].user.establishment_id
        qs = EvaluationCriterion.objects.filter(establishment_id=est_id, name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Un critère porte déjà ce nom.")
        return value

    def validate(self, attrs):
        inst = self.instance
        if inst is not None and EvaluationScore.objects.filter(criterion=inst).exists() and any(
            k in attrs and attrs[k] != getattr(inst, k) for k in ("max_score", "weight")
        ):
            raise serializers.ValidationError(
                "Ce critère a déjà servi à des évaluations : sa note maximale et son poids ne peuvent plus changer. "
                "Désactivez-le et créez un nouveau critère."
            )
        return attrs
