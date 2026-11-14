import datetime
from decimal import Decimal

import pytest

from apps.finance.models import Due, FeeSchedule, StudentDiscount
from conftest import client_for

pytestmark = pytest.mark.django_db


def gen(api, Y, frm=1, to=3, **kw):
    return api.post("/api/finance/dues/generate/", {"from_month": f"{Y}-{frm:02d}", "to_month": f"{Y}-{to:02d}", **kw}, format="json")


# ---------- droits ----------
def test_finance_scope_for_assistant(api, assistant, teacher, parent, monthly_fee, mk_student):
    endpoints = ["/api/finance/fees/", "/api/finance/discounts/", "/api/finance/dues/", "/api/finance/arrears/", "/api/finance/summary/"]
    for url in endpoints:
        assert client_for(assistant).get(url).status_code == 403, url  # pas de can_view_finance
        assert client_for(teacher).get(url).status_code == 403, url
        assert client_for(parent).get(url).status_code == 403, url
        assert api.get(url).status_code == 200, url
    assistant.can_view_finance = True
    assistant.save()
    for url in endpoints:
        assert client_for(assistant).get(url).status_code == 200, url


def test_assistant_with_finance_cannot_configure(api, assistant, year, monthly_fee, mk_student):
    assistant.can_view_finance = True
    assistant.save()
    c = client_for(assistant)
    body = {"academic_year": str(year.pk), "name": "Inscription", "kind": "INSCRIPTION", "amount": 25000}
    assert c.post("/api/finance/fees/", body, format="json").status_code == 403
    assert c.patch(f"/api/finance/fees/{monthly_fee.pk}/", {"amount": 1}, format="json").status_code == 403
    s = mk_student()
    assert c.post("/api/finance/discounts/", {"student": str(s.pk), "academic_year": str(year.pk), "label": "x", "value": 10}, format="json").status_code == 403
    assert c.post("/api/finance/dues/generate/", {}, format="json").status_code == 403


# ---------- grille de frais ----------
def test_fee_schedule_crud_and_validation(api, year):
    base = {"academic_year": str(year.pk), "name": "Inscription", "kind": "INSCRIPTION", "amount": 25000, "applies_to": "TOUS"}
    r = api.post("/api/finance/fees/", base, format="json")
    assert r.status_code == 201 and r.json()["academic_year_name"] == year.name
    assert api.post("/api/finance/fees/", {**base, "amount": -1}, format="json").status_code == 400
    assert api.post("/api/finance/fees/", {**base, "due_day": 31}, format="json").status_code == 400
    assert api.delete(f"/api/finance/fees/{r.json()['id']}/").status_code in (403, 405)
    assert FeeSchedule.objects.count() == 1


def test_fee_year_of_other_establishment_rejected(other_director, year, other_est):
    r = client_for(other_director).post(
        "/api/finance/fees/", {"academic_year": str(year.pk), "name": "x", "kind": "MENSUALITE", "amount": 100}, format="json"
    )
    assert r.status_code == 400


# ---------- réductions ----------
def test_discount_approved_by_director_and_immutable_value(api, director, year, mk_student):
    s = mk_student()
    r = api.post("/api/finance/discounts/", {"student": str(s.pk), "academic_year": str(year.pk), "label": "Fratrie", "kind": "POURCENT", "value": 25}, format="json")
    assert r.status_code == 201 and r.json()["approved_by_name"] == director.full_name
    d = r.json()
    assert api.patch(f"/api/finance/discounts/{d['id']}/", {"value": 90}, format="json").status_code == 400
    assert api.patch(f"/api/finance/discounts/{d['id']}/", {"is_active": False}, format="json").status_code == 200
    bad = {"student": str(s.pk), "academic_year": str(year.pk), "label": "x"}
    assert api.post("/api/finance/discounts/", {**bad, "kind": "POURCENT", "value": 150}, format="json").status_code == 400
    assert api.post("/api/finance/discounts/", {**bad, "kind": "MONTANT", "value": 0}, format="json").status_code == 400
    assert api.delete(f"/api/finance/discounts/{d['id']}/").status_code in (403, 405)
    assert StudentDiscount.objects.filter(pk=d["id"]).exists()


