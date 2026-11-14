from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TenantModel
from apps.core.validators import validate_document


class FeeKind(models.TextChoices):
    REGISTRATION = "INSCRIPTION", "Frais d'inscription"
    MONTHLY = "MENSUALITE", "Mensualité"
    EXCEPTIONAL = "EXCEPTIONNEL", "Frais exceptionnel"


class AppliesTo(models.TextChoices):
    ALL = "TOUS", "Tous les talibés"
    PAYING = "PAYANT", "Talibés payants"
    SOCIAL = "SOCIAL", "Talibés sociaux"


class FeeSchedule(TenantModel):
    """Grille des frais d'une année scolaire."""

    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="fees")
    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=14, choices=FeeKind.choices)
    amount = models.DecimalField("montant (FCFA)", max_digits=12, decimal_places=0)
    applies_to = models.CharField(max_length=6, choices=AppliesTo.choices, default=AppliesTo.PAYING)
    due_day = models.PositiveSmallIntegerField("jour d'échéance du mois", null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["academic_year", "kind", "name"]
        constraints = [models.CheckConstraint(condition=models.Q(amount__gte=0), name="fee_amount_nonneg")]


class DiscountKind(models.TextChoices):
    AMOUNT = "MONTANT", "Montant fixe"
    PERCENT = "POURCENT", "Pourcentage"


class StudentDiscount(TenantModel):
    """Réduction accordée (et validée par un responsable) à un talibé pour une année."""

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="discounts")
    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="+")
    label = models.CharField(max_length=160)
    kind = models.CharField(max_length=8, choices=DiscountKind.choices, default=DiscountKind.PERCENT)
    value = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.TextField(blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    is_active = models.BooleanField(default=True)


class Due(TenantModel):
    """Échéance à payer (mensualité, inscription, frais exceptionnel). Sert aux impayés/dettes."""

    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="dues")
    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="dues")
    fee_schedule = models.ForeignKey(FeeSchedule, on_delete=models.SET_NULL, null=True, blank=True, related_name="dues")
    kind = models.CharField(max_length=14, choices=FeeKind.choices)
    label = models.CharField(max_length=160)  # « Mensualité novembre 2026 »
    period = models.DateField(null=True, blank=True)  # 1er jour du mois concerné
    due_date = models.DateField()
    amount = models.DecimalField(max_digits=12, decimal_places=0)
    is_cancelled = models.BooleanField(default=False)

    class Meta:
        ordering = ["due_date"]
        constraints = [
            # Idempotence de la génération des mensualités.
            models.UniqueConstraint(
                fields=["student", "fee_schedule", "period"],
                condition=models.Q(period__isnull=False, fee_schedule__isnull=False),
                name="uniq_due_per_period",
            ),
        ]
        indexes = [models.Index(fields=["establishment", "due_date"])]


class PaymentMethod(models.TextChoices):
    CASH = "ESPECES", "Espèces"
    WAVE = "WAVE", "Wave"
    ORANGE = "ORANGE_MONEY", "Orange Money"
    TRANSFER = "VIREMENT", "Virement bancaire"
    OTHER = "AUTRE", "Autre"


class PaymentStatus(models.TextChoices):
    PAID = "PAYE", "Payé"
    CANCELLED = "ANNULE", "Annulé"


class Payment(TenantModel):
    """Un paiement n'est jamais supprimé : il est ANNULÉ avec motif (traçabilité)."""

    receipt_number = models.CharField(max_length=30, editable=False)
    student = models.ForeignKey("students.Student", on_delete=models.PROTECT, related_name="payments")
    due = models.ForeignKey(Due, on_delete=models.SET_NULL, null=True, blank=True, related_name="payments")
    fee_kind = models.CharField(max_length=14, choices=FeeKind.choices, default=FeeKind.MONTHLY)
    period_label = models.CharField(max_length=60, blank=True)  # « Novembre 2026 »
    amount = models.DecimalField("montant (FCFA)", max_digits=12, decimal_places=0)
    date = models.DateField(default=timezone.localdate)
    method = models.CharField(max_length=14, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    reference = models.CharField("référence de transaction", max_length=80, blank=True)
    status = models.CharField(max_length=6, choices=PaymentStatus.choices, default=PaymentStatus.PAID)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    notes = models.TextField(blank=True)
    cancelled_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["establishment", "receipt_number"], name="uniq_receipt_number"),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="payment_amount_positive"),
        ]
        indexes = [models.Index(fields=["establishment", "-date"])]


class ExpenseCategory(models.TextChoices):
    FOOD = "ALIMENTATION", "Alimentation"
    HEALTH = "SANTE", "Santé"
    MAINTENANCE = "ENTRETIEN", "Entretien"
    SALARIES = "SALAIRES", "Salaires"
    ENERGY = "ENERGIE", "Énergie / eau"
    SUPPLIES = "FOURNITURES", "Fournitures"
    OTHER = "AUTRE", "Autre"


class ExpenseStatus(models.TextChoices):
    PENDING = "EN_ATTENTE", "En attente de validation"
    APPROVED = "VALIDEE", "Validée"
    REJECTED = "REFUSEE", "Refusée"
    CANCELLED = "ANNULEE", "Annulée"


class Expense(TenantModel):
    category = models.CharField(max_length=14, choices=ExpenseCategory.choices, default=ExpenseCategory.OTHER)
    title = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=0)
    date = models.DateField(default=timezone.localdate)
    paid_to = models.CharField("bénéficiaire", max_length=200, blank=True)
    reference = models.CharField(max_length=80, blank=True)
    attachment = models.FileField(upload_to="finance/justificatifs/", blank=True, null=True, validators=[validate_document])
    status = models.CharField(max_length=10, choices=ExpenseStatus.choices, default=ExpenseStatus.APPROVED)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.CharField(max_length=255, blank=True)
    # Annulation (jamais de suppression) : motif obligatoire, auteur et date conservés.
    cancel_reason = models.CharField(max_length=255, blank=True)
    cancelled_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name="expense_amount_positive")]
        indexes = [models.Index(fields=["establishment", "-date"])]
