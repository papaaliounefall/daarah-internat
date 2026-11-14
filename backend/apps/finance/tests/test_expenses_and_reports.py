import datetime

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.finance.models import Expense, Payment
from apps.notifications.models import Notification
from apps.social.models import Donation
from conftest import client_for

pytestmark = pytest.mark.django_db

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


@pytest.fixture
def fin_assistant(assistant):
    assistant.can_view_finance = True
    assistant.save()
    return assistant


def spend(c, amount=20000, **kw):
    return c.post("/api/expenses/", {"category": "ALIMENTATION", "title": "Riz", "amount": amount, "paid_to": "Grossiste", **kw}, format="json")


# ---------- droits ----------
def test_expense_roles(api, assistant, teacher, parent):
    assert spend(client_for(assistant)).status_code == 403  # pas de can_view_finance
    for u in (teacher, parent):
        assert client_for(u).get("/api/expenses/").status_code == 403
        assert spend(client_for(u)).status_code == 403
    assert spend(api).status_code == 201


# ---------- seuil de validation ----------
def test_director_expense_validated_even_above_threshold(api, director, est):
    est.expense_approval_threshold = 100000
    est.save()
    r = spend(api, 5_000_000)
    assert r.status_code == 201 and r.json()["status"] == "VALIDEE" and r.json()["approved_by_name"] == director.full_name
    assert Notification.objects.count() == 0


def test_assistant_below_threshold_auto_validated(est, fin_assistant):
    r = spend(client_for(fin_assistant), 99999)
    assert r.status_code == 201 and r.json()["status"] == "VALIDEE" and r.json()["approved_by_name"] == ""


def test_assistant_at_or_above_threshold_pending_and_director_notified(est, fin_assistant, director, teacher):
    c = client_for(fin_assistant)
    r = spend(c, 100000)  # le seuil lui-même déclenche la validation
    assert r.status_code == 201 and r.json()["status"] == "EN_ATTENTE" and r.json()["requires_approval"] is True
    notes = Notification.objects.all()
    assert notes.count() == 1 and notes[0].recipient_id == director.pk and notes[0].kind == "FINANCE"
    assert notes[0].link_type == "expense" and notes[0].link_id == r.json()["id"]
    assert spend(c, 250000).json()["status"] == "EN_ATTENTE"
    assert Notification.objects.filter(recipient=teacher).count() == 0


def test_threshold_follows_establishment_setting(est, fin_assistant):
    est.expense_approval_threshold = 5000
    est.save()
    assert spend(client_for(fin_assistant), 5000).json()["status"] == "EN_ATTENTE"
    assert spend(client_for(fin_assistant), 4999).json()["status"] == "VALIDEE"


