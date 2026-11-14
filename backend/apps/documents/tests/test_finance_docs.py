import datetime
import re
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.documents.finance_data import finance_report_data
from apps.documents.pdf.common import format_fcfa
from apps.finance.models import Due, Expense, Payment
from apps.social.models import Donation
from conftest import client_for, make_user

pytestmark = pytest.mark.django_db

TODAY = datetime.date.today()


@pytest.fixture
def payment(est, student, director, year):
    return Payment.objects.create(
        establishment=est, receipt_number="REC-2026-0001", student=student, amount=Decimal("35000"),
        date=TODAY, method="WAVE", reference="WV-123", period_label="Novembre 2026", recorded_by=director)


@pytest.fixture
def finance_assistant(est):
    return make_user(est, "ASSISTANT", "assistante-fin", can_view_finance=True)


def page_text(pdf: bytes) -> str:
    fitz = pytest.importorskip("fitz")
    return "\n".join(p.get_text() for p in fitz.open(stream=pdf, filetype="pdf"))


# --------------------------------------------------------------------------- formatage
@pytest.mark.parametrize("value,expected", [
    (35000, "35 000 FCFA"), (Decimal("1250000"), "1 250 000 FCFA"), (0, "0 FCFA"), (500, "500 FCFA"),
    (-12000, "-12 000 FCFA"),
])
def test_format_fcfa(value, expected):
    assert format_fcfa(value) == expected


# --------------------------------------------------------------------------- reçu
def test_receipt_pdf_content(api, payment):
    r = api.get(f"/api/documents/receipts/{payment.pk}/")
    assert r.status_code == 200 and r["Content-Type"] == "application/pdf" and r.content.startswith(b"%PDF")
    text = page_text(r.content)
    for expected in ("REÇU DE PAIEMENT", "REC-2026-0001", "35 000 FCFA", "FALL Mansour", "Wave", "WV-123",
                     "Novembre 2026", "Daara A", payment.student.registration_number, "Directeur"):
        assert expected in text, expected
    assert "ANNULÉ" not in text
    assert AuditLog.objects.filter(action="PDF_RECEIPT", object_id=str(payment.pk)).exists()


def test_receipt_is_a5(api, payment):
    fitz = pytest.importorskip("fitz")
    page = fitz.open(stream=api.get(f"/api/documents/receipts/{payment.pk}/").content, filetype="pdf")[0]
    assert (round(page.rect.width / 72 * 25.4), round(page.rect.height / 72 * 25.4)) == (148, 210)


def test_cancelled_receipt_is_marked(api, payment, director):
    payment.status, payment.cancel_reason = "ANNULE", "Erreur de saisie"
    payment.cancelled_by, payment.cancelled_at = director, timezone.now()
    payment.save()
    text = page_text(api.get(f"/api/documents/receipts/{payment.pk}/").content)
    assert "ANNULÉ" in text and "PAIEMENT ANNULÉ" in text and "Erreur de saisie" in text
    assert "35 000 FCFA" in text


def test_receipt_with_arabic_student_name(api, payment):
    payment.student.first_name, payment.student.last_name = "محمد", "فال"
    payment.student.save()
    r = api.get(f"/api/documents/receipts/{payment.pk}/")
    assert r.status_code == 200 and b"Amiri" in r.content


def test_receipt_letterhead_uses_official_arabic_for_default_establishment(est, api, payment, settings):
    settings.DEFAULT_ESTABLISHMENT_SLUG = est.slug
    r = api.get(f"/api/documents/receipts/{payment.pk}/")
    assert b"Amiri" in r.content


def test_receipt_permissions(api, payment, assistant, finance_assistant, teacher, parent, other_director, est,
                             child_of_parent):
    url = f"/api/documents/receipts/{payment.pk}/"
    assert client_for(assistant).get(url).status_code == 403          # assistant sans can_view_finance
    assert client_for(finance_assistant).get(url).status_code == 200
    assert client_for(teacher).get(url).status_code == 403
    assert client_for(parent).get(url).status_code == 200              # parent : paiement de son enfant
    assert client_for(other_director).get(url).status_code == 404      # autre établissement


def test_parent_cannot_get_receipt_of_other_child(parent, payment):
    # parent sans lien avec l'élève du paiement
    assert client_for(parent).get(f"/api/documents/receipts/{payment.pk}/").status_code == 404


def test_receipt_unknown_id_is_404(api):
    assert api.get("/api/documents/receipts/00000000-0000-0000-0000-000000000000/").status_code == 404


