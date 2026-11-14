import io
import json

import pytest
from django.core.cache import cache
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.core.models import Establishment
from apps.notifications.models import Notification
from apps.public_site.models import ContactRequest, SiteContent
from conftest import client_for, make_user

pytestmark = pytest.mark.django_db

SITE = "/api/public/site/"
CONTACT = "/api/public/contact/"
VALID = {"name": "Awa Ndiaye", "phone": "77 000 00 00", "message": "Bonjour, comment inscrire mon fils au Daara ?"}


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def anon():
    return APIClient()


@pytest.fixture
def default_est(est, settings):
    settings.DEFAULT_ESTABLISHMENT_SLUG = est.slug
    return est


# --------------------------------------------------------------------------- site public
def test_public_site_is_open_and_returns_institutional_data(anon, default_est):
    default_est.city, default_est.phone = "Kahone", "77 634 46 76"
    default_est.save()
    SiteContent.objects.create(establishment=default_est, mission="Mission rédigée", tagline="Slogan",
                               values=[{"title": "Foi", "text": "..."}], contact_email="contact@example.org")
    r = anon.get(SITE)
    assert r.status_code == 200
    body = r.json()
    assert body["establishment"]["name"] == "Daara A" and body["establishment"]["city"] == "Kahone"
    assert body["content"]["mission"] == "Mission rédigée"
    assert body["content"]["contact_email"] == "contact@example.org"
    assert body["content"]["contact_phone"] == "77 634 46 76"       # repli sur l'établissement
    assert body["content"]["values"] == [{"title": "Foi", "text": "..."}]
    assert "max-age" in r["Cache-Control"]


def test_public_site_without_content_still_works(anon, default_est):
    body = anon.get(SITE).json()
    assert body["content"]["history"] == "" and body["content"]["values"] == []
    assert not SiteContent.objects.exists()  # la lecture publique n'écrit rien


def test_public_site_by_slug_and_unknown_and_inactive(anon, default_est, other_est):
    assert anon.get(SITE + "?slug=daara-b").json()["establishment"]["name"] == "Daara B"
    assert anon.get(SITE + "?slug=inconnu").status_code == 404
    other_est.is_active = False
    other_est.save()
    assert anon.get(SITE + "?slug=daara-b").status_code == 404


def test_public_site_ignores_invalid_token(anon, default_est):
    assert anon.get(SITE, HTTP_AUTHORIZATION="Bearer jeton.invalide.ici").status_code == 200


def test_public_api_never_leaks_private_data(anon, default_est, student, parent, teacher, director, child_of_parent):
    """Aucune donnée de talibé / parent / personnel dans les réponses publiques."""
    SiteContent.objects.create(establishment=default_est, mission="m")
    ContactRequest.objects.create(establishment=default_est, name="Visiteur Secret", message="message privé 123456")
    blob = json.dumps(anon.get(SITE).json(), ensure_ascii=False)
    for secret in (student.first_name, student.last_name, student.registration_number, student.father_name,
                   student.guardian_phone, parent.username, teacher.username, director.username, "Visiteur Secret",
                   "message privé"):
        assert secret not in blob, secret
    keys = set(json.loads(blob)["establishment"]) | set(json.loads(blob)["content"])
    assert not keys & {"students", "talibes", "parents", "staff", "users", "id", "establishment_id"}
    # le contenu public n'expose pas non plus les identifiants internes
    assert "id" not in json.loads(blob)["establishment"]


def test_public_site_does_not_list_internal_endpoints(anon):
    for path in ("/api/students/", "/api/notifications/", "/api/site-content/", "/api/contact-requests/"):
        assert anon.get(path).status_code in (401, 403)


# --------------------------------------------------------------------------- formulaire de contact
def test_contact_creates_request_and_notifies_staff(anon, default_est, director, assistant, teacher, parent,
                                                    other_director):
    r = anon.post(CONTACT, VALID, format="json")
    assert r.status_code == 201 and "bien été envoyée" in r.json()["detail"]
    req = ContactRequest.objects.get()
    assert req.establishment == default_est and req.name == "Awa Ndiaye" and not req.is_processed
    recipients = set(Notification.objects.values_list("recipient__username", flat=True))
    assert recipients == {"directeur", "assistant"}               # ni maître, ni parent, ni autre Daara
    n = Notification.objects.get(recipient=director)
    assert n.link_type == "contact_request" and n.link_id == str(req.pk)
    assert AuditLog.objects.filter(action="CONTACT_REQUEST", object_id=str(req.pk)).exists()


def test_contact_targets_other_establishment_by_slug(anon, default_est, other_est, other_director):
    anon.post(CONTACT, {**VALID, "slug": "daara-b"}, format="json")
    assert ContactRequest.objects.get().establishment == other_est
    assert Notification.objects.get().recipient == other_director


