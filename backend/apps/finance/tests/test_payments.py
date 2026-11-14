import datetime

import pytest

from apps.audit.models import AuditLog
from apps.finance.models import Payment
from conftest import client_for

pytestmark = pytest.mark.django_db


def pay(c, student, amount=5000, **kw):
    return c.post("/api/payments/", {"student": str(student.pk), "amount": amount, "method": "ESPECES", **kw}, format="json")


# ---------- droits ----------
def test_payment_roles(api, assistant, teacher, parent, mk_student):
    s = mk_student()
    assert pay(client_for(teacher), s).status_code == 403
    assert pay(client_for(parent), s).status_code == 403
    assert pay(client_for(assistant), s).status_code == 403  # sans can_view_finance
    assistant.can_view_finance = True
    assistant.save()
    r = pay(client_for(assistant), s)
    assert r.status_code == 201 and r.json()["recorded_by_name"] == assistant.full_name
    for u in (teacher, parent):
        assert client_for(u).get("/api/payments/").status_code == 403
        assert client_for(u).get(f"/api/payments/{r.json()['id']}/").status_code == 403


def test_assistant_with_finance_cannot_cancel(api, assistant, mk_student):
    assistant.can_view_finance = True
    assistant.save()
    p = pay(api, mk_student()).json()
    r = client_for(assistant).post(f"/api/payments/{p['id']}/cancel/", {"reason": "Erreur de saisie"}, format="json")
    assert r.status_code == 403
    assert Payment.objects.get(pk=p["id"]).status == "PAYE"


def test_unauthenticated_denied():
    from rest_framework.test import APIClient

    assert APIClient().get("/api/payments/").status_code in (401, 403)


# ---------- numérotation des reçus ----------
def test_receipt_numbers_sequential_and_unique(api, mk_student):
    s = mk_student()
    year = datetime.date.today().year
    numbers = [pay(api, s, 1000 + i).json()["receipt_number"] for i in range(12)]
    assert numbers == [f"REC-{year}-{i:04d}" for i in range(1, 13)]
    assert len(set(Payment.objects.values_list("receipt_number", flat=True))) == 12


def test_cancelled_payment_keeps_its_number_and_next_continues(api, mk_student):
    s = mk_student()
    p1 = pay(api, s).json()
    api.post(f"/api/payments/{p1['id']}/cancel/", {"reason": "Erreur"}, format="json")
    p2 = pay(api, s).json()
    assert p1["receipt_number"].endswith("0001") and p2["receipt_number"].endswith("0002")


def test_receipt_numbering_independent_between_establishments(api, other_director, other_est, mk_student):
    from apps.students.models import Student

    pay(api, mk_student())
    foreign = Student.objects.create(establishment=other_est, first_name="X", last_name="Y", gender="M")
    r = pay(client_for(other_director), foreign)
    assert r.status_code == 201 and r.json()["receipt_number"].endswith("-0001")


# ---------- règles de montant ----------
def test_amount_validation(api, mk_student):
    s = mk_student()
    assert pay(api, s, 0).status_code == 400
    assert pay(api, s, -100).status_code == 400
    assert pay(api, s, "abc").status_code == 400
    assert pay(api, s, "1500.50").status_code == 400
    assert pay(api, s, method="BITCOIN").status_code == 400
    assert Payment.objects.count() == 0


def test_future_date_rejected(api, mk_student):
    assert pay(api, mk_student(), date="2999-01-01").status_code == 400


def test_methods_and_reference_recorded_without_simulation(api, mk_student):
    s = mk_student()
    for method in ("ESPECES", "WAVE", "ORANGE_MONEY", "VIREMENT", "AUTRE"):
        r = pay(api, s, 1000, method=method, reference="TX-123" if method != "ESPECES" else "")
        assert r.status_code == 201, (method, r.content)
    assert Payment.objects.filter(method="WAVE").get().reference == "TX-123"