def test_approve_and_reject_director_only(api, fin_assistant):
    c = client_for(fin_assistant)
    e1, e2 = spend(c, 300000).json(), spend(c, 300000).json()
    assert c.post(f"/api/expenses/{e1['id']}/approve/", {}, format="json").status_code == 403
    assert c.post(f"/api/expenses/{e1['id']}/reject/", {"reason": "non"}, format="json").status_code == 403
    r = api.post(f"/api/expenses/{e1['id']}/approve/", {"note": "Conforme au devis"}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "VALIDEE" and r.json()["decision_note"] == "Conforme au devis"
    assert r.json()["decided_at"]
    assert api.post(f"/api/expenses/{e1['id']}/approve/", {}, format="json").status_code == 400  # plus en attente
    assert api.post(f"/api/expenses/{e2['id']}/reject/", {}, format="json").status_code == 400  # motif obligatoire
    r = api.post(f"/api/expenses/{e2['id']}/reject/", {"reason": "Prix trop élevé"}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "REFUSEE" and r.json()["decision_note"] == "Prix trop élevé"
    assert Expense.objects.count() == 2  # rien n'est supprimé


# ---------- annulation / immutabilité ----------
def test_cancel_expense_with_reason(api):
    e = spend(api).json()
    assert api.post(f"/api/expenses/{e['id']}/cancel/", {}, format="json").status_code == 400
    r = api.post(f"/api/expenses/{e['id']}/cancel/", {"reason": "Facture annulée par le fournisseur"}, format="json")
    assert r.status_code == 200 and r.json()["status"] == "ANNULEE" and r.json()["cancel_reason"]
    assert api.post(f"/api/expenses/{e['id']}/cancel/", {"reason": "encore"}, format="json").status_code == 400
    assert Expense.objects.filter(pk=e["id"]).exists()
    assert api.patch(f"/api/expenses/{e['id']}/", {"title": "x"}, format="json").status_code == 400  # annulée : figée


def test_cancel_expense_director_only(api, fin_assistant):
    e = spend(api).json()
    assert client_for(fin_assistant).post(f"/api/expenses/{e['id']}/cancel/", {"reason": "essai"}, format="json").status_code == 403


def test_amount_cannot_be_edited_to_dodge_threshold(fin_assistant):
    c = client_for(fin_assistant)
    e = spend(c, 50000).json()
    assert c.patch(f"/api/expenses/{e['id']}/", {"amount": 9_000_000}, format="json").status_code == 400
    assert c.patch(f"/api/expenses/{e['id']}/", {"date": "2020-01-01"}, format="json").status_code == 400
    ok = c.patch(f"/api/expenses/{e['id']}/", {"title": "Riz parfumé", "paid_to": "Autre"}, format="json")
    assert ok.status_code == 200 and ok.json()["title"] == "Riz parfumé" and ok.json()["amount"] == 50000


def test_no_delete(api):
    e = spend(api).json()
    assert api.delete(f"/api/expenses/{e['id']}/").status_code in (403, 405)
    assert Expense.objects.filter(pk=e["id"]).exists()


def test_expense_validation(api):
    assert spend(api, 0).status_code == 400
    assert spend(api, -5).status_code == 400
    assert spend(api, 1000, category="VOITURE").status_code == 400
    assert spend(api, 1000, date="2999-01-01").status_code == 400
    assert api.post("/api/expenses/", {"amount": 1000}, format="json").status_code == 400


def test_expense_attachment_validated_and_signed(api):
    ok = api.post("/api/expenses/", {"title": "Gaz", "category": "ENERGIE", "amount": "8000", "attachment": SimpleUploadedFile("f.pdf", PDF)}, format="multipart")
    assert ok.status_code == 201, ok.content
    assert "/api/files/" in ok.json()["attachment_url"] and "attachment" not in ok.json()
    bad = api.post("/api/expenses/", {"title": "Gaz", "amount": "8000", "attachment": SimpleUploadedFile("f.pdf", b"nope")}, format="multipart")
    assert bad.status_code == 400
    assert api.post("/api/expenses/", {"title": "Gaz", "amount": "8000", "attachment": SimpleUploadedFile("f.exe", PDF)}, format="multipart").status_code == 400


def test_expense_isolation_and_filters(api, other_director):
    e = spend(api).json()
    spend(api, 1000, category="SANTE", title="Médicaments")
    other = client_for(other_director)
    assert other.get("/api/expenses/").json()["count"] == 0
    assert other.get(f"/api/expenses/{e['id']}/").status_code == 404
    assert other.post(f"/api/expenses/{e['id']}/approve/", {}, format="json").status_code == 404
    assert api.get("/api/expenses/?category=SANTE").json()["count"] == 1
    assert api.get("/api/expenses/?status=VALIDEE").json()["count"] == 2
    assert api.get("/api/finance/expenses/").json()["count"] == 2


# ---------- rapport financier ----------
def test_summary_uses_real_data(api, est, director, mk_student, make_due, fin_assistant):
    Y = datetime.date.today().year
    s = mk_student()
    due = make_due(s, amount=10000, due_date=datetime.date(Y, 1, 5))
    make_due(s, amount=10000, due_date=datetime.date(Y, 2, 5), label="Février")
    other_pay = lambda **kw: api.post("/api/payments/", {"student": str(s.pk), "method": "WAVE", "reference": "TX", **kw}, format="json")  # noqa: E731
    assert other_pay(due=str(due.pk), amount=6000, date=f"{Y}-01-10").status_code == 201
    cancelled = other_pay(amount=50000, date=f"{Y}-01-12", fee_kind="INSCRIPTION").json()
    api.post(f"/api/payments/{cancelled['id']}/cancel/", {"reason": "Erreur"}, format="json")
    api.post("/api/payments/", {"student": str(s.pk), "amount": 4000, "method": "ESPECES", "date": f"{Y}-02-03", "fee_kind": "MENSUALITE"}, format="json")
    Donation.objects.create(establishment=est, donor_name="Bienfaiteur", amount=30000, date=datetime.date(Y, 2, 10), method="VIREMENT", receipt_number="DON-1", recorded_by=director)
    Donation.objects.create(establishment=est, donor_name="Annulé", amount=99999, date=datetime.date(Y, 2, 11), receipt_number="DON-2", recorded_by=director, is_cancelled=True)
    assert spend(api, 12000, date=f"{Y}-01-20").status_code == 201
    pending = spend(client_for(fin_assistant), 500000, date=f"{Y}-01-21").json()
    assert pending["status"] == "EN_ATTENTE"
    gone = spend(api, 77000, date=f"{Y}-01-22").json()
    api.post(f"/api/expenses/{gone['id']}/cancel/", {"reason": "Erreur"}, format="json")

    r = api.get(f"/api/finance/summary/?from={Y}-01-01&to={Y}-03-31")
    assert r.status_code == 200, r.content
    d = r.json()
    assert d["total_payments"] == 10000 and d["total_donations"] == 30000
    assert d["total_revenue"] == 40000 and d["total_expenses"] == 12000 and d["balance"] == 28000
    assert d["outstanding"] == 14000 and d["outstanding_dues_count"] == 2 and d["students_in_arrears"] == 1  # 4000 + 10000
    assert d["pending_expenses_count"] == 1 and d["pending_expenses_amount"] == 500000
    types = {t["key"]: t["amount"] for t in d["revenue_by_type"]}
    assert types == {"MENSUALITE": 10000, "DON": 30000}
    methods = {m["key"]: m["amount"] for m in d["revenue_by_method"]}
    assert methods == {"WAVE": 6000, "ESPECES": 4000, "VIREMENT": 30000}
    months = {m["month"]: m for m in d["monthly"]}
    assert list(months) == [f"{Y}-01", f"{Y}-02", f"{Y}-03"]
    assert months[f"{Y}-01"]["revenue"] == 6000 and months[f"{Y}-01"]["expenses"] == 12000 and months[f"{Y}-01"]["balance"] == -6000
    assert months[f"{Y}-02"]["payments"] == 4000 and months[f"{Y}-02"]["donations"] == 30000
    assert months[f"{Y}-03"]["revenue"] == 0
    # fenêtre plus étroite
    jan = api.get(f"/api/finance/summary/?from={Y}-01-01&to={Y}-01-31").json()
    assert jan["total_revenue"] == 6000 and jan["outstanding"] == 4000
    # même chiffres pour l'assistant autorisé
    assert client_for(fin_assistant).get(f"/api/finance/summary/?from={Y}-01-01&to={Y}-03-31").json()["balance"] == 28000


def test_summary_validation_and_empty(api):
    assert api.get("/api/finance/summary/").status_code == 200
    empty = api.get("/api/finance/summary/?from=2026-01-01&to=2026-02-28").json()
    assert empty["total_revenue"] == 0 and empty["balance"] == 0 and len(empty["monthly"]) == 2
    assert api.get("/api/finance/summary/?from=pasunedate").status_code == 400
    assert api.get("/api/finance/summary/?from=2026-05-01&to=2026-01-01").status_code == 400
    assert api.get("/api/finance/summary/?from=2000-01-01&to=2026-01-01").status_code == 400  # période trop longue


def test_summary_isolated(api, other_director, mk_student):
    api.post("/api/payments/", {"student": str(mk_student().pk), "amount": 1000, "method": "ESPECES"}, format="json")
    spend(api)
    d = client_for(other_director).get("/api/finance/summary/").json()
    assert d["total_revenue"] == 0 and d["total_expenses"] == 0 and d["pending_expenses_count"] == 0


# ---------- impayés ----------
def test_arrears_per_student(api, Y, mk_student, make_due):
    a, b, c = mk_student("A"), mk_student("B"), mk_student("C")
    d1, d2 = make_due(a, 10000, datetime.date(Y, 1, 5), "Jan"), make_due(a, 10000, datetime.date(Y, 2, 5), "Fév")
    make_due(b, 5000, datetime.date(Y, 1, 5))
    make_due(c, 10000, datetime.date(Y + 5, 1, 5))  # pas encore échue
    api.post("/api/payments/", {"student": str(a.pk), "due": str(d1.pk), "amount": 10000}, format="json")
    api.post("/api/payments/", {"student": str(a.pk), "due": str(d2.pk), "amount": 2500}, format="json")
    data = api.get("/api/finance/arrears/").json()
    rows = {r["student_name"]: r for r in data["results"]}
    assert set(rows) == {"A Diop", "B Diop"}
    assert rows["A Diop"]["total_due"] == 20000 and rows["A Diop"]["total_paid"] == 12500 and rows["A Diop"]["balance"] == 7500
    assert rows["A Diop"]["overdue_count"] == 1 and rows["A Diop"]["oldest_due_date"] == f"{Y}-02-05"
    assert data["total_balance"] == 12500 and data["count"] == 2
    assert data["results"][0]["student_name"] == "A Diop"  # tri par dette décroissante
    future = api.get("/api/finance/arrears/?overdue_only=false").json()
    assert future["count"] == 3
    one = api.get(f"/api/finance/arrears/?student={a.pk}").json()["results"][0]
    assert [d["label"] for d in one["dues"]] == ["Fév"] and one["dues"][0]["balance"] == 7500
    assert api.get("/api/finance/arrears/?min_balance=6000").json()["count"] == 1


def test_arrears_ignore_cancelled_payment_and_due(api, Y, mk_student, make_due):
    s = mk_student()
    d1, d2 = make_due(s, 10000, datetime.date(Y, 1, 5)), make_due(s, 3000, datetime.date(Y, 2, 5), is_cancelled=True)
    p = api.post("/api/payments/", {"student": str(s.pk), "due": str(d1.pk), "amount": 10000}, format="json").json()
    assert api.get("/api/finance/arrears/").json()["count"] == 0
    api.post(f"/api/payments/{p['id']}/cancel/", {"reason": "Erreur de saisie"}, format="json")
    row = api.get("/api/finance/arrears/").json()["results"][0]
    assert row["balance"] == 10000
    assert Payment.objects.get(pk=p["id"]).status == "ANNULE" and d2.is_cancelled


def test_arrears_isolation_and_bad_params(api, other_director, Y, mk_student, make_due):
    make_due(mk_student(), 4000)
    other = client_for(other_director)
    assert other.get("/api/finance/arrears/").json()["count"] == 0
    assert api.get("/api/finance/arrears/").json()["count"] == 1
    assert api.get("/api/finance/arrears/?student=not-a-uuid").status_code == 400
    assert api.get("/api/finance/arrears/?academic_year=not-a-uuid").status_code == 400
    assert api.get("/api/finance/arrears/?academic_year=all").status_code == 200
