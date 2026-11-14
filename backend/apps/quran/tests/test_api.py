import pytest
from rest_framework.test import APIClient

from apps.quran.models import Ayah
from apps.quran.services import resolve_range
from apps.quran.tests.factories import load_mini_corpus, load_test_audio
from conftest import client_for, make_user
from apps.core.roles import Role
from rest_framework.exceptions import ValidationError

pytestmark = pytest.mark.django_db


@pytest.fixture
def corpus(db):
    load_mini_corpus()
    load_test_audio()


@pytest.mark.parametrize("who", ["director", "assistant", "teacher", "parent"])
def test_all_authenticated_roles_can_read(corpus, request, who):
    c = client_for(request.getfixturevalue(who))
    assert c.get("/api/quran/surahs/").status_code == 200
    assert c.get("/api/quran/surahs/112/").status_code == 200
    assert c.get("/api/quran/reciters/").status_code == 200


def test_anonymous_and_unattached_users_refused(corpus, db):
    assert APIClient().get("/api/quran/surahs/").status_code in (401, 403)
    orphan = make_user(None, Role.PARENT, "orphelin")
    assert client_for(orphan).get("/api/quran/surahs/").status_code == 403


def test_read_only(corpus, director):
    c = client_for(director)
    for url in ("/api/quran/surahs/", "/api/quran/surahs/1/", "/api/quran/ayat/?surah=1", "/api/quran/reciters/"):
        assert c.post(url, {}, format="json").status_code == 405
        assert c.put(url, {}, format="json").status_code == 405
        assert c.delete(url).status_code == 405


def test_surah_list(corpus, parent):
    d = client_for(parent).get("/api/quran/surahs/").json()
    assert d["count"] == 3 and [s["number"] for s in d["results"]] == [1, 112, 114]
    assert {"number", "name_arabic", "name_simple", "verses_count", "page_start"} <= set(d["results"][0])


def test_surah_detail_with_range(corpus, parent):
    c = client_for(parent)
    d = c.get("/api/quran/surahs/114/").json()
    assert d["name_simple"] == "An-Nas" and len(d["ayat"]) == 6
    assert d["ayat"][0]["verse_key"] == "114:1" and d["ayat"][0]["text_uthmani"] == Ayah.objects.get(verse_key="114:1").text_uthmani
    r = c.get("/api/quran/surahs/114/?from=2&to=4").json()
    assert [a["number_in_surah"] for a in r["ayat"]] == [2, 3, 4]
    assert [a["number_in_surah"] for a in c.get("/api/quran/surahs/114/?from=5").json()["ayat"]] == [5, 6]
    assert c.get("/api/quran/surahs/114/?from=4&to=2").status_code == 400
    assert c.get("/api/quran/surahs/114/?from=abc").status_code == 400
    assert c.get("/api/quran/surahs/113/").status_code == 404


def test_ayat_filters(corpus, teacher):
    c = client_for(teacher)
    assert c.get("/api/quran/ayat/").status_code == 400
    assert c.get("/api/quran/ayat/?surah=1").json()["count"] == 7
    assert c.get("/api/quran/ayat/?juz=30").json()["count"] == 10
    assert c.get("/api/quran/ayat/?page=604&surah=112").json()["count"] == 4
    assert c.get("/api/quran/ayat/?page=1").json()["count"] == 7
    assert c.get("/api/quran/ayat/?surah=x").status_code == 400
    assert c.get("/api/quran/ayat/?surah=999").json()["count"] == 0  # jamais de texte inventé


def test_cache_headers_and_etag(corpus, parent):
    c = client_for(parent)
    r = c.get("/api/quran/surahs/")
    assert r["Cache-Control"] == "private, max-age=86400" and r["ETag"]
    r2 = c.get("/api/quran/surahs/", HTTP_IF_NONE_MATCH=r["ETag"])
    assert r2.status_code == 304 and r2["ETag"] == r["ETag"] and not r2.content
    r3 = c.get("/api/quran/surahs/", HTTP_IF_NONE_MATCH='"autre"')
    assert r3.status_code == 200
    assert c.get("/api/quran/surahs/114/")["ETag"] != c.get("/api/quran/surahs/112/")["ETag"]


def test_etag_changes_when_content_changes(corpus, parent):
    c = client_for(parent)
    before = c.get("/api/quran/surahs/1/")["ETag"]
    Ayah.objects.filter(verse_key="1:1").update(text_uthmani="[modifié en base]")
    assert c.get("/api/quran/surahs/1/")["ETag"] != before


def test_reciters_and_audio(corpus, parent):
    c = client_for(parent)
    assert c.get("/api/quran/reciters/").json()["results"][0]["slug"] == "husary-murattal"
    d = c.get("/api/quran/surahs/1/audio/").json()
    assert d["reciter"]["slug"] == "husary-murattal" and d["chapter_audio"]["url"] == "https://example.test/audio/1.mp3"
    assert d["verses"] == [{"ayah": 1, "verse_key": "1:1", "url": "https://example.test/audio/1-1.mp3", "duration_seconds": None}]
    # sourate sans audio importé : aucune URL fabriquée
    d = c.get("/api/quran/surahs/112/audio/?reciter=husary-murattal").json()
    assert d["chapter_audio"] is None and d["verses"] == []
    assert c.get("/api/quran/surahs/1/audio/?reciter=inconnu").status_code == 404
    assert c.get("/api/quran/surahs/113/audio/").status_code == 404


def test_audio_without_any_reciter(db, parent):
    load_mini_corpus()
    assert client_for(parent).get("/api/quran/surahs/1/audio/").status_code == 400


# ---------------------------------------------------------------- resolve_range -----------
def test_resolve_range_returns_location_of_last_verse(corpus):
    r = resolve_range(114, 1, 6)
    assert (r.juz, r.hizb, r.page, r.ayah_start, r.ayah_end, r.surah.number) == (30, 60, 604, 1, 6, 114)
    Ayah.objects.filter(verse_key="1:7").update(juz=2, hizb=3, page=9)
    assert (lambda x: (x.juz, x.hizb, x.page))(resolve_range("1", "1", "7")) == (2, 3, 9)  # dernier verset


@pytest.mark.parametrize("args", [(115, 1, 1), (0, 1, 1), (1, 0, 1), (1, 5, 3), (1, 1, 8), (112, 1, 5), ("x", 1, 1), (1, None, 2)])
def test_resolve_range_rejects_invalid(corpus, args):
    with pytest.raises(ValidationError):
        resolve_range(*args)


def test_resolve_range_without_imported_corpus(db):
    from apps.quran.models import Surah

    Surah.objects.create(number=1, name_arabic="ا", name_simple="Al-Fatihah", verses_count=7)
    with pytest.raises(ValidationError, match="importé"):
        resolve_range(1, 1, 3)
