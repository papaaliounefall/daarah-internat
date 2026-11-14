"""Calculs de lecture des rapports financiers (données réelles issues de la base).

Réutilisable par d'autres applications (ex. export PDF) : ``financial_summary`` et ``arrears_rows``
ne dépendent d'aucune requête HTTP.
"""
from __future__ import annotations

import datetime
from collections import defaultdict
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.social.models import Donation

from .models import Due, Expense, ExpenseStatus, FeeKind, Payment, PaymentMethod, PaymentStatus
from .services import annotate_dues

MAX_MONTHS = 60
D0 = Decimal("0")


def _months(start: datetime.date, end: datetime.date):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield datetime.date(y, m, 1)
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def _monthly(qs, field="date"):
    rows = qs.annotate(m=TruncMonth(field)).values("m").annotate(t=Sum("amount")).order_by("m")
    return {(r["m"].date() if hasattr(r["m"], "date") else r["m"]).replace(day=1): r["t"] or D0 for r in rows}


def default_period(today=None):
    today = today or timezone.localdate()
    return datetime.date(today.year, 1, 1), today


def financial_summary(establishment, start: datetime.date, end: datetime.date) -> dict:
    if start > end:
        raise ValidationError({"from": "La date de début doit précéder la date de fin."})
    if (end.year - start.year) * 12 + end.month - start.month >= MAX_MONTHS:
        raise ValidationError({"detail": f"Période trop longue (maximum {MAX_MONTHS} mois)."})
    window = (start, end)
    payments = Payment.objects.filter(establishment=establishment, status=PaymentStatus.PAID, date__range=window)
    donations = Donation.objects.filter(establishment=establishment, is_cancelled=False, date__range=window)
    expenses = Expense.objects.filter(establishment=establishment, status=ExpenseStatus.APPROVED, date__range=window)

    total_payments = payments.aggregate(t=Sum("amount"))["t"] or D0
    total_donations = donations.aggregate(t=Sum("amount"))["t"] or D0
    total_expenses = expenses.aggregate(t=Sum("amount"))["t"] or D0

    # Répartition des recettes
    kind_labels = dict(FeeKind.choices)
    by_type = [
        {"key": r["fee_kind"], "label": kind_labels.get(r["fee_kind"], r["fee_kind"]), "amount": r["t"], "count": r["n"]}
        for r in payments.values("fee_kind").annotate(t=Sum("amount"), n=Count("pk")).order_by("-t")
    ]
    if total_donations:
        by_type.append({"key": "DON", "label": "Dons", "amount": total_donations, "count": donations.count()})
    method_labels = dict(PaymentMethod.choices)
    by_method: dict = defaultdict(lambda: {"amount": D0, "count": 0})
    for qs in (payments, donations):
        for r in qs.values("method").annotate(t=Sum("amount"), n=Count("pk")):
            by_method[r["method"]]["amount"] += r["t"]
            by_method[r["method"]]["count"] += r["n"]
    by_method_rows = sorted(
        ({"key": k, "label": method_labels.get(k, k), **v} for k, v in by_method.items()), key=lambda r: -r["amount"]
    )

    # Évolution mensuelle
    pm, dm, em = _monthly(payments), _monthly(donations), _monthly(expenses)
    monthly = []
    for m in _months(start, end):
        rev_p, rev_d, exp = pm.get(m, D0), dm.get(m, D0), em.get(m, D0)
        monthly.append({
            "month": m.strftime("%Y-%m"), "payments": rev_p, "donations": rev_d, "revenue": rev_p + rev_d,
            "expenses": exp, "balance": rev_p + rev_d - exp,
        })

    # Impayés à la date de fin : échéances échues, solde = montant - paiements encaissés jusqu'à cette date.
    dues = Due.objects.filter(establishment=establishment, is_cancelled=False, due_date__lte=end)
    dues = dues.annotate(
        paid_to_date=Sum("payments__amount", filter=Q(payments__status=PaymentStatus.PAID, payments__date__lte=end))
    )
    outstanding, outstanding_count, students = D0, 0, set()
    for d in dues.values("student_id", "amount", "paid_to_date"):
        bal = d["amount"] - (d["paid_to_date"] or D0)
        if bal > 0:
            outstanding += bal
            outstanding_count += 1
            students.add(d["student_id"])

    pending = Expense.objects.filter(establishment=establishment, status=ExpenseStatus.PENDING)
    revenue = total_payments + total_donations
    return {
        "from": start, "to": end,
        "total_payments": total_payments, "total_donations": total_donations,
        "total_revenue": revenue, "total_expenses": total_expenses, "balance": revenue - total_expenses,
        "outstanding": outstanding, "outstanding_dues_count": outstanding_count, "students_in_arrears": len(students),
        "pending_expenses_count": pending.count(), "pending_expenses_amount": pending.aggregate(t=Sum("amount"))["t"] or D0,
        "revenue_by_type": by_type, "revenue_by_method": by_method_rows, "monthly": monthly,
    }


def arrears_rows(establishment, *, academic_year=None, student=None, overdue_only=True, today=None, with_dues=False):
    """Impayés par talibé : total dû, total payé, solde, retard. Triés par solde décroissant."""
    today = today or timezone.localdate()
    qs = Due.objects.filter(establishment=establishment, is_cancelled=False).select_related("student")
    if academic_year is not None:
        qs = qs.filter(academic_year=academic_year)
    if student is not None:
        qs = qs.filter(student=student)
    if overdue_only:
        qs = qs.filter(due_date__lte=today)
    rows: dict = {}
    for d in annotate_dues(qs).order_by("due_date"):
        bal = max(d.amount - d.paid, D0)
        r = rows.setdefault(d.student_id, {
            "student": str(d.student_id), "student_name": d.student.full_name,
            "registration_number": d.student.registration_number, "student_status": d.student.status,
            "total_due": D0, "total_paid": D0, "balance": D0, "overdue_count": 0, "oldest_due_date": None,
            **({"dues": []} if with_dues else {}),
        })
        r["total_due"] += d.amount
        r["total_paid"] += min(d.paid, d.amount)
        r["balance"] += bal
        if bal > 0 and d.due_date <= today:
            r["overdue_count"] += 1
            r["oldest_due_date"] = r["oldest_due_date"] or d.due_date
        if with_dues and bal > 0:
            r["dues"].append({"id": str(d.pk), "label": d.label, "due_date": d.due_date, "amount": d.amount,
                              "paid_amount": d.paid, "balance": bal})
    result = [r for r in rows.values() if r["balance"] > 0]
    return sorted(result, key=lambda r: (-r["balance"], r["student_name"]))
