from django.conf import settings
from django.db import models

from apps.core.models import TenantModel


class Relation(models.TextChoices):
    FATHER = "PERE", "Père"
    MOTHER = "MERE", "Mère"
    TUTOR = "TUTEUR", "Tuteur / responsable légal"
    OTHER = "AUTRE", "Autre responsable autorisé"


class Guardianship(TenantModel):
    """Lien parent (compte utilisateur) ↔ talibé.

    Un parent peut suivre plusieurs enfants ; un enfant peut avoir plusieurs responsables.
    C'est ce lien — et lui seul — qui ouvre à un parent l'accès aux données d'un enfant.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="guardianships")
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="guardianships")
    relation = models.CharField(max_length=10, choices=Relation.choices, default=Relation.FATHER)
    is_primary = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "student"], name="uniq_guardianship")]
        indexes = [models.Index(fields=["establishment", "user"])]

    def __str__(self):
        return f"{self.user} → {self.student}"
