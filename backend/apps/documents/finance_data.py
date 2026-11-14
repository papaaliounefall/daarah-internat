"""Agrégats du rapport financier PDF, calculés directement depuis ``finance`` et ``social``.

Définitions (documentées dans docs/api/documents.md) :
- recettes = paiements au statut PAYE de la période + dons non annulés de la période ;
- dépenses = dépenses au statut VALIDEE de la période (les « en attente / refusées / annulées » sont exclues) ;
- solde = recettes - dépenses ;
- impayés = échéances non annulées échues au plus tard à la date de fin, dont le restant dû
  (montant - paiements PAYE rattachés) est > 0, regroupées par talibé.
"""
from __future__ import annotations

from decimal import Decimal

from django.apps import apps
from django.db.models import Count, DecimalField, ExpressionWrapper, F, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncMonth

ZERO = Decimal(0)
UNPAID_LIST_LIMIT = 40


def _label(enum_name: str, code: str) -> str:
    from apps.finance import models as fm

    try:
        return getattr(fm, enum_name)(code).label
    except (AttributeError, ValueError):
        return code


def _sum(qs, field="amount") -> Decimal:
    return qs.aggregate(t=Coalesce(Sum(field), Value(ZERO), output_field=DecimalField()))["t"]


def finance_report_data(establishment, date_from, date_to) -> dict:
    Payment = apps.get_model("finance", "Payment")
    Expense = apps.get_model("finance", "Expense")
    Due = apps.get_model("finance", "Due")
    Donation = apps.get_model("social", "Donation")

    payments = Payment.objects.filter(establishment=establishment, status="PAYE", date__range=(date_from, date_to))
    donations = Donation.objects.filter(establishment=establishment, is_cancelled=False, date__range=(date_from, date_to))
    expenses = Expense.objects.filter(establishment=establishment, status="VALIDEE", date__range=(date_from, date_to))

    pay_total, don_total, exp_total = _sum(payments), _sum(donations), _sum(expenses)
    revenue = pay_total + don_total

    # --- évolution mensuelle (recettes / dépenses) ---
    months: dict[str, dict] = {}

    def bucket(d):
        return months.setdefault(d.strftime("%Y-%m"), {"recettes": ZERO, "depenses": ZERO})

    for model_qs, key in ((payments, "recettes"), (donations, "recettes"), (expenses, "depenses")):
        for row in model_qs.annotate(m=TruncMonth("date")).values("m").annotate(t=Sum("amount")):
            bucket(row["m"])[key] += row["t"]

    # --- impayés ---
    paid = Coalesce(Sum("payments__amount", filter=Q(payments__status="PAYE")), Value(ZERO), output_field=DecimalField())
    dues = (
        Due.objects.filter(establishment=establishment, is_cancelled=False, due_date__lte=date_to)
        .annotate(paid=paid)
        .annotate(remaining=ExpressionWrapper(F("amount") - F("paid"), output_field=DecimalField()))
        .filter(remaining__gt=0)
        .select_related("student")
    )
    per_student: dict = {}
    unpaid_total, unpaid_count = ZERO, 0
    for due in dues.order_by("due_date"):
        unpaid_total += due.remaining
        unpaid_count += 1
        row = per_student.setdefault(due.student_id, {
            "student": f"{due.student.last_name.upper()} {due.student.first_name}".strip(),
            "registration_number": due.student.registration_number, "remaining": ZERO, "count": 0,
            "oldest": due.due_date,
        })
        row["remaining"] += due.remaining
        row["count"] += 1
    unpaid = sorted(per_student.values(), key=lambda r: r["remaining"], reverse=True)

    return {
        "date_from": date_from, "date_to": date_to,
        "payments_total": pay_total, "payments_count": payments.count(),
        "donations_total": don_total, "donations_count": donations.count(),
        "revenue_total": revenue, "expenses_total": exp_total, "expenses_count": expenses.count(),
        "balance": revenue - exp_total,
        "by_method": [(_label("PaymentMethod", r["method"]), r["t"], r["n"]) for r in
                      payments.values("method").annotate(t=Sum("amount"), n=Count("id")).order_by("-t")],
        "by_kind": [(_label("FeeKind", r["fee_kind"]), r["t"], r["n"]) for r in
                    payments.values("fee_kind").annotate(t=Sum("amount"), n=Count("id")).order_by("-t")],
        "by_category": [(_label("ExpenseCategory", r["category"]), r["t"], r["n"]) for r in
                        expenses.values("category").annotate(t=Sum("amount"), n=Count("id")).order_by("-t")],
        "months": [(k, v["recettes"], v["depenses"]) for k, v in sorted(months.items())],
        "cancelled_payments_count": Payment.objects.filter(
            establishment=establishment, status="ANNULE", date__range=(date_from, date_to)).count(),
        "pending_expenses_count": Expense.objects.filter(
            establishment=establishment, status="EN_ATTENTE", date__range=(date_from, date_to)).count(),
        "unpaid_total": unpaid_total, "unpaid_count": unpaid_count, "unpaid_students": len(unpaid),
        "unpaid": unpaid[:UNPAID_LIST_LIMIT], "unpaid_truncated": len(unpaid) > UNPAID_LIST_LIMIT,
    }
