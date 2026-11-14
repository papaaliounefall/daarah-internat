import datetime

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.social.models import Donation, Sponsor, Sponsorship
from apps.students.models import Student
from conftest import client_for

pytestmark = pytest.mark.django_db

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


def mk_student(est, first="Ali", **kw):
    return Student.objects.create(establishment=est, first_name=first, last_name="Diop", gender="M", **kw)


@pytest.fixture
def sponsor(est):
    return Sponsor.objects.create(establishment=est, name="Fondation Baraka", kind="PARTENAIRE", country="France")


def donate(c, **kw):
    return c.post("/api/social/donations/", {"donor_name": "M. Fall", "amount": 50000, "method": "WAVE", **kw}, format="json")


# ---------- droits ----------
def test_sponsors_and_sponsorships_roles(api, assistant, teacher, parent, sponsor, est):
    s = mk_student(est)
    body = {"student": str(s.pk), "sponsor": str(sponsor.pk), "monthly_amount": 15000}
    assert client_for(assistant).post("/api/social/sponsorships/", body, format="json").status_code == 403
    assert client_for(assistant).post("/api/social/sponsors/", {"name": "X"}, format="json").status_code == 403
    assert api.post("/api/social/sponsorships/", body, format="json").status_code == 201
    assert client_for(assistant).get("/api/social/sponsorships/").status_code == 200  # lecture seule
    assert client_for(assistant).get("/api/social/sponsors/").status_code == 200
    for u in (teacher, parent):
        c = client_for(u)
        for url in ("sponsors", "sponsorships", "donations"):
            assert c.get(f"/api/social/{url}/").status_code == 403
        assert c.get("/api/social/overview/").status_code == 403


def test_assistant_donations_need_finance_flag(api, assistant):
    donate(api)
    c = client_for(assistant)
    assert c.get("/api/social/donations/").status_code == 403
    assistant.can_view_finance = True
    assistant.save()
    r = client_for(assistant).get("/api/social/donations/")
    assert r.status_code == 200 and r.json()["count"] == 1
    assert donate(client_for(assistant)).status_code == 403  # lecture seule même avec l'accès finance


def test_assistant_overview_does_not_expose_donations(api, assistant):
    donate(api)
    data = client_for(assistant).get("/api/social/overview/").json()
    assert "donation" not in str(data).lower()


# ---------- dons ----------
def test_donation_numbering_sequential_and_format(api):
    year = datetime.date.today().year
    nums = [donate(api).json()["receipt_number"] for _ in range(3)]
    assert nums == [f"DON-{year}-001", f"DON-{year}-002", f"DON-{year}-003"]


def test_numbering_independent_per_establishment(api, other_director):
    assert donate(api).json()["receipt_number"].endswith("-001")
    assert donate(client_for(other_director)).json()["receipt_number"].endswith("-001")


def test_donation_validation(api, sponsor):
    assert donate(api, amount=0).status_code == 400
    assert donate(api, amount=-5).status_code == 400
    assert donate(api, method="BITCOIN").status_code == 400
    assert donate(api, date="2999-01-01").status_code == 400
    assert api.post("/api/social/donations/", {"amount": 1000}, format="json").status_code == 400  # donateur manquant
    r = api.post("/api/social/donations/", {"amount": 1000, "sponsor": str(sponsor.pk)}, format="json")
    assert r.status_code == 201 and r.json()["donor_name"] == "Fondation Baraka"


def test_donation_cancel_with_reason_no_delete(api):
    d = donate(api).json()
    assert api.post(f"/api/social/donations/{d['id']}/cancel/", {}, format="json").status_code == 400
    r = api.post(f"/api/social/donations/{d['id']}/cancel/", {"reason": "Saisie en double"}, format="json")
    assert r.status_code == 200 and r.json()["is_cancelled"] is True and r.json()["cancel_reason"] == "Saisie en double"
    assert r.json()["cancelled_by_name"] and r.json()["cancelled_at"]
    assert api.post(f"/api/social/donations/{d['id']}/cancel/", {"reason": "encore"}, format="json").status_code == 400
    assert Donation.objects.filter(pk=d["id"]).exists()
    assert api.delete(f"/api/social/donations/{d['id']}/").status_code in (403, 405)
    assert api.patch(f"/api/social/donations/{d['id']}/", {"amount": 1}, format="json").status_code in (403, 405)
    assert Donation.objects.get(pk=d["id"]).amount == 50000


def test_donation_attachment_validated_and_signed(api):
    ok = api.post("/api/social/donations/", {"donor_name": "A", "amount": "1000", "attachment": SimpleUploadedFile("j.pdf", PDF)}, format="multipart")
    assert ok.status_code == 201, ok.content
    assert "/api/files/" in ok.json()["attachment_url"] and "attachment" not in ok.json()
    bad = api.post("/api/social/donations/", {"donor_name": "A", "amount": "1000", "attachment": SimpleUploadedFile("j.pdf", b"nope")}, format="multipart")
    assert bad.status_code == 400


