"""Import Quran.com : réponses HTTP SIMULÉES (aucun accès réseau en test)."""
import copy

import pytest
import requests
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.quran import importer
from apps.quran.models import AudioResource, Ayah, Reciter, Surah

pytestmark = pytest.mark.django_db

# 113 sourates de 54 versets + une de 134 = 6236 (structure factice, contrôles réels).
COUNTS = [54] * 113 + [6236 - 54 * 113]


class FakeResponse:
    def __init__(self, payload, status=200):
        self._payload, self.status_code = payload, status

    def json(self):
        return copy.deepcopy(self._payload)


def build_api():
    chapters = [
        {"id": i, "revelation_place": "makkah" if i % 2 else "madinah", "bismillah_pre": i not in (1, 9),
         "name_simple": f"Sourate-{i}", "name_arabic": f"س{i}", "verses_count": n, "pages": [min(i, 604), min(i, 604)],
         "translated_name": {"language_name": "french", "name": f"Nom {i}"}}
        for i, n in enumerate(COUNTS, start=1)
    ]
    verses = {}
    for i, n in enumerate(COUNTS, start=1):
        verses[i] = [
            {"id": 1000 * i + v, "verse_number": v, "verse_key": f"{i}:{v}", "hizb_number": (i % 60) + 1,
             "rub_el_hizb_number": (i % 240) + 1, "sajdah_number": 1 if v == 1 and i == 7 else None,
             "text_uthmani": f"نص {i}:{v} ٱلْحَمْدُ", "page_number": (i % 604) + 1, "juz_number": (i % 30) + 1}
            for v in range(1, n + 1)
        ]
    return {
        "chapters": chapters, "verses": verses,
        "chapter_reciters": {"reciters": [
            {"id": 12, "name": "Mahmoud Khalil Al-Husary", "style": {"name": "Muallim"}},
            {"id": 6, "name": "Mahmoud Khaleel Al-Husary", "style": {"name": "Murattal"}},
            {"id": 7, "name": "Mishari Rashid al-`Afasy", "style": {"name": "Murattal"}},
        ]},
        "recitations": {"recitations": [
            {"id": 12, "reciter_name": "Mahmoud Khalil Al-Husary", "style": "Muallim"},
            {"id": 6, "reciter_name": "Mahmoud Khalil Al-Husary", "style": None},
            {"id": 7, "reciter_name": "Mishari Rashid al-`Afasy", "style": None},
        ]},
        "chapter_audio": {"audio_files": [
            {"id": i, "chapter_id": i, "format": "mp3", "audio_url": f"https://download.example.test/husary/{i}.mp3"}
            for i in range(1, 115)
        ]},
    }


@pytest.fixture
def api_data():
    return build_api()


@pytest.fixture
def fake_http(monkeypatch, api_data):
    calls = []

    def fake_get(url, params=None, timeout=None, headers=None):
        path = url.replace(importer.API_BASE, "")
        calls.append(path)
        if path == "/chapters":
            return FakeResponse({"chapters": api_data["chapters"]})
        if path.startswith("/verses/by_chapter/"):
            n = int(path.rsplit("/", 1)[1])
            return FakeResponse({"verses": api_data["verses"][n], "pagination": {"next_page": None}})
        if path == "/resources/chapter_reciters":
            return FakeResponse(api_data["chapter_reciters"])
        if path == "/resources/recitations":
            return FakeResponse(api_data["recitations"])
        if path == "/chapter_recitations/6":
            return FakeResponse(api_data["chapter_audio"])
        if path.startswith("/recitations/6/by_chapter/"):
            n = int(path.rsplit("/", 1)[1])
            files = [{"verse_key": v["verse_key"], "url": f"//mirrors.example.test/Husary/{n:03d}{v['verse_number']:03d}.mp3"}
                     for v in api_data["verses"][n]]
            return FakeResponse({"audio_files": files, "pagination": {"next_page": None}})
        return FakeResponse({}, status=404)

    monkeypatch.setattr(requests, "get", fake_get)
    monkeypatch.setattr(importer, "RETRY_DELAY", 0)
    return calls


def test_import_success_totals_and_exact_text(fake_http, api_data):
    call_command("import_quran")
    assert Surah.objects.count() == 114 and Ayah.objects.count() == 6236
    a = Ayah.objects.get(verse_key="5:3")
    assert a.text_uthmani == api_data["verses"][5][2]["text_uthmani"]  # texte strictement identique à la source
    assert (a.juz, a.hizb, a.rub_el_hizb, a.page, a.number_in_surah, a.surah_id) == (6, 6, 6, 6, 3, 5)
    assert Ayah.objects.get(verse_key="7:1").sajda is True and Ayah.objects.filter(sajda=True).count() == 1
    s = Surah.objects.get(pk=2)
    assert (s.name_simple, s.name_arabic, s.name_french, s.verses_count) == ("Sourate-2", "س2", "Nom 2", 54)
    assert Surah.objects.get(pk=1).bismillah_pre is False


