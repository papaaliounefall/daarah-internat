import pytest

from conftest import client_for

pytestmark = pytest.mark.django_db


def test_establishment_read_all_write_director(director, assistant, parent, other_director):
    assert client_for(parent).get("/api/establishment/").json()["name"] == "Daara A"
    assert client_for(assistant).patch("/api/establishment/", {"phone": "1"}, format="json").status_code == 403
    r = client_for(director).patch("/api/establishment/", {"phone": "77 000 00 00", "name_ar": "مدرسة"}, format="json")
    assert r.status_code == 200 and r.json()["phone"] == "77 000 00 00"
    assert client_for(other_director).get("/api/establishment/").json()["phone"] == ""
    # le préfixe de matricule n'est pas modifiable
    client_for(director).patch("/api/establishment/", {"registration_prefix": "ZZZ"}, format="json")
    assert client_for(director).get("/api/establishment/").json()["registration_prefix"] == "DAF"
