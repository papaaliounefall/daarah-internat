from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TenantModel


class Period(models.TextChoices):
    MORNING = "MATIN", "Matin"
    EVENING = "SOIR", "Soir"


class AttendanceStatus(models.TextChoices):
    PRESENT = "PRESENT", "Présent"
    ABSENT = "ABSENT", "Absent"
    LATE = "RETARD", "Retard"
    EXCUSED = "EXCUSE", "Absence excusée"


class AttendanceRecord(TenantModel):
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="attendance")
    classroom = models.ForeignKey("academics.ClassRoom", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    date = models.DateField(default=timezone.localdate)
    period = models.CharField(max_length=6, choices=Period.choices, default=Period.MORNING)
    status = models.CharField(max_length=8, choices=AttendanceStatus.choices, default=AttendanceStatus.PRESENT)
    reason = models.CharField("motif", max_length=255, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-date", "student__last_name"]
        constraints = [models.UniqueConstraint(fields=["student", "date", "period"], name="uniq_attendance_slot")]
        indexes = [
            models.Index(fields=["establishment", "date"]),
            models.Index(fields=["classroom", "date"]),
        ]
