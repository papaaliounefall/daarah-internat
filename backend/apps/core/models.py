import uuid

from django.db import models, transaction
from django.utils import timezone


class BaseModel(models.Model):
    """Clé primaire UUID (pas d'énumération possible des dossiers de mineurs) + horodatage."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Establishment(BaseModel):
    """Un Daara. Toute donnée métier est rattachée à un établissement (isolation côté serveur)."""

    name = models.CharField("nom", max_length=200)
    name_ar = models.CharField(
        "nom en arabe (une ligne par ligne d'en-tête, séparées par un retour à la ligne)", max_length=300, blank=True
    )
    slug = models.SlugField(unique=True)
    city = models.CharField("ville", max_length=100, blank=True)
    country = models.CharField("pays", max_length=100, default="Sénégal")
    address = models.CharField("adresse", max_length=255, blank=True)
    phone = models.CharField("téléphone", max_length=50, blank=True)
    email = models.EmailField(blank=True)
    logo = models.ImageField(upload_to="establishments/logos/", blank=True, null=True)
    primary_color = models.CharField(max_length=9, default="#114232")
    accent_color = models.CharField(max_length=9, default="#C5A059")
    # Paramètres modifiables par le directeur (seuils, etc.)
    expense_approval_threshold = models.DecimalField(
        "seuil de validation des dépenses (FCFA)", max_digits=12, decimal_places=0, default=100000
    )
    registration_prefix = models.CharField("préfixe des matricules", max_length=10, default="DAF")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class TenantModel(BaseModel):
    establishment = models.ForeignKey(
        Establishment, on_delete=models.PROTECT, related_name="+", editable=False
    )

    class Meta:
        abstract = True


class Sequence(models.Model):
    """Compteurs atomiques par établissement (matricules, numéros de reçus…)."""

    establishment = models.ForeignKey(Establishment, on_delete=models.CASCADE, related_name="+")
    key = models.CharField(max_length=40)
    year = models.PositiveIntegerField(default=0)
    value = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["establishment", "key", "year"], name="uniq_sequence")]

    @classmethod
    def next(cls, establishment, key: str, year: int | None = None) -> int:
        year = year if year is not None else timezone.localdate().year
        with transaction.atomic():
            seq, _ = cls.objects.select_for_update().get_or_create(
                establishment=establishment, key=key, year=year
            )
            seq.value += 1
            seq.save(update_fields=["value"])
            return seq.value