def test_payment_against_due_cannot_exceed_balance(api, mk_student, make_due):
    s = mk_student()
    due = make_due(s, amount=10000)
    assert pay(api, s, 12000, due=str(due.pk)).status_code == 400
    assert pay(api, s, 6000, due=str(due.pk)).status_code == 201
    r = pay(api, s, 5000, due=str(due.pk))
    assert r.status_code == 400 and "solde restant" in str(r.json()) and "4000" in str(r.json())
    assert pay(api, s, 4000, due=str(due.pk)).status_code == 201
    r = pay(api, s, 1, due=str(due.pk))
    assert r.status_code == 400 and "soldée" in str(r.json())
    assert Payment.objects.count() == 2  # les refus n'ont consommé aucun numéro de reçu
    assert Payment.objects.order_by("created_at").last().receipt_number.endswith("0002")


def test_cancelled_payment_frees_the_balance(api, mk_student, make_due):
    s = mk_student()
    due = make_due(s, amount=10000)
    p = pay(api, s, 10000, due=str(due.pk)).json()
    assert pay(api, s, 1, due=str(due.pk)).status_code == 400
    api.post(f"/api/payments/{p['id']}/cancel/", {"reason": "Chèque sans provision"}, format="json")
    assert api.get(f"/api/finance/dues/{due.pk}/").json()["balance"] == 10000
    assert pay(api, s, 10000, due=str(due.pk)).status_code == 201


def test_due_inference_and_mismatches(api, mk_student, make_due):
    a, b = mk_student("A"), mk_student("B")
    due = make_due(a, amount=8000)
    r = api.post("/api/payments/", {"due": str(due.pk), "amount": 3000, "method": "WAVE"}, format="json")
    assert r.status_code == 201 and r.json()["student"] == str(a.pk) and r.json()["fee_kind"] == "MENSUALITE"
    assert pay(api, b, 1000, due=str(due.pk)).status_code == 400  # échéance d'un autre talibé
    assert api.post("/api/payments/", {"amount": 1000}, format="json").status_code == 400  # ni talibé ni échéance
    api.post(f"/api/finance/dues/{due.pk}/cancel/", {"reason": "x"}, format="json")  # a des paiements : refusé
    due2 = make_due(b, amount=2000)
    api.post(f"/api/finance/dues/{due2.pk}/cancel/", {"reason": "Annulée"}, format="json")
    assert pay(api, b, 1000, due=str(due2.pk)).status_code == 400  # échéance annulée


def test_payment_without_due_allowed(api, mk_student):
    r = pay(api, mk_student(), 2500, fee_kind="INSCRIPTION", period_label="Octobre 2026", notes="Acompte")
    assert r.status_code == 201 and r.json()["fee_kind"] == "INSCRIPTION" and r.json()["due"] is None


# ---------- annulation, immutabilité ----------
def test_cancel_requires_reason_and_keeps_record(api, director, mk_student):
    s = mk_student()
    p = pay(api, s, 7000).json()
    assert api.post(f"/api/payments/{p['id']}/cancel/", {}, format="json").status_code == 400
    assert api.post(f"/api/payments/{p['id']}/cancel/", {"reason": "  "}, format="json").status_code == 400
    r = api.post(f"/api/payments/{p['id']}/cancel/", {"reason": "Montant erroné"}, format="json")
    body = r.json()
    assert r.status_code == 200 and body["status"] == "ANNULE" and body["cancel_reason"] == "Montant erroné"
    assert body["cancelled_by_name"] == director.full_name and body["cancelled_at"]
    assert body["amount"] == 7000 and body["receipt_number"] == p["receipt_number"]
    assert api.post(f"/api/payments/{p['id']}/cancel/", {"reason": "Encore"}, format="json").status_code == 400
    assert Payment.objects.filter(pk=p["id"]).exists()
    log = AuditLog.objects.get(action="PAYMENT_CANCEL")
    assert log.changes["reason"] == "Montant erroné"


