from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TenantModel


class Building(TenantModel):
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["establishment", "name"], name="uniq_building_name")]

    def __str__(self):
        return self.name


class Room(TenantModel):
    building = models.ForeignKey(Building, on_delete=models.PROTECT, related_name="rooms")
    number = models.CharField("numéro", max_length=30)
    name = models.CharField("nom", max_length=80, blank=True)
    capacity = models.PositiveSmallIntegerField(default=10)
    supervisor = models.ForeignKey("staff.StaffMember", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["building__name", "number"]
        constraints = [models.UniqueConstraint(fields=["building", "number"], name="uniq_room_number")]

    def __str__(self):
        return f"{self.building} — {self.number}"


class BoardingAssignment(TenantModel):
    """Affectation d'un talibé à une chambre. ``end_date`` nul = affectation en cours.

    Garanties : un seul lit actif par talibé (contrainte BD) et pas de dépassement de capacité
    (vérifié dans ``services.assign_student`` sous verrou de ligne sur la chambre).
    """

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="boarding_assignments")
    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name="assignments")
    bed_number = models.CharField("lit", max_length=20, blank=True)
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    note = models.CharField(max_length=255, blank=True)
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-start_date", "-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["student"], condition=models.Q(end_date__isnull=True), name="one_active_boarding_per_student"
            ),
            models.UniqueConstraint(
                fields=["room", "bed_number"],
                condition=models.Q(end_date__isnull=True) & ~models.Q(bed_number=""),
                name="one_active_student_per_bed",
            ),
        ]


class MovementKind(models.TextChoices):
    ENTRY = "ENTREE", "Entrée"
    EXIT = "SORTIE", "Sortie"


class BoardingMovement(TenantModel):
    """Entrées / sorties (retour en famille, week-end, etc.)."""

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="boarding_movements")
    kind = models.CharField(max_length=6, choices=MovementKind.choices)
    occurred_at = models.DateTimeField(default=timezone.now)
    reason = models.CharField(max_length=255, blank=True)
    expected_return = models.DateTimeField(null=True, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-occurred_at"]
        indexes = [models.Index(fields=["establishment", "-occurred_at"])]
