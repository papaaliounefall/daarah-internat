"""Règles métier financières : paiements, dépenses, échéances.

Tout ce qui touche à un montant passe ici, dans une transaction. Rien n'est jamais supprimé :
un paiement ou une dépense s'ANNULE (motif obligatoire), une échéance s'annule tant qu'elle n'a rien reçu.
"""
from __future__ import annotations

import calendar
import datetime
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.academics.models import AcademicYear, Enrollment
from apps.core.models import Sequence
from apps.core.roles import Role
from apps.notifications.services import NotificationKind, notify_roles

from .models import (
    AppliesTo, DiscountKind, Due, Expense, ExpenseStatus, FeeKind, FeeSchedule, Payment, PaymentStatus,
    StudentDiscount,
)

MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre",
             "novembre", "décembre"]
ZERO = Value(Decimal("0"), output_field=DecimalField(max_digits=14, decimal_places=0))


def month_label(d: datetime.date) -> str:
    return f"{MONTHS_FR[d.month - 1]} {d.year}"


def require_reason(reason, field="reason") -> str:
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise ValidationError({field: "Un motif est obligatoire (3 caractères minimum)."})
    return reason[:255]


# --------------------------------------------------------------------------- échéances
def annotate_dues(qs):
    """Ajoute ``paid`` (somme des paiements non annulés) à un queryset d'échéances."""
    return qs.annotate(paid=Coalesce(Sum("payments__amount", filter=Q(payments__status=PaymentStatus.PAID)), ZERO))


def due_paid(due: Due) -> Decimal:
    return Payment.objects.filter(due=due, status=PaymentStatus.PAID).aggregate(t=Sum("amount"))["t"] or Decimal("0")


def due_status(due) -> str:
    """ANNULEE / PAYEE / PARTIELLE / IMPAYEE d'après ``due.paid`` (annoté)."""
    if due.is_cancelled:
        return "ANNULEE"
    paid = due.paid
    if paid >= due.amount:
        return "PAYEE"
    return "PARTIELLE" if paid > 0 else "IMPAYEE"