# ---------- génération des échéances ----------
def test_generate_monthly_dues_for_paying_students_only(api, Y, monthly_fee, mk_student):
    paying, social = mk_student("Pay"), mk_student("Soc", status="SOCIAL")
    r = gen(api, Y)
    assert r.status_code == 200, r.content
    body = r.json()
    assert body["created"] == 3 and body["students"] == 1 and body["months"] == [f"{Y}-01", f"{Y}-02", f"{Y}-03"]
    assert Due.objects.filter(student=paying).count() == 3 and not Due.objects.filter(student=social).exists()
    first = Due.objects.filter(student=paying).order_by("due_date").first()
    assert first.amount == 10000 and first.due_date == datetime.date(Y, 1, 5) and first.period == datetime.date(Y, 1, 1)
    assert "janvier" in first.label


def test_generate_is_idempotent(api, Y, monthly_fee, mk_student):
    mk_student("A"), mk_student("B")
    assert gen(api, Y).json()["created"] == 6
    again = gen(api, Y).json()
    assert again["created"] == 0 and again["already_existing"] == 6
    assert Due.objects.count() == 6
    # étendre la période ne crée que les mois manquants
    wider = gen(api, Y, 1, 4).json()
    assert wider["created"] == 2 and Due.objects.count() == 8


def test_generate_respects_applies_to_all_and_social(api, Y, year, est, mk_student):
    mk_student("Pay"), mk_student("Soc", status="SOCIAL")
    FeeSchedule.objects.create(establishment=est, academic_year=year, name="Cotisation", kind="MENSUALITE", amount=2000, applies_to="TOUS")
    FeeSchedule.objects.create(establishment=est, academic_year=year, name="Aide repas", kind="MENSUALITE", amount=500, applies_to="SOCIAL")
    r = gen(api, Y, 1, 2).json()
    assert r["created"] == 2 * 2 + 1 * 2  # cotisation : 2 élèves x 2 mois ; aide repas : 1 x 2
    assert Due.objects.filter(student__status="SOCIAL", fee_schedule__name="Aide repas").count() == 2


def test_generate_registration_fee_once_per_student(api, Y, year, est, mk_student):
    mk_student("A"), mk_student("B")
    FeeSchedule.objects.create(establishment=est, academic_year=year, name="Inscription", kind="INSCRIPTION", amount=25000, applies_to="TOUS")
    assert gen(api, Y).json()["created"] == 2
    assert gen(api, Y).json()["created"] == 0
    assert Due.objects.filter(kind="INSCRIPTION").count() == 2


def test_generate_applies_discounts(api, Y, year, est, monthly_fee, mk_student):
    a, b, c = mk_student("A"), mk_student("B"), mk_student("C")
    StudentDiscount.objects.create(establishment=est, student=a, academic_year=year, label="50%", kind="POURCENT", value=50)
    StudentDiscount.objects.create(establishment=est, student=b, academic_year=year, label="Fixe", kind="MONTANT", value=3000)
    StudentDiscount.objects.create(establishment=est, student=c, academic_year=year, label="Bourse", kind="POURCENT", value=100)
    r = gen(api, Y, 1, 1).json()
    assert Due.objects.get(student=a).amount == 5000
    assert Due.objects.get(student=b).amount == 7000
    assert not Due.objects.filter(student=c).exists() and r["zero_amount_skipped"] == 1
    StudentDiscount.objects.create(establishment=est, student=a, academic_year=year, label="off", kind="POURCENT", value=10, is_active=False)
    assert gen(api, Y, 2, 2).json()["created"] == 2


def test_generate_skips_months_before_enrollment_and_archived(api, Y, monthly_fee, mk_student):
    late = mk_student("Late", enrolled_on=datetime.date(Y, 3, 15))
    mk_student("Arch", is_archived=True)
    mk_student("NoEnroll", enroll=False)
    r = gen(api, Y).json()
    assert r["created"] == 1  # seulement mars pour Late
    assert Due.objects.get(student=late).period == datetime.date(Y, 3, 1)


def test_cancelled_due_is_not_regenerated(api, Y, monthly_fee, mk_student):
    mk_student()
    gen(api, Y, 1, 1)
    due = Due.objects.get()
    assert api.post(f"/api/finance/dues/{due.pk}/cancel/", {"reason": "Erreur de grille"}, format="json").status_code == 200
    assert gen(api, Y, 1, 1).json()["created"] == 0
    assert Due.objects.count() == 1 and Due.objects.get().is_cancelled