def test_contact_unknown_slug_is_404(anon, default_est):
    assert anon.post(CONTACT, {**VALID, "slug": "inconnu"}, format="json").status_code == 404
    assert not ContactRequest.objects.exists()


@pytest.mark.parametrize("patch,field", [
    ({"name": ""}, "name"), ({"name": "A"}, "name"), ({"name": "x" * 151}, "name"),
    ({"message": ""}, "message"), ({"message": "court"}, "message"), ({"message": "m" * 3001}, "message"),
    ({"email": "pas-un-email"}, "email"), ({"phone": "abc"}, "phone"),
])
def test_contact_validation_errors_are_in_french(anon, default_est, patch, field):
    r = anon.post(CONTACT, {**VALID, **patch}, format="json")
    assert r.status_code == 400 and field in r.json()
    assert not ContactRequest.objects.exists()


def test_contact_requires_phone_or_email(anon, default_est):
    body = {"name": "Awa Ndiaye", "message": "Un message suffisamment long."}
    assert anon.post(CONTACT, body, format="json").status_code == 400
    assert anon.post(CONTACT, {**body, "email": "awa@example.org"}, format="json").status_code == 201


def test_contact_boundary_lengths_accepted(anon, default_est):
    assert anon.post(CONTACT, {**VALID, "name": "x" * 150, "message": "m" * 3000}, format="json").status_code == 201


def test_contact_html_is_stripped(anon, default_est):
    anon.post(CONTACT, {**VALID, "name": "<b>Awa</b> Ndiaye", "message": "<script>alert(1)</script>Bonjour tout le monde"},
              format="json")
    req = ContactRequest.objects.get()
    assert req.name == "Awa Ndiaye" and "<script>" not in req.message


def test_contact_honeypot_silently_ignored(anon, default_est, director):
    r = anon.post(CONTACT, {**VALID, "website": "http://spam.example"}, format="json")
    assert r.status_code == 201                                    # le robot ne doit pas détecter le piège
    assert not ContactRequest.objects.exists() and not Notification.objects.exists()


def test_contact_is_throttled(anon, default_est, monkeypatch):
    from rest_framework.throttling import ScopedRateThrottle

    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {**ScopedRateThrottle.THROTTLE_RATES, "public_form": "5/hour"})
    codes = [anon.post(CONTACT, VALID, format="json").status_code for _ in range(7)]
    assert codes[:5] == [201] * 5 and codes[5:] == [429, 429]
    assert ContactRequest.objects.count() == 5


def test_contact_throttle_is_per_client(default_est, monkeypatch):
    from rest_framework.throttling import ScopedRateThrottle

    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {**ScopedRateThrottle.THROTTLE_RATES, "public_form": "2/hour"})
    a, b = APIClient(REMOTE_ADDR="10.0.0.1"), APIClient(REMOTE_ADDR="10.0.0.2")
    assert [a.post(CONTACT, VALID, format="json").status_code for _ in range(3)] == [201, 201, 429]
    assert b.post(CONTACT, VALID, format="json").status_code == 201


def test_contact_get_not_allowed(anon, default_est):
    assert anon.get(CONTACT).status_code == 405


# --------------------------------------------------------------------------- contenu privé
def test_site_content_director_reads_and_updates(api, est):
    r = api.get("/api/site-content/")
    assert r.status_code == 200 and r.json()["history"] == ""
    r = api.patch("/api/site-content/", {
        "mission": "Notre mission", "values": [{"title": "Foi", "text": "Texte"}],
        "team": [{"name": "Cheikh", "role": "Directeur"}], "latitude": "14.150000", "longitude": "-16.100000",
    }, format="json")
    assert r.status_code == 200, r.content
    content = SiteContent.objects.get(establishment=est)
    assert content.mission == "Notre mission" and content.team == [{"name": "Cheikh", "role": "Directeur"}]
    assert AuditLog.objects.filter(action="UPDATE", model="SiteContent").exists()
    # PUT = mise à jour partielle (n'efface pas le reste)
    assert api.put("/api/site-content/", {"tagline": "Slogan"}, format="json").status_code == 200
    content.refresh_from_db()
    assert content.tagline == "Slogan" and content.mission == "Notre mission"


@pytest.mark.parametrize("payload", [
    {"values": [{"title": "", "text": "x"}]},
    {"values": [{"title": "t", "text": "x", "evil": "y"}]},
    {"values": [{"title": "t" * 151, "text": "x"}]},
    {"team": [{"name": "n", "role": "r"}] * 51},
    {"latitude": "123.0"}, {"longitude": "-200"},
    {"contact_email": "pas-un-email"}, {"history": "h" * 10001},
])
def test_site_content_validation(api, payload):
    assert api.patch("/api/site-content/", payload, format="json").status_code == 400