def _iter_months(start: datetime.date, end: datetime.date):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield datetime.date(y, m, 1)
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def discounted_amount(base: Decimal, discounts) -> Decimal:
    pct = min(sum((d.value for d in discounts if d.kind == DiscountKind.PERCENT), Decimal("0")), Decimal("100"))
    fixed = sum((d.value for d in discounts if d.kind == DiscountKind.AMOUNT), Decimal("0"))
    amount = (base * (Decimal("100") - pct) / Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return max(amount - fixed, Decimal("0"))


@transaction.atomic
def generate_dues(*, user, academic_year: AcademicYear, schedules=None, from_month=None, to_month=None, students=None) -> dict:
    """Génère (idempotent) les échéances de l'année pour les talibés inscrits concernés.

    - mensualités : une échéance par talibé, grille et mois, à partir du mois d'inscription ;
    - inscription / frais exceptionnel : une seule échéance par talibé et par grille ;
    - ``applies_to`` est confronté au statut courant du talibé (payant / social) ;
    - les réductions actives de l'année s'appliquent aux mensualités ;
    - une échéance déjà générée (même annulée) n'est jamais recréée ni modifiée.
    """
    est = user.establishment
    year = AcademicYear.objects.select_for_update().get(pk=academic_year.pk, establishment=est)  # sérialise les générations
    if year.is_closed:
        raise ValidationError({"academic_year": "Cette année scolaire est clôturée."})
    sched_qs = FeeSchedule.objects.filter(establishment=est, academic_year=year, is_active=True)
    if schedules:
        sched_qs = sched_qs.filter(pk__in=[s.pk for s in schedules])
    scheds = list(sched_qs)
    if not scheds:
        raise ValidationError({"detail": "Aucune grille de frais active pour cette année scolaire."})
    months = [
        m for m in _iter_months(year.start_date, year.end_date)
        if (from_month is None or m >= from_month.replace(day=1)) and (to_month is None or m <= to_month.replace(day=1))
    ]
    enr = Enrollment.objects.filter(
        establishment=est, academic_year=year, status="ACTIVE", student__is_archived=False
    ).select_related("student")
    if students:
        enr = enr.filter(student_id__in=[s.pk if hasattr(s, "pk") else s for s in students])
    enrollments = list(enr)

    discounts: dict = {}
    for d in StudentDiscount.objects.filter(establishment=est, academic_year=year, is_active=True):
        discounts.setdefault(d.student_id, []).append(d)

    existing = set(
        Due.objects.filter(establishment=est, academic_year=year, fee_schedule__in=scheds)
        .values_list("student_id", "fee_schedule_id", "period")
    )
    today = timezone.localdate()
    new, already, zero = [], 0, 0
    eligible_students = set()
    for sched in scheds:
        wanted = {AppliesTo.ALL: {"PAYANT", "SOCIAL"}, AppliesTo.PAYING: {"PAYANT"}, AppliesTo.SOCIAL: {"SOCIAL"}}[sched.applies_to]
        for e in enrollments:
            st = e.student
            if st.status not in wanted:
                continue
            if sched.kind == FeeKind.MONTHLY:
                periods = [m for m in months if m >= e.enrolled_on.replace(day=1)]
            else:
                periods = [None]
            for period in periods:
                key = (st.pk, sched.pk, period)
                if key in existing:
                    already += 1
                    continue
                amount = sched.amount
                if sched.kind == FeeKind.MONTHLY:
                    amount = discounted_amount(sched.amount, discounts.get(st.pk, []))
                    due_date = datetime.date(period.year, period.month, min(sched.due_day or 1, 28))
                    label = f"{sched.name} {month_label(period)}"
                elif sched.kind == FeeKind.REGISTRATION:
                    due_date, label = year.start_date, sched.name
                else:
                    due_date, label = today, sched.name
                if amount <= 0:
                    zero += 1
                    continue
                eligible_students.add(st.pk)
                new.append(Due(
                    establishment=est, student=st, academic_year=year, fee_schedule=sched, kind=sched.kind,
                    label=label[:160], period=period, due_date=due_date, amount=amount,
                ))
    Due.objects.bulk_create(new, batch_size=500, ignore_conflicts=True)
    return {
        "created": len(new), "already_existing": already, "zero_amount_skipped": zero,
        "students": len(eligible_students), "schedules": len(scheds), "months": [m.strftime("%Y-%m") for m in months],
    }


@transaction.atomic
def cancel_due(due: Due, *, reason: str) -> Due:
    require_reason(reason)
    due = Due.objects.select_for_update().get(pk=due.pk)
    if due.is_cancelled:
        raise ValidationError({"detail": "Cette échéance est déjà annulée."})
    if due_paid(due) > 0:
        raise ValidationError({"detail": "Cette échéance a déjà reçu des paiements : annulez d'abord les paiements concernés."})
    due.is_cancelled = True
    due.save(update_fields=["is_cancelled", "updated_at"])
    return due


# --------------------------------------------------------------------------- paiements
def _as_amount(value) -> Decimal:
    try:
        amount = Decimal(str(value))
    except Exception:  # noqa: BLE001
        raise ValidationError({"amount": "Montant invalide."})
    if amount <= 0:
        raise ValidationError({"amount": "Le montant doit être supérieur à zéro."})
    if amount != amount.to_integral_value():
        raise ValidationError({"amount": "Le montant doit être un nombre entier de FCFA."})
    return amount


@transaction.atomic
def record_payment(*, user, student, amount, method, date=None, reference="", notes="", due: Due | None = None,
                   fee_kind=None, period_label="") -> Payment:
    """Enregistre un paiement (partiel ou complet) avec un numéro de reçu séquentiel atomique.

    Si le paiement est rattaché à une échéance, le montant ne peut pas dépasser son solde restant
    (l'échéance est verrouillée pour empêcher deux paiements simultanés de la dépasser).
    """
    est = user.establishment
    amount = _as_amount(amount)
    if student.establishment_id != est.pk:
        raise ValidationError({"student": "Talibé introuvable."})
    today = timezone.localdate()
    date = date or today
    if date > today:
        raise ValidationError({"date": "La date du paiement ne peut pas être dans le futur."})
    if due is not None:
        due = Due.objects.select_for_update().get(pk=due.pk, establishment=est)
        if due.student_id != student.pk:
            raise ValidationError({"due": "Cette échéance concerne un autre talibé."})
        if due.is_cancelled:
            raise ValidationError({"due": "Cette échéance est annulée."})
        remaining = due.amount - due_paid(due)
        if remaining <= 0:
            raise ValidationError({"due": "Cette échéance est déjà soldée."})
        if amount > remaining:
            raise ValidationError({"amount": f"Le montant dépasse le solde restant de l'échéance ({remaining:.0f} FCFA)."})
        fee_kind = due.kind
        period_label = period_label or (month_label(due.period).capitalize() if due.period else due.label)
    n = Sequence.next(est, "receipt", today.year)
    return Payment.objects.create(
        establishment=est, receipt_number=f"REC-{today.year}-{n:04d}", student=student, due=due,
        fee_kind=fee_kind or FeeKind.MONTHLY, period_label=period_label, amount=amount, date=date, method=method,
        reference=reference, notes=notes, recorded_by=user,
    )


@transaction.atomic
def cancel_payment(payment: Payment, *, user, reason: str) -> Payment:
    reason = require_reason(reason)
    payment = Payment.objects.select_for_update().get(pk=payment.pk)
    if payment.status == PaymentStatus.CANCELLED:
        raise ValidationError({"detail": "Ce paiement est déjà annulé."})
    payment.status = PaymentStatus.CANCELLED
    payment.cancel_reason = reason
    payment.cancelled_by = user
    payment.cancelled_at = timezone.now()
    payment.save(update_fields=["status", "cancel_reason", "cancelled_by", "cancelled_at", "updated_at"])
    return payment


# --------------------------------------------------------------------------- dépenses
@transaction.atomic
def create_expense(*, user, category, title, amount, date=None, paid_to="", reference="", attachment=None) -> Expense:
    """Crée une dépense. Au-dessus du seuil de l'établissement, seule celle du directeur est validée d'office ;
    les autres restent EN_ATTENTE jusqu'à décision du directeur (qui est alors notifié)."""
    est = user.establishment
    amount = _as_amount(amount)
    today = timezone.localdate()
    date = date or today
    if date > today:
        raise ValidationError({"date": "La date de la dépense ne peut pas être dans le futur."})
    now = timezone.now()
    if user.role == Role.DIRECTEUR:
        status, approved_by, decided_at = ExpenseStatus.APPROVED, user, now
    elif amount >= est.expense_approval_threshold:
        status, approved_by, decided_at = ExpenseStatus.PENDING, None, None
    else:
        status, approved_by, decided_at = ExpenseStatus.APPROVED, None, now  # sous le seuil : validation automatique
    expense = Expense.objects.create(
        establishment=est, category=category, title=title, amount=amount, date=date, paid_to=paid_to,
        reference=reference, attachment=attachment, status=status, created_by=user, approved_by=approved_by,
        decided_at=decided_at,
    )
    if status == ExpenseStatus.PENDING:
        notify_roles(
            est, [Role.DIRECTEUR], NotificationKind.FINANCE, "Dépense à valider",
            f"{user.full_name} a saisi une dépense de {amount:.0f} FCFA (« {title} ») en attente de votre validation.",
            link_type="expense", link_id=str(expense.pk), dedupe_key=f"expense-pending-{expense.pk}",
        )
    return expense


def _pending_locked(expense: Expense) -> Expense:
    expense = Expense.objects.select_for_update().get(pk=expense.pk)
    if expense.status != ExpenseStatus.PENDING:
        raise ValidationError({"detail": "Cette dépense n'est pas en attente de validation."})
    return expense


@transaction.atomic
def approve_expense(expense: Expense, *, user, note: str = "") -> Expense:
    expense = _pending_locked(expense)
    expense.status, expense.approved_by, expense.decided_at = ExpenseStatus.APPROVED, user, timezone.now()
    expense.decision_note = (note or "")[:255]
    expense.save(update_fields=["status", "approved_by", "decided_at", "decision_note", "updated_at"])
    return expense


@transaction.atomic
def reject_expense(expense: Expense, *, user, reason: str) -> Expense:
    reason = require_reason(reason)
    expense = _pending_locked(expense)
    expense.status, expense.approved_by, expense.decided_at = ExpenseStatus.REJECTED, user, timezone.now()
    expense.decision_note = reason
    expense.save(update_fields=["status", "approved_by", "decided_at", "decision_note", "updated_at"])
    return expense


@transaction.atomic
def cancel_expense(expense: Expense, *, user, reason: str) -> Expense:
    reason = require_reason(reason)
    expense = Expense.objects.select_for_update().get(pk=expense.pk)
    if expense.status not in (ExpenseStatus.APPROVED, ExpenseStatus.PENDING):
        raise ValidationError({"detail": "Seule une dépense validée ou en attente peut être annulée."})
    expense.status = ExpenseStatus.CANCELLED
    expense.cancel_reason, expense.cancelled_by, expense.cancelled_at = reason, user, timezone.now()
    expense.save(update_fields=["status", "cancel_reason", "cancelled_by", "cancelled_at", "updated_at"])
    return expense


def last_day(year: int, month: int) -> datetime.date:
    return datetime.date(year, month, calendar.monthrange(year, month)[1])
