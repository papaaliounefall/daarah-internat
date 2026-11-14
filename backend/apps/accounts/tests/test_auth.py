import pytest
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from conftest import PASSWORD, client_for

pytestmark = pytest.mark.django_db


def login(username, password=PASSWORD):
    return APIClient().post("/api/auth/login/", {"username": username, "password": password}, format="json")


def test_login_returns_tokens_and_profile(director):
    r = login("directeur")
    assert r.status_code == 200
    body = r.json()
    assert body["access"] and body["refresh"]
    assert body["user"]["role"] == "DIRECTEUR" and "password" not in body["user"]
    assert AuditLog.objects.filter(action="LOGIN", user=director).exists()


def test_bad_password_rejected_and_audited(director):
    assert login("directeur", "mauvais").status_code == 401
    assert AuditLog.objects.filter(action="LOGIN_FAILED").exists()


def test_inactive_user_cannot_login(director):
    director.is_active = False
    director.save()
    assert login("directeur").status_code == 401


def test_refresh_rotates_and_old_token_is_revoked(director):
    first = login("directeur").json()["refresh"]
    c = APIClient()
    r = c.post("/api/auth/refresh/", {"refresh": first}, format="json")
    assert r.status_code == 200 and r.json()["refresh"] != first
    assert c.post("/api/auth/refresh/", {"refresh": first}, format="json").status_code == 401  # ancien jeton révoqué


def test_logout_revokes_refresh(director):
    tokens = login("directeur").json()
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    assert c.post("/api/auth/logout/", {"refresh": tokens["refresh"]}, format="json").status_code == 204
    assert APIClient().post("/api/auth/refresh/", {"refresh": tokens["refresh"]}, format="json").status_code == 401


def test_me_requires_auth_and_hides_sensitive_fields(director):
    assert APIClient().get("/api/auth/me/").status_code == 401
    me = client_for(director).get("/api/auth/me/").json()
    assert me["username"] == "directeur" and "password" not in me


def test_me_cannot_escalate_role(parent):
    c = client_for(parent)
    c.patch("/api/auth/me/", {"role": "DIRECTEUR", "can_view_finance": True, "first_name": "Nouveau"}, format="json")
    parent.refresh_from_db()
    assert parent.role == "PARENT" and parent.can_view_finance is False and parent.first_name == "Nouveau"


def test_change_password(parent):
    c = client_for(parent)
    assert c.post("/api/auth/change-password/", {"old_password": "faux", "new_password": "NouveauMotDePasse-2026"}, format="json").status_code == 400
    assert c.post("/api/auth/change-password/", {"old_password": PASSWORD, "new_password": "123"}, format="json").status_code == 400
    assert c.post("/api/auth/change-password/", {"old_password": PASSWORD, "new_password": "NouveauMotDePasse-2026"}, format="json").status_code == 204
    assert login("parent", "NouveauMotDePasse-2026").status_code == 200


def test_users_admin_scope(director, assistant, teacher, parent):
    assert client_for(teacher).get("/api/users/").status_code == 403
    assert client_for(parent).get("/api/users/").status_code == 403
    r = client_for(assistant).get("/api/users/")
    assert r.status_code == 200
    assert "DIRECTEUR" not in {u["role"] for u in r.json()["results"]}


def test_assistant_can_only_create_parents(assistant):
    c = client_for(assistant)
    body = {"username": "p1", "first_name": "P", "password": "Parent-Pass-2026-x", "role": "PARENT"}
    assert c.post("/api/users/", body, format="json").status_code == 201
    assert c.post("/api/users/", {**body, "username": "m1", "role": "MAITRE"}, format="json").status_code == 400
    assert c.post("/api/users/", {**body, "username": "d1", "role": "DIRECTEUR"}, format="json").status_code == 400
    assert c.post("/api/users/", {**body, "username": "p2", "can_view_finance": True}, format="json").status_code == 400


def test_director_creates_user_in_own_establishment_only(api, est):
    r = api.post("/api/users/", {"username": "m9", "first_name": "M", "password": "Maitre-Pass-2026-x", "role": "MAITRE"}, format="json")
    assert r.status_code == 201
    from django.contrib.auth import get_user_model

    assert get_user_model().objects.get(username="m9").establishment_id == est.pk


def test_other_establishment_users_invisible(api, other_director):
    ids = {u["username"] for u in api.get("/api/users/").json()["results"]}
    assert "directeur-b" not in ids


def test_cannot_deactivate_self(api, director):
    assert api.post(f"/api/users/{director.pk}/deactivate/").status_code == 400


def test_weak_initial_password_rejected(api):
    r = api.post("/api/users/", {"username": "x", "first_name": "X", "password": "abc", "role": "PARENT"}, format="json")
    assert r.status_code == 400