# --------------------------------------------------------------------------- rapport financier
@pytest.fixture
def finance_data(est, student, director, year, other_est, make_student):
    d = TODAY
    Payment.objects.create(establishment=est, receipt_number="R1", student=student, amount=50000, date=d,
                           method="ESPECES", recorded_by=director)
    Payment.objects.create(establishment=est, receipt_number="R2", student=student, amount=20000, date=d,
                           method="WAVE", recorded_by=director)
    Payment.objects.create(establishment=est, receipt_number="R3", student=student, amount=99999, date=d,
                           method="WAVE", status="ANNULE", recorded_by=director)   # annulé : exclu
    Donation.objects.create(establishment=est, donor_name="Donateur", amount=30000, date=d, receipt_number="D1",
                            recorded_by=director)
    Donation.objects.create(establishment=est, donor_name="Annulé", amount=7777, date=d, receipt_number="D2",
                            recorded_by=director, is_cancelled=True)
    Expense.objects.create(establishment=est, category="ALIMENTATION", title="Riz", amount=40000, date=d,
                           status="VALIDEE", created_by=director)
    Expense.objects.create(establishment=est, category="ENERGIE", title="En attente", amount=8888, date=d,
                           status="EN_ATTENTE", created_by=director)
    due = Due.objects.create(establishment=est, student=student, academic_year=year, kind="MENSUALITE",
                             label="Mensualité", due_date=d - datetime.timedelta(days=5), amount=35000)
    Payment.objects.create(establishment=est, receipt_number="R4", student=student, amount=10000, date=d,
                           method="ESPECES", due=due, recorded_by=director)
    # autre établissement : ne doit JAMAIS apparaître
    foreign = make_student(establishment=other_est, first_name="Etranger")
    other_user = make_user(other_est, "DIRECTEUR", "dir-b2")
    Payment.objects.create(establishment=other_est, receipt_number="R1", student=foreign, amount=1_000_000, date=d,
                           method="ESPECES", recorded_by=other_user)
    Expense.objects.create(establishment=other_est, title="x", amount=555555, date=d, status="VALIDEE",
                           created_by=other_user)
    return due


def test_report_data_is_computed_from_validated_records_only(est, finance_data):
    data = finance_report_data(est, TODAY.replace(day=1), TODAY)
    assert data["payments_total"] == 80000                     # 50 000 + 20 000 + 10 000 (annulé exclu)
    assert data["donations_total"] == 30000                    # don annulé exclu
    assert data["revenue_total"] == 110000
    assert data["expenses_total"] == 40000                     # seule la dépense VALIDEE compte
    assert data["balance"] == 70000
    assert data["cancelled_payments_count"] == 1 and data["pending_expenses_count"] == 1
    # impayés : 35 000 - 10 000 payés = 25 000
    assert data["unpaid_total"] == 25000 and data["unpaid_count"] == 1 and data["unpaid_students"] == 1
    assert data["unpaid"][0]["remaining"] == 25000
    assert sum(t for _l, t, _n in data["by_method"]) == 80000
    assert [m for m, *_ in data["months"]] == [TODAY.strftime("%Y-%m")]


def test_report_unpaid_excludes_cancelled_due_and_settled_due(est, finance_data, student, year, director):
    Due.objects.create(establishment=est, student=student, academic_year=year, kind="MENSUALITE", label="Annulée",
                       due_date=TODAY - datetime.timedelta(days=9), amount=77000, is_cancelled=True)
    Due.objects.create(establishment=est, student=student, academic_year=year, kind="MENSUALITE", label="Future",
                       due_date=TODAY + datetime.timedelta(days=40), amount=66000)
    assert finance_report_data(est, TODAY.replace(day=1), TODAY)["unpaid_total"] == 25000


def test_report_pdf_endpoint(api, finance_data):
    r = api.get(f"/api/documents/finance-report/?from={TODAY.replace(day=1)}&to={TODAY}")
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    text = page_text(r.content)
    for expected in ("RAPPORT FINANCIER", "110 000 FCFA", "40 000 FCFA", "70 000 FCFA", "25 000 FCFA", "FALL Mansour"):
        assert expected in text, expected
    assert "1 000 000" not in text and "555 555" not in text  # rien de l'autre établissement
    log = AuditLog.objects.get(action="PDF_FINANCE_REPORT")
    assert log.changes["revenue"] == "110000"


def test_report_defaults_and_validation(api):
    assert api.get("/api/documents/finance-report/").status_code == 200
    assert api.get("/api/documents/finance-report/?from=pas-une-date").status_code == 400
    assert api.get("/api/documents/finance-report/?from=2026-12-01&to=2026-01-01").status_code == 400


def test_report_empty_period_still_renders(api):
    r = api.get("/api/documents/finance-report/?from=2001-01-01&to=2001-01-31")
    assert r.status_code == 200 and "0 FCFA" in page_text(r.content)


def test_report_many_unpaid_students_paginates(api, est, year, make_student):
    for i in range(70):
        s = make_student(first_name=f"Eleve{i}", last_name=f"Nom{i}")
        Due.objects.create(establishment=est, student=s, academic_year=year, kind="MENSUALITE", label="m",
                           due_date=TODAY - datetime.timedelta(days=1), amount=1000 + i)
    r = api.get("/api/documents/finance-report/")
    assert r.status_code == 200
    assert "limitée" in page_text(r.content)


def test_report_permissions(assistant, finance_assistant, teacher, parent, other_director):
    url = "/api/documents/finance-report/"
    assert client_for(assistant).get(url).status_code == 403
    assert client_for(finance_assistant).get(url).status_code == 200
    assert client_for(teacher).get(url).status_code == 403
    assert client_for(parent).get(url).status_code == 403
    assert client_for(other_director).get(url).status_code == 200  # son propre établissement (vide)


def test_unauthenticated_report_rejected():
    from rest_framework.test import APIClient

    assert APIClient().get("/api/documents/finance-report/").status_code in (401, 403)