def test_generate_errors(api, Y, year, est, mk_student):
    mk_student()
    assert gen(api, Y).status_code == 400  # aucune grille
    FeeSchedule.objects.create(establishment=est, academic_year=year, name="M", kind="MENSUALITE", amount=100, applies_to="TOUS", is_active=False)
    assert gen(api, Y).status_code == 400  # grille inactive
    assert api.post("/api/finance/dues/generate/", {"from_month": "2026-13"}, format="json").status_code == 400
    year.is_closed = True
    year.save()
    FeeSchedule.objects.filter().update(is_active=True)
    assert gen(api, Y).status_code == 400  # année clôturée


def test_generate_isolated_per_establishment(api, other_director, Y, monthly_fee, mk_student):
    mk_student()
    other = client_for(other_director)
    r = other.post("/api/finance/dues/generate/", {"academic_year": str(monthly_fee.academic_year_id)}, format="json")
    assert r.status_code == 400  # année d'un autre Daara = inexistante
    assert Due.objects.count() == 0
    assert other.get("/api/finance/dues/").json()["count"] == 0


# ---------- échéances : lecture et état ----------
def test_due_status_filters_and_balance(api, est, mk_student, make_due):
    s = mk_student()
    unpaid, partial, paid = make_due(s, label="A"), make_due(s, label="B"), make_due(s, label="C")
    for due, amount in ((partial, 4000), (paid, 10000)):
        r = api.post("/api/payments/", {"student": str(s.pk), "due": str(due.pk), "amount": amount, "method": "ESPECES"}, format="json")
        assert r.status_code == 201, r.content
    rows = {d["label"]: d for d in api.get("/api/finance/dues/").json()["results"]}
    assert rows["A"]["status"] == "IMPAYEE" and rows["A"]["balance"] == 10000
    assert rows["B"]["status"] == "PARTIELLE" and rows["B"]["balance"] == 6000 and rows["B"]["paid_amount"] == 4000
    assert rows["C"]["status"] == "PAYEE" and rows["C"]["balance"] == 0
    for status, expected in (("IMPAYEE", {"A"}), ("PARTIELLE", {"B"}), ("PAYEE", {"C"})):
        got = {d["label"] for d in api.get(f"/api/finance/dues/?status={status}").json()["results"]}
        assert got == expected, status
    assert {d["label"] for d in api.get("/api/finance/dues/?overdue=true").json()["results"]} == {"A", "B"}
    assert api.get(f"/api/finance/dues/?student={s.pk}").json()["count"] == 3


def test_exceptional_due_creation_and_cancel_rules(api, year, mk_student):
    s = mk_student()
    body = {"student": str(s.pk), "academic_year": str(year.pk), "kind": "EXCEPTIONNEL", "label": "Sortie pédagogique", "due_date": "2026-12-01", "amount": 3000}
    r = api.post("/api/finance/dues/", body, format="json")
    assert r.status_code == 201 and r.json()["status"] == "IMPAYEE"
    assert api.post("/api/finance/dues/", {**body, "amount": 0}, format="json").status_code == 400
    due_id = r.json()["id"]
    api.post("/api/payments/", {"student": str(s.pk), "due": due_id, "amount": 1000}, format="json")
    r = api.post(f"/api/finance/dues/{due_id}/cancel/", {"reason": "Annulation de la sortie"}, format="json")
    assert r.status_code == 400  # déjà partiellement payée
    assert api.delete(f"/api/finance/dues/{due_id}/").status_code in (403, 405)


def test_due_cancel_requires_reason(api, mk_student, make_due):
    due = make_due(mk_student())
    assert api.post(f"/api/finance/dues/{due.pk}/cancel/", {}, format="json").status_code == 400
    assert api.post(f"/api/finance/dues/{due.pk}/cancel/", {"reason": "Doublon"}, format="json").status_code == 200
    assert api.post(f"/api/finance/dues/{due.pk}/cancel/", {"reason": "Doublon"}, format="json").status_code == 400
    assert Due.objects.filter(pk=due.pk).exists()


def test_dues_arrears_amounts_are_integers(api, Y, monthly_fee, mk_student):
    mk_student()
    gen(api, Y, 1, 1)
    row = api.get("/api/finance/dues/").json()["results"][0]
    assert Decimal(str(row["amount"])) == 10000