def test_no_update_no_delete(api, mk_student):
    p = pay(api, mk_student(), 7000).json()
    assert api.patch(f"/api/payments/{p['id']}/", {"amount": 1}, format="json").status_code in (403, 405)
    assert api.put(f"/api/payments/{p['id']}/", {"amount": 1}, format="json").status_code in (403, 405)
    assert api.delete(f"/api/payments/{p['id']}/").status_code in (403, 405)
    assert Payment.objects.get(pk=p["id"]).amount == 7000


def test_creation_is_audited(api, mk_student):
    p = pay(api, mk_student(), 3000).json()
    assert AuditLog.objects.filter(action="PAYMENT_CREATE", object_id=p["id"]).exists()


# ---------- périmètre, isolation, alias ----------
def test_isolation_between_establishments(api, other_director, mk_student, make_due):
    s = mk_student()
    due = make_due(s)
    p = pay(api, s, 1000, due=str(due.pk)).json()
    other = client_for(other_director)
    assert other.get("/api/payments/").json()["count"] == 0
    assert other.get(f"/api/payments/{p['id']}/").status_code == 404
    assert other.post(f"/api/payments/{p['id']}/cancel/", {"reason": "intrus"}, format="json").status_code == 404
    assert pay(other, s, 1000).status_code == 400  # talibé d'un autre Daara
    assert other.post("/api/payments/", {"due": str(due.pk), "amount": 100}, format="json").status_code == 400
    assert Payment.objects.count() == 1


def test_filters_and_alias(api, mk_student):
    a, b = mk_student("A"), mk_student("B")
    pay(api, a, 1000, method="WAVE")
    pay(api, b, 2000)
    assert api.get(f"/api/payments/?student={a.pk}").json()["count"] == 1
    assert api.get("/api/payments/?method=WAVE").json()["count"] == 1
    assert api.get("/api/payments/?search=Diop").json()["count"] == 2
    assert api.get("/api/finance/payments/").json()["count"] == 2


# ---------- espace parent ----------
def test_parent_sees_only_own_children_payments(api, parent, mk_student, link_parent):
    mine, other = mk_student("Mine"), mk_student("Other")
    link_parent(mine)
    pay(api, mine, 1000, notes="note interne")
    pay(api, other, 9000)
    c = client_for(parent)
    r = c.get("/api/finance/my-children-payments/")
    assert r.status_code == 200
    rows = r.json()["results"]
    assert len(rows) == 1 and rows[0]["student"] == str(mine.pk) and rows[0]["amount"] == 1000
    assert not ({"recorded_by_name", "notes", "reference", "cancel_reason", "cancelled_by_name"} & set(rows[0]))
    assert c.get(f"/api/finance/my-children-payments/?student={other.pk}").json()["count"] == 0


def test_parent_has_no_other_finance_access(api, parent, mk_student, link_parent):
    s = mk_student()
    link_parent(s)
    p = pay(api, s).json()
    c = client_for(parent)
    for url in ("/api/payments/", f"/api/payments/{p['id']}/", "/api/finance/dues/", "/api/finance/arrears/", "/api/finance/summary/", "/api/expenses/"):
        assert c.get(url).status_code == 403, url
    assert c.post(f"/api/payments/{p['id']}/cancel/", {"reason": "abc"}, format="json").status_code == 403


def test_my_children_payments_denied_to_staff_roles(api, assistant, teacher):
    for u in (assistant, teacher):
        assert client_for(u).get("/api/finance/my-children-payments/").status_code == 403
    assert api.get("/api/finance/my-children-payments/").status_code == 403


def test_parent_of_other_establishment_isolated(api, other_director, parent, mk_student, link_parent):
    s = mk_student()
    link_parent(s)
    pay(api, s)
    from conftest import make_user

    intruder = make_user(other_director.establishment, "PARENT", "parent-b")
    assert client_for(intruder).get("/api/finance/my-children-payments/").json()["count"] == 0