def test_import_identifies_husary_murattal_and_stores_only_source_urls(fake_http):
    call_command("import_quran")
    r = Reciter.objects.get()
    assert r.slug == "husary-murattal" and r.source_id == "6" and r.is_default
    assert AudioResource.objects.count() == 114
    assert AudioResource.objects.get(surah_id=3).url == "https://download.example.test/husary/3.mp3"
    assert not AudioResource.objects.filter(ayah__isnull=False).exists()  # versets : seulement avec l'option


def test_import_with_verse_audio(fake_http):
    call_command("import_quran", "--with-verse-audio")
    assert AudioResource.objects.filter(ayah__isnull=False).count() == 6236
    one = AudioResource.objects.get(ayah__verse_key="2:5")
    assert one.url == "https://mirrors.example.test/Husary/002005.mp3"  # « // » complété par « https: » uniquement


def test_import_is_idempotent(fake_http):
    call_command("import_quran", "--with-verse-audio")
    Ayah.objects.filter(verse_key="1:1").update(juz=29)  # dérive locale corrigée par l'import
    call_command("import_quran", "--with-verse-audio")
    assert (Surah.objects.count(), Ayah.objects.count(), Reciter.objects.count()) == (114, 6236, 1)
    assert AudioResource.objects.count() == 114 + 6236
    assert Ayah.objects.get(verse_key="1:1").juz == 2


def test_no_audio_option(fake_http):
    call_command("import_quran", "--no-audio")
    assert Ayah.objects.count() == 6236 and AudioResource.objects.count() == 0 and Reciter.objects.count() == 0


def test_fails_when_total_verses_wrong(fake_http, api_data):
    api_data["verses"][114].pop()  # 6235 versets
    api_data["chapters"][113]["verses_count"] -= 1
    with pytest.raises(CommandError, match="6235"):
        call_command("import_quran")
    assert Ayah.objects.count() == 0 and Surah.objects.count() == 0  # aucune écriture partielle


def test_fails_when_chapter_verses_missing(fake_http, api_data):
    del api_data["verses"][10][5]  # suite non continue
    with pytest.raises(CommandError, match="Sourate 10"):
        call_command("import_quran")
    assert Ayah.objects.count() == 0


def test_fails_when_not_114_surahs(fake_http, api_data):
    api_data["chapters"].pop()
    with pytest.raises(CommandError, match="113"):
        call_command("import_quran")
    assert Surah.objects.count() == 0


def test_fails_on_inconsistent_verse_key_or_bounds(fake_http, api_data):
    api_data["verses"][3][0]["verse_key"] = "3:99"
    with pytest.raises(CommandError):
        call_command("import_quran")
    api_data["verses"][3][0]["verse_key"] = "3:1"
    api_data["verses"][3][0]["hizb_number"] = 61
    with pytest.raises(CommandError, match="hors bornes"):
        call_command("import_quran")


def test_fails_when_reciter_missing(fake_http, api_data):
    api_data["chapter_reciters"]["reciters"] = api_data["chapter_reciters"]["reciters"][2:]
    with pytest.raises(CommandError, match="Husary"):
        call_command("import_quran")
    assert Ayah.objects.count() == 0


def test_unresolvable_relative_audio_url_refused(fake_http, api_data):
    api_data["chapter_audio"]["audio_files"][0]["audio_url"] = "Husary/mp3/001.mp3"
    with pytest.raises(CommandError, match="refusée"):
        call_command("import_quran")
    assert Ayah.objects.count() == 0 and AudioResource.objects.count() == 0  # transaction annulée


def test_http_error_retried_then_reported(monkeypatch):
    attempts = []

    def failing(url, **kw):
        attempts.append(url)
        raise requests.ConnectionError("réseau coupé")

    monkeypatch.setattr(requests, "get", failing)
    monkeypatch.setattr(importer, "RETRY_DELAY", 0)
    with pytest.raises(CommandError, match="indisponible"):
        call_command("import_quran")
    assert len(attempts) == importer.RETRIES


def test_transient_failure_is_retried(monkeypatch, fake_http):
    real = requests.get
    state = {"n": 0}

    def flaky(url, **kw):
        state["n"] += 1
        if state["n"] == 1:
            return FakeResponse({}, status=503)
        return real(url, **kw)

    monkeypatch.setattr(requests, "get", flaky)
    call_command("import_quran", "--no-audio")
    assert Ayah.objects.count() == 6236


def test_import_never_calls_network_in_tests(fake_http):
    call_command("import_quran", "--no-audio")
    assert all(p.startswith("/chapters") or p.startswith("/verses/by_chapter/") for p in fake_http)