def test_donation_isolation_and_alias(api, other_director, sponsor):
    d = donate(api).json()
    other = client_for(other_director)
    assert other.get("/api/social/donations/").json()["count"] == 0
    assert other.get(f"/api/social/donations/{d['id']}/").status_code == 404
    assert other.post(f"/api/social/donations/{d['id']}/cancel/", {"reason": "test"}, format="json").status_code == 404
    assert donate(other, sponsor=str(sponsor.pk)).status_code == 400  # parrain d'un autre Daara
    assert api.get("/api/donations/").json()["count"] == 1


# ---------- parrainages ----------
def test_sponsorship_lifecycle_and_rules(api, est, sponsor):
    s = mk_student(est, status="SOCIAL")
    r = api.post("/api/social/sponsorships/", {"student": str(s.pk), "sponsor": str(sponsor.pk), "monthly_amount": 20000}, format="json")
    assert r.status_code == 201, r.content
    sp = r.json()
    assert sp["status"] == "ACTIF" and sp["student_name"] == "Ali Diop" and sp["sponsor_name"] == "Fondation Baraka"
    assert api.patch(f"/api/social/sponsorships/{sp['id']}/", {"status": "SUSPENDU"}, format="json").json()["status"] == "SUSPENDU"
    r = api.patch(f"/api/social/sponsorships/{sp['id']}/", {"status": "TERMINE"}, format="json")
    assert r.json()["status"] == "TERMINE" and r.json()["end_date"] is not None
    assert api.patch(f"/api/social/sponsorships/{sp['id']}/", {"status": "ACTIF"}, format="json").status_code == 400
    assert api.delete(f"/api/social/sponsorships/{sp['id']}/").status_code in (403, 405)
    assert Sponsorship.objects.filter(pk=sp["id"]).exists()


def test_sponsorship_validation(api, est, sponsor):
    s = mk_student(est)
    base = {"student": str(s.pk), "sponsor": str(sponsor.pk)}
    assert api.post("/api/social/sponsorships/", {**base, "monthly_amount": -1}, format="json").status_code == 400
    assert api.post("/api/social/sponsorships/", {**base, "start_date": "2026-05-01", "end_date": "2026-01-01"}, format="json").status_code == 400
    archived = mk_student(est, "Arch", is_archived=True)
    assert api.post("/api/social/sponsorships/", {**base, "student": str(archived.pk)}, format="json").status_code == 400


def test_sponsorship_isolation(api, other_director, est, sponsor, other_est):
    s = mk_student(est)
    api.post("/api/social/sponsorships/", {"student": str(s.pk), "sponsor": str(sponsor.pk)}, format="json")
    other = client_for(other_director)
    assert other.get("/api/social/sponsorships/").json()["count"] == 0
    assert other.get("/api/social/sponsors/").json()["count"] == 0
    r = other.post("/api/social/sponsorships/", {"student": str(s.pk), "sponsor": str(sponsor.pk)}, format="json")
    assert r.status_code == 400


# ---------- vue d'ensemble ----------
def test_overview_social_vs_paying_with_sponsor_and_history(api, assistant, est, sponsor):
    soc, soc2, pay = mk_student(est, "Soc", status="PAYANT"), mk_student(est, "Soc2", status="SOCIAL"), mk_student(est, "Pay")
    archived = mk_student(est, "Arch", status="SOCIAL", is_archived=True)
    api.post(f"/api/students/{soc.pk}/change-status/", {"status": "SOCIAL", "reason": "Famille démunie"}, format="json")
    api.post("/api/social/sponsorships/", {"student": str(soc.pk), "sponsor": str(sponsor.pk), "monthly_amount": 15000}, format="json")
    sp2 = api.post("/api/social/sponsorships/", {"student": str(soc2.pk), "sponsor": str(sponsor.pk), "monthly_amount": 9000}, format="json").json()
    api.patch(f"/api/social/sponsorships/{sp2['id']}/", {"status": "SUSPENDU"}, format="json")
    for client in (api, client_for(assistant)):
        data = client.get("/api/social/overview/").json()
        assert data["summary"]["social_count"] == 2 and data["summary"]["paying_count"] == 1  # archivé exclu
        assert data["summary"]["sponsored_social_count"] == 1 and data["summary"]["social_without_sponsor_count"] == 1
        assert data["summary"]["total_monthly_sponsorship"] == 15000
        rows = {r["full_name"]: r for r in data["results"]}
        assert len(rows) == 3 and "Arch Diop" not in rows
        assert rows["Soc Diop"]["sponsors"][0]["sponsor_name"] == "Fondation Baraka"
        assert rows["Soc Diop"]["status_changes"][0]["to_status"] == "SOCIAL"
        assert rows["Soc2 Diop"]["sponsors"] == [] and rows["Pay Diop"]["status_changes"] == []
    only_social = api.get("/api/social/overview/?status=SOCIAL").json()
    assert only_social["count"] == 2
    assert api.get("/api/social/overview/?status=SOCIAL&sponsored=false").json()["count"] == 1
    assert api.get("/api/social/overview/?status=ZZZ").status_code == 400
    assert api.get("/api/social/overview/?include_archived=true").json()["summary"]["social_count"] == 3


def test_overview_isolation(api, other_director, est):
    mk_student(est)
    data = client_for(other_director).get("/api/social/overview/").json()
    assert data["count"] == 0 and data["summary"]["paying_count"] == 0
