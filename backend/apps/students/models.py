from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import Sequence, TenantModel
from apps.core.validators import validate_document, validate_image


class StudentStatus(models.TextChoices):
    PAYANT = "PAYANT", "Payant"
    SOCIAL = "SOCIAL", "Social (pris en charge)"


class Student(TenantModel):
    """Dossier permanent du talibé. Ne change jamais d'identifiant d'une année à l'autre ;
    l'appartenance à une classe/année passe par ``academics.Enrollment``."""

    registration_number = models.CharField("matricule", max_length=30, editable=False)
    first_name = models.CharField("prénom", max_length=120)
    last_name = models.CharField("nom", max_length=120)
    gender = models.CharField(max_length=1, choices=[("M", "Masculin"), ("F", "Féminin")])
    birth_date = models.DateField("date de naissance", null=True, blank=True)
    birth_place = models.CharField("lieu de naissance", max_length=120, blank=True)
    nationality = models.CharField("nationalité", max_length=80, default="Sénégalaise")
    address = models.CharField("adresse / localité", max_length=255, blank=True)
    photo = models.ImageField(upload_to="students/photos/", blank=True, null=True, validators=[validate_image])

    father_name = models.CharField(max_length=160, blank=True)
    father_phone = models.CharField(max_length=30, blank=True)
    mother_name = models.CharField(max_length=160, blank=True)
    mother_phone = models.CharField(max_length=30, blank=True)
    guardian_name = models.CharField("responsable légal", max_length=160, blank=True)
    guardian_phone = models.CharField(max_length=30, blank=True)
    emergency_contact = models.CharField("contact d'urgence", max_length=200, blank=True)
    emergency_phone = models.CharField(max_length=30, blank=True)

    status = models.CharField(max_length=10, choices=StudentStatus.choices, default=StudentStatus.PAYANT)
    enrollment_date = models.DateField("date de première inscription", default=timezone.localdate)
    notes = models.TextField(blank=True)  # observations administratives internes

    is_archived = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["last_name", "first_name"]
        constraints = [
            models.UniqueConstraint(fields=["establishment", "registration_number"], name="uniq_student_regnum"),
        ]
        indexes = [
            models.Index(fields=["establishment", "last_name", "first_name"]),
            models.Index(fields=["establishment", "is_archived", "status"]),
        ]

    def __str__(self):
        return f"{self.registration_number} — {self.first_name} {self.last_name}"

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def save(self, *args, **kwargs):
        if not self.registration_number:
            est = self.establishment
            year = (self.enrollment_date or timezone.localdate()).year
            n = Sequence.next(est, "student", year)
            self.registration_number = f"{est.registration_prefix}-{year}-{n:04d}"
        super().save(*args, **kwargs)


class StudentStatusChange(TenantModel):
    """Historique des changements de statut social/payant (jamais supprimé)."""

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="status_changes")
    from_status = models.CharField(max_length=10, choices=StudentStatus.choices)
    to_status = models.CharField(max_length=10, choices=StudentStatus.choices)
    reason = models.TextField(blank=True)
    effective_date = models.DateField(default=timezone.localdate)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-effective_date", "-created_at"]


class DocumentKind(models.TextChoices):
    BIRTH_CERTIFICATE = "EXTRAIT_NAISSANCE", "Extrait de naissance"
    ADMIN = "ADMINISTRATIF", "Document administratif"
    MEDICAL = "MEDICAL", "Document médical"
    OTHER = "AUTRE", "Autre justificatif"


class StudentDocument(TenantModel):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="documents")
    kind = models.CharField(max_length=20, choices=DocumentKind.choices, default=DocumentKind.OTHER)
    title = models.CharField(max_length=160)
    file = models.FileField(upload_to="students/documents/", validators=[validate_document])
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ["-created_at"]
