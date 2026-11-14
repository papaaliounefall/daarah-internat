from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TenantModel


class AcademicYear(TenantModel):
    name = models.CharField(max_length=30)  # « 2026-2027 »
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False)
    is_closed = models.BooleanField(default=False)

    class Meta:
        ordering = ["-start_date"]
        constraints = [
            models.UniqueConstraint(fields=["establishment", "name"], name="uniq_year_name"),
            # Une seule année active par établissement.
            models.UniqueConstraint(
                fields=["establishment"], condition=models.Q(is_current=True), name="uniq_current_year"
            ),
            models.CheckConstraint(condition=models.Q(end_date__gt=models.F("start_date")), name="year_dates_ordered"),
        ]

    def __str__(self):
        return self.name


class ClassRoom(TenantModel):
    name = models.CharField(max_length=120)
    level = models.CharField("niveau", max_length=60, blank=True)
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name="classes")
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="classrooms",
        limit_choices_to={"role": "MAITRE"},
    )
    room_number = models.CharField("salle", max_length=40, blank=True)
    capacity = models.PositiveIntegerField(default=25)

    class Meta:
        ordering = ["academic_year", "name"]
        constraints = [
            models.UniqueConstraint(fields=["establishment", "academic_year", "name"], name="uniq_class_name_year"),
        ]

    def __str__(self):
        return self.name


class EnrollmentKind(models.TextChoices):
    NEW = "INSCRIPTION", "Inscription"
    RENEWAL = "REINSCRIPTION", "Réinscription"


class EnrollmentStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    WITHDRAWN = "RETIREE", "Retiré en cours d'année"
    COMPLETED = "TERMINEE", "Année terminée"


class Enrollment(TenantModel):
    """Inscription annuelle : entité indépendante du dossier permanent du talibé."""

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="enrollments")
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name="enrollments")
    classroom = models.ForeignKey(ClassRoom, on_delete=models.SET_NULL, null=True, blank=True, related_name="enrollments")
    kind = models.CharField(max_length=15, choices=EnrollmentKind.choices, default=EnrollmentKind.NEW)
    status = models.CharField(max_length=10, choices=EnrollmentStatus.choices, default=EnrollmentStatus.ACTIVE)
    student_status = models.CharField("régime à l'inscription", max_length=10, default="PAYANT")
    enrolled_on = models.DateField(default=timezone.localdate)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-academic_year__start_date"]
        constraints = [
            models.UniqueConstraint(fields=["student", "academic_year"], name="uniq_enrollment_student_year"),
        ]
        indexes = [models.Index(fields=["establishment", "academic_year", "classroom"])]

    def __str__(self):
        return f"{self.student} / {self.academic_year}"


class ClassAssignment(TenantModel):
    """Historique des affectations de classe d'une inscription."""

    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name="assignments")
    classroom = models.ForeignKey(ClassRoom, on_delete=models.PROTECT, related_name="assignments")
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    reason = models.CharField(max_length=255, blank=True)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-start_date", "-created_at"]
