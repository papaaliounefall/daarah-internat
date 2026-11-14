import datetime
import io

import pytest
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.public_site.models import ContactRequest
from conftest import client_for

pytestmark = pytest.mark.django_db


def png(name="x.png"):
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), (10, 120, 80)).save(buf, "PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


def visit_body(**kw):
    body = {"name": "Parent Test", "phone": "77 000 00 00", "child_name": "Enfant Test",
            "desired_date": (datetime.date.today() + datetime.timedelta(days=5)).isoformat(), "message": "", "slug": "daara-a"}
    body.update(kw)
    return body


def test_public_visit_creates_request_and_notifies(est, director):
    r = APIClient().post("/api/public/visit-request/", visit_body(), format="json")
    assert r.status_code == 201 and "pas une inscription" in r.json()["detail"]
    req = ContactRequest.objects.get()
    assert req.kind == "VISITE" and req.child_name == "Enfant Test"
    from apps.notifications.models import Notification

    assert Notification.objects.filter(recipient=director, kind="VISITE").exists()


def test_public_visit_validation_and_honeypot(est):
    c = APIClient()
    past = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    assert c.post("/api/public/visit-request/", visit_body(desired_date=past), format="json").status_code == 400
    assert c.post("/api/public/visit-request/", visit_body(phone="abc"), format="json").status_code == 400
    assert c.post("/api/public/visit-request/", visit_body(child_name=""), format="json").status_code == 400
    assert c.post("/api/public/visit-request/", visit_body(website="http://spam"), format="json").status_code == 201
    assert ContactRequest.objects.count() == 0  # le robot n'a rien enregistré


def test_news_only_published_and_no_private_data(est, director):
    api = client_for(director)
    ok = api.post("/api/news-posts/", {"title": "Concours de récitation", "summary": "Résumé", "published_on": "2026-11-01", "is_published": True}, format="json")
    assert ok.status_code == 201, ok.content
    api.post("/api/news-posts/", {"title": "Brouillon", "published_on": "2026-11-02", "is_published": False}, format="json")
    data = APIClient().get("/api/public/site/?slug=daara-a").json()
    assert [n["title"] for n in data["news"]] == ["Concours de récitation"]
    assert "students" not in data and set(data) == {"establishment", "content", "news", "gallery"}


def test_news_and_gallery_admin_permissions(est, director, assistant, teacher, parent):
    body = {"title": "T", "published_on": "2026-11-01"}
    assert client_for(assistant).post("/api/news-posts/", body, format="json").status_code == 201
    assert client_for(teacher).post("/api/news-posts/", body, format="json").status_code == 403
    assert client_for(parent).get("/api/gallery-images/").status_code == 403
    assert APIClient().get("/api/news-posts/").status_code == 401


def test_news_html_stripped(est, director):
    r = client_for(director).post("/api/news-posts/", {"title": "<b>Gras</b><script>x()</script>", "published_on": "2026-11-01"}, format="json")
    assert "<" not in r.json()["title"]


def test_gallery_upload_and_public_stable_url(est, director):
    api = client_for(director)
    r = api.post("/api/gallery-images/", {"image": png(), "caption": "Salle"}, format="multipart")
    assert r.status_code == 201, r.content
    url = APIClient().get("/api/public/site/?slug=daara-a").json()["gallery"][0]["image_url"]
    assert "/api/files/public/" in url
    assert url == APIClient().get("/api/public/site/?slug=daara-a").json()["gallery"][0]["image_url"]  # stable : cache navigateur
    f = APIClient().get(url.replace("http://testserver", ""))
    assert f.status_code == 200 and f["Content-Type"] == "image/png"
    assert APIClient().get(url.replace("http://testserver", "")[:-4] + "zzzz").status_code == 404


def test_public_file_refuses_private_paths(est):
    from django.core import signing

    from apps.core.files import PUBLIC_SALT

    token = signing.Signer(salt=PUBLIC_SALT).sign("students/photos/secret.jpg")
    assert APIClient().get(f"/api/files/public/{token}").status_code == 404


def test_gallery_rejects_non_image(est, director):
    bad = SimpleUploadedFile("x.png", b"not an image", content_type="image/png")
    assert client_for(director).post("/api/gallery-images/", {"image": bad}, format="multipart").status_code == 400


def test_hero_image_director_only_and_exposed(est, director, assistant):
    assert client_for(assistant).post("/api/site-content/hero-image/", {"image": png()}, format="multipart").status_code == 403
    r = client_for(director).post("/api/site-content/hero-image/", {"image": png()}, format="multipart")
    assert r.status_code == 200 and r.json()["hero_image_url"]
    assert APIClient().get("/api/public/site/?slug=daara-a").json()["content"]["hero_image_url"]
    client_for(director).delete("/api/site-content/hero-image/")
    assert APIClient().get("/api/public/site/?slug=daara-a").json()["content"]["hero_image_url"] is None


def test_site_content_new_lists_validated(est, director):
    api = client_for(director)
    ok = api.patch("/api/site-content/", {"teachings": [{"title": "Mémorisation", "text": "Progression."}],
                                          "social_links": [{"label": "Facebook", "url": "https://facebook.com/x"}]}, format="json")
    assert ok.status_code == 200
    bad = api.patch("/api/site-content/", {"social_links": [{"label": "X", "url": "javascript:alert(1)"}]}, format="json")
    assert bad.status_code == 400


def test_other_establishment_news_isolated(est, director, other_est, other_director):
    client_for(director).post("/api/news-posts/", {"title": "A", "published_on": "2026-11-01"}, format="json")
    assert client_for(other_director).get("/api/news-posts/").json()["count"] == 0
    assert APIClient().get("/api/public/site/?slug=daara-b").json()["news"] == []
