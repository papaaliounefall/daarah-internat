from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TenantModel


class QualityLevel(TenantModel):
    """Niveaux de qualité configurables (Mumtaz, Jayyid jiddan…)."""

    code = models.CharField(max_length=30)
    label = models.CharField(max_length=80)
    label_ar = models.CharField(max_length=80, blank=True)
    rank = models.PositiveSmallIntegerField(default=0)  # 0 = meilleur
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["rank"]
        constraints = [models.UniqueConstraint(fields=["establishment", "code"], name="uniq_quality_code")]

    def __str__(self):
        return self.label


class EvaluationCriterion(TenantModel):
    """Critères d'évaluation configurables (exactitude, fluidité, tajwid, autonomie…)."""

    name = models.CharField(max_length=100)
    max_score = models.DecimalField(max_digits=5, decimal_places=2, default=20)
    weight = models.DecimalField(max_digits=4, decimal_places=2, default=1)
    order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "name"]
        constraints = [models.UniqueConstraint(fields=["establishment", "name"], name="uniq_criterion_name")]

    def __str__(self):
        return self.name


class _Versioned(TenantModel):
    """Aucune suppression ni écrasement : une correction crée une nouvelle ligne qui
    « remplace » l'ancienne (``supersedes``) ; l'ancienne reste consultable."""

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="+")
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    date = models.DateField(default=timezone.localdate)
    supersedes = models.OneToOneField("self", on_delete=models.PROTECT, null=True, blank=True, related_name="superseded_by")
    is_current = models.BooleanField(default=True)
    correction_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        abstract = True


class Lesson(_Versioned):
    """Nouvelle leçon mémorisée."""

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="lessons")
    classroom = models.ForeignKey("academics.ClassRoom", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    surah = models.ForeignKey("quran.Surah", on_delete=models.PROTECT, related_name="+")
    ayah_start = models.PositiveSmallIntegerField()
    ayah_end = models.PositiveSmallIntegerField()
    juz = models.PositiveSmallIntegerField(null=True, blank=True)    # calculés depuis le corpus
    hizb = models.PositiveSmallIntegerField(null=True, blank=True)
    page = models.PositiveSmallIntegerField(null=True, blank=True)
    quality = models.CharField(max_length=30)  # code d'un QualityLevel
    observations = models.TextField("observations du maître (internes)", blank=True)
    appreciation = models.TextField("appréciation visible par la famille", blank=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        indexes = [models.Index(fields=["establishment", "student", "-date"])]
        constraints = [models.CheckConstraint(condition=models.Q(ayah_end__gte=models.F("ayah_start")), name="lesson_range_ok")]


class Revision(_Versioned):
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="revisions")
    surah = models.ForeignKey("quran.Surah", on_delete=models.PROTECT, related_name="+")
    ayah_start = models.PositiveSmallIntegerField()
    ayah_end = models.PositiveSmallIntegerField()
    quality = models.CharField(max_length=30)
    difficulties = models.TextField("difficultés constatées", blank=True)
    recommendations = models.TextField("recommandations du maître", blank=True)
    appreciation = models.TextField("appréciation visible par la famille", blank=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        indexes = [models.Index(fields=["establishment", "student", "-date"])]
        constraints = [models.CheckConstraint(condition=models.Q(ayah_end__gte=models.F("ayah_start")), name="revision_range_ok")]


class Evaluation(_Versioned):
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="evaluations")
    scope = models.CharField("passage évalué", max_length=200, blank=True)
    overall_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)  # ramené sur 20
    appreciation = models.TextField("appréciation générale (visible par la famille)", blank=True)
    internal_notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        indexes = [models.Index(fields=["establishment", "student", "-date"])]


class EvaluationScore(TenantModel):
    evaluation = models.ForeignKey(Evaluation, on_delete=models.CASCADE, related_name="scores")
    criterion = models.ForeignKey(EvaluationCriterion, on_delete=models.PROTECT, related_name="+")
    score = models.DecimalField(max_digits=5, decimal_places=2)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["evaluation", "criterion"], name="uniq_score_per_criterion")]