def test_site_content_strips_html(api, est):
    api.patch("/api/site-content/", {"mission": "<script>x</script>Texte", "values": [{"title": "<i>Foi</i>", "text": "t"}]},
              format="json")
    c = SiteContent.objects.get(establishment=est)
    assert "<" not in c.mission and c.values[0]["title"] == "Foi"


def test_site_content_permissions(assistant, teacher, parent, other_director, est, api):
    for user in (assistant, teacher, parent):
        c = client_for(user)
        assert c.get("/api/site-content/").status_code == 403
        assert c.patch("/api/site-content/", {"tagline": "x"}, format="json").status_code == 403
    # isolation : le directeur d'un autre Daara modifie SON contenu, jamais celui de A
    client_for(other_director).patch("/api/site-content/", {"tagline": "B"}, format="json")
    assert not SiteContent.objects.filter(establishment=est, tagline="B").exists()
    assert SiteContent.objects.get(establishment=other_director.establishment).tagline == "B"


def test_contact_requests_list_filter_and_mark_processed(api, assistant, teacher, parent, est, other_est,
                                                         other_director):
    mine = ContactRequest.objects.create(establishment=est, name="Moi", message="message d'un visiteur", phone="77")
    ContactRequest.objects.create(establishment=other_est, name="Autre", message="message d'un visiteur")
    r = api.get("/api/contact-requests/")
    assert [x["name"] for x in r.json()["results"]] == ["Moi"]
    assert client_for(assistant).get(f"/api/contact-requests/{mine.pk}/").status_code == 200
    assert client_for(teacher).get("/api/contact-requests/").status_code == 403
    assert client_for(parent).get("/api/contact-requests/").status_code == 403
    assert client_for(other_director).get(f"/api/contact-requests/{mine.pk}/").status_code == 404
    assert client_for(other_director).post(f"/api/contact-requests/{mine.pk}/mark-processed/").status_code == 404

    done = client_for(assistant).post(f"/api/contact-requests/{mine.pk}/mark-processed/")
    assert done.status_code == 200 and done.json()["is_processed"] and done.json()["processed_by_name"]
    assert api.get("/api/contact-requests/?is_processed=false").json()["count"] == 0
    assert api.get("/api/contact-requests/?is_processed=true").json()["count"] == 1
    assert AuditLog.objects.filter(action="CONTACT_PROCESSED").exists()
    reopened = api.post(f"/api/contact-requests/{mine.pk}/mark-processed/", {"processed": False}, format="json")
    assert reopened.json()["is_processed"] is False and reopened.json()["processed_at"] is None
    assert api.get("/api/contact-requests/?search=visiteur").json()["count"] == 1


def test_contact_requests_cannot_be_created_edited_or_deleted_via_private_api(api, est):
    mine = ContactRequest.objects.create(establishment=est, name="Moi", message="message d'un visiteur")
    assert api.post("/api/contact-requests/", VALID, format="json").status_code in (403, 405)
    assert api.delete(f"/api/contact-requests/{mine.pk}/").status_code in (403, 405)
    assert api.patch(f"/api/contact-requests/{mine.pk}/", {"name": "x"}, format="json").status_code in (403, 405)


# --------------------------------------------------------------------------- commande de seed
def test_seed_site_content_only_verifiable_facts(settings):
    settings.DEFAULT_ESTABLISHMENT_SLUG = "daara-test-seed"
    call_command("seed_site_content", stdout=io.StringIO())
    est = Establishment.objects.get(slug="daara-test-seed")
    c = est.site_content
    assert est.name == "Daara Internat Shaykh Aliou Fatima" and est.country == "Sénégal"
    assert c.contact_phone == "77 634 46 76 / 70 640 40 58"
    assert c.contact_email == "seydinandiaye1975@gmail.com"
    assert "Kahone" in c.address and "Kaolack" in c.address
    # rien d'inventé
    assert c.history == c.mission == c.vision == c.tagline == c.admission_info == ""
    assert c.values == [] and c.activities == [] and c.team == [] and c.latitude is None and c.longitude is None


def test_seed_is_idempotent_and_does_not_overwrite_edits(settings):
    settings.DEFAULT_ESTABLISHMENT_SLUG = "daara-test-seed"
    call_command("seed_site_content", stdout=io.StringIO())
    c = SiteContent.objects.get()
    c.contact_phone, c.mission = "99 999 99 99", "Rédigée par le Daara"
    c.save()
    call_command("seed_site_content", stdout=io.StringIO())
    c.refresh_from_db()
    assert c.contact_phone == "99 999 99 99" and c.mission == "Rédigée par le Daara"
    call_command("seed_site_content", "--force", stdout=io.StringIO())
    c.refresh_from_db()
    assert c.contact_phone == "77 634 46 76 / 70 640 40 58" and c.mission == "Rédigée par le Daara"
    assert SiteContent.objects.count() == 1 and Establishment.objects.filter(slug="daara-test-seed").count() == 1
