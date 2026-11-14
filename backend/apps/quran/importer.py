"""Import du corpus coranique depuis l'API officielle Quran.com (v4).

Principes :
- le texte (``text_uthmani``) est stocké EXACTEMENT comme fourni (aucun nettoyage, aucune normalisation) ;
- aucune URL audio n'est fabriquée : seules celles renvoyées par la source sont enregistrées
  (les URL « protocole relatif » ``//hôte/chemin`` reçoivent uniquement le préfixe ``https:``) ;
- l'import est idempotent (mise à jour sur clé naturelle) et atomique : toute incohérence
  (114 sourates / 6236 versets / suites de versets) interrompt l'import sans écriture.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

import requests
from django.db import transaction

from .models import AudioResource, Ayah, Reciter, Surah

logger = logging.getLogger(__name__)

API_BASE = "https://api.quran.com/api/v4"
EXPECTED_SURAHS = 114
EXPECTED_AYAT = 6236
TIMEOUT = 30
RETRIES = 4
RETRY_DELAY = 2  # secondes (mis à 0 dans les tests)

# Récitateur retenu : Mahmoud Khalil Al-Husary (style Murattal), tel que nommé par la source.
RECITER_SLUG = "husary-murattal"
RECITER_NAME_MATCH = "husary"
RECITER_STYLE = "Murattal"
SOURCE = "quran.com"
LICENSE_NOTE = (
    "Audio fourni par Quran.com / Quran Foundation (miroirs quranicaudio.com et EveryAyah). "
    "Conditions d'usage et droits de diffusion à vérifier par l'établissement avant usage public."
)


class ImportErrorQuran(Exception):
    """Incohérence ou indisponibilité de la source : l'import est abandonné."""


def fetch_json(path: str, params: dict | None = None) -> dict:
    """GET JSON avec nouvelles tentatives (connexion instable)."""
    url = f"{API_BASE}{path}"
    last: Exception | None = None
    for attempt in range(RETRIES):
        try:
            resp = requests.get(url, params=params, timeout=TIMEOUT, headers={"Accept": "application/json"})
            if resp.status_code != 200:
                raise ImportErrorQuran(f"HTTP {resp.status_code} sur {url}")
            return resp.json()
        except (requests.RequestException, ValueError, ImportErrorQuran) as exc:
            last = exc
            if attempt < RETRIES - 1 and RETRY_DELAY:
                time.sleep(RETRY_DELAY * (attempt + 1))
    raise ImportErrorQuran(f"Source indisponible ({url}) : {last}")


@dataclass
class ImportReport:
    surahs: int = 0
    ayat: int = 0
    audio_chapters: int = 0
    audio_verses: int = 0
    reciter: str = ""
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------- récupération ----------
def fetch_chapters() -> list[dict]:
    data = fetch_json("/chapters", {"language": "fr"})
    chapters = data.get("chapters")
    if not isinstance(chapters, list):
        raise ImportErrorQuran("Réponse « chapters » invalide.")
    return sorted(chapters, key=lambda c: c["id"])


def fetch_verses(chapter_id: int) -> list[dict]:
    verses: list[dict] = []
    page = 1
    while page:
        data = fetch_json(
            f"/verses/by_chapter/{chapter_id}",
            {"language": "fr", "fields": "text_uthmani", "per_page": 300, "page": page},
        )
        verses.extend(data.get("verses", []))
        page = (data.get("pagination") or {}).get("next_page")
    return verses


def find_chapter_reciter() -> dict:
    """Identifie Al-Husary (Murattal) dans la liste officielle des récitateurs de sourates."""
    data = fetch_json("/resources/chapter_reciters", {"language": "en"})
    candidates = [r for r in data.get("reciters", []) if RECITER_NAME_MATCH in r.get("name", "").lower()]
    for r in candidates:
        if (r.get("style") or {}).get("name") == RECITER_STYLE:
            return r
    raise ImportErrorQuran("Récitateur Al-Husary (Murattal) introuvable dans la liste de la source.")


def find_verse_recitation() -> dict:
    data = fetch_json("/resources/recitations", {"language": "en"})
    candidates = [r for r in data.get("recitations", []) if RECITER_NAME_MATCH in r.get("reciter_name", "").lower()]
    # Style « None » = récitation Murattal standard chez la source (l'autre est « Muallim »).
    for r in candidates:
        if not r.get("style"):
            return r
    raise ImportErrorQuran("Récitation verset par verset d'Al-Husary introuvable dans la liste de la source.")


def _absolute(url: str) -> str:
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("http://") or url.startswith("https://"):
        return url
    raise ImportErrorQuran(f"URL audio relative non résolue (refusée plutôt qu'inventée) : {url!r}")


# ---------------------------------------------------------------- contrôles --------------
def validate_corpus(chapters: list[dict], verses_by_chapter: dict[int, list[dict]]) -> int:
    if len(chapters) != EXPECTED_SURAHS or [c["id"] for c in chapters] != list(range(1, EXPECTED_SURAHS + 1)):
        raise ImportErrorQuran(f"{len(chapters)} sourates reçues au lieu de {EXPECTED_SURAHS}.")
    total = 0
    for ch in chapters:
        cid = ch["id"]
        verses = verses_by_chapter.get(cid, [])
        numbers = [v["verse_number"] for v in verses]
        if numbers != list(range(1, ch["verses_count"] + 1)):
            raise ImportErrorQuran(
                f"Sourate {cid} : {len(verses)} versets reçus, {ch['verses_count']} attendus (ou suite non continue)."
            )
        for v in verses:
            key = f"{cid}:{v['verse_number']}"
            if v.get("verse_key") != key:
                raise ImportErrorQuran(f"Clé de verset incohérente : {v.get('verse_key')!r} au lieu de {key!r}.")
            if not v.get("text_uthmani"):
                raise ImportErrorQuran(f"Verset {key} sans texte.")
            if not (1 <= v["juz_number"] <= 30 and 1 <= v["hizb_number"] <= 60 and 1 <= v["page_number"] <= 604
                    and 1 <= v["rub_el_hizb_number"] <= 240):
                raise ImportErrorQuran(f"Verset {key} : juz/hizb/rub/page hors bornes.")
        total += len(verses)
    if total != EXPECTED_AYAT:
        raise ImportErrorQuran(f"{total} versets reçus au lieu de {EXPECTED_AYAT}.")
    return total


# ---------------------------------------------------------------- écriture ---------------
def _save_corpus(chapters, verses_by_chapter):
    for ch in chapters:
        pages = ch.get("pages") or [None, None]
        Surah.objects.update_or_create(
            number=ch["id"],
            defaults={
                "name_arabic": ch["name_arabic"],
                "name_simple": ch["name_simple"],
                "name_french": (ch.get("translated_name") or {}).get("name", ""),
                "revelation_place": ch.get("revelation_place", ""),
                "verses_count": ch["verses_count"],
                "page_start": pages[0],
                "page_end": pages[1],
                "bismillah_pre": bool(ch.get("bismillah_pre", True)),
            },
        )
    ayat = [
        Ayah(
            surah_id=ch["id"], number_in_surah=v["verse_number"], verse_key=v["verse_key"],
            text_uthmani=v["text_uthmani"],  # tel quel
            juz=v["juz_number"], hizb=v["hizb_number"], rub_el_hizb=v["rub_el_hizb_number"], page=v["page_number"],
            sajda=v.get("sajdah_number") is not None,
        )
        for ch in chapters for v in verses_by_chapter[ch["id"]]
    ]
    Ayah.objects.bulk_create(
        ayat, batch_size=500, update_conflicts=True, unique_fields=["verse_key"],
        update_fields=["surah", "number_in_surah", "text_uthmani", "juz", "hizb", "rub_el_hizb", "page", "sajda"],
    )


def _import_chapter_audio(reciter_info: dict, report: ImportReport):
    data = fetch_json(f"/chapter_recitations/{reciter_info['id']}")
    files = data.get("audio_files")
    if not isinstance(files, list):
        raise ImportErrorQuran("Réponse « chapter_recitations » invalide.")
    reciter, _ = Reciter.objects.update_or_create(
        slug=RECITER_SLUG,
        defaults={
            "name": "Mahmoud Khalil Al-Husary (Murattal)", "source": SOURCE,
            "source_id": str(reciter_info["id"]), "is_default": True, "license_note": LICENSE_NOTE,
        },
    )
    Reciter.objects.exclude(pk=reciter.pk).filter(is_default=True).update(is_default=False)
    seen = set()
    for f in files:
        cid, url = f.get("chapter_id"), f.get("audio_url")
        if not cid or not url or not Surah.objects.filter(pk=cid).exists():
            raise ImportErrorQuran(f"Fichier audio de sourate invalide : {f!r}")
        AudioResource.objects.update_or_create(
            reciter=reciter, surah_id=cid, ayah=None,
            defaults={"url": _absolute(url)},
        )
        seen.add(cid)
    report.audio_chapters = len(seen)
    report.reciter = reciter.name
    if len(seen) != EXPECTED_SURAHS:
        report.warnings.append(f"Audio de sourate disponible pour {len(seen)} sourates sur {EXPECTED_SURAHS}.")
    return reciter


def _import_verse_audio(reciter: Reciter, recitation_id: int, report: ImportReport):
    ayat = {a.verse_key: a for a in Ayah.objects.all()}
    rows = []
    for surah in Surah.objects.all():
        page = 1
        while page:
            data = fetch_json(f"/recitations/{recitation_id}/by_chapter/{surah.number}", {"per_page": 300, "page": page})
            for f in data.get("audio_files", []):
                ayah = ayat.get(f.get("verse_key"))
                if ayah is None or not f.get("url"):
                    raise ImportErrorQuran(f"Audio de verset invalide : {f!r}")
                rows.append(AudioResource(reciter=reciter, surah=surah, ayah=ayah, url=_absolute(f["url"])))
            page = (data.get("pagination") or {}).get("next_page")
    AudioResource.objects.bulk_create(
        rows, batch_size=500, update_conflicts=True, unique_fields=["reciter", "surah", "ayah"], update_fields=["url"],
    )
    report.audio_verses = len(rows)


def run_import(*, with_verse_audio: bool = False, with_audio: bool = True, progress=None) -> ImportReport:
    """Importe le corpus. Lève ``ImportErrorQuran`` si la source est incohérente."""
    say = progress or (lambda msg: None)
    report = ImportReport()
    say("Récupération des sourates…")
    chapters = fetch_chapters()
    verses_by_chapter: dict[int, list[dict]] = {}
    for ch in chapters:
        verses_by_chapter[ch["id"]] = fetch_verses(ch["id"])
        say(f"  sourate {ch['id']:>3} : {len(verses_by_chapter[ch['id']])} versets")
    report.ayat = validate_corpus(chapters, verses_by_chapter)
    report.surahs = len(chapters)

    reciter_info = recitation = None
    if with_audio:
        reciter_info = find_chapter_reciter()
        if with_verse_audio:
            recitation = find_verse_recitation()

    with transaction.atomic():
        _save_corpus(chapters, verses_by_chapter)
        if reciter_info:
            reciter = _import_chapter_audio(reciter_info, report)
            if recitation:
                say("Audio verset par verset…")
                _import_verse_audio(reciter, recitation["id"], report)
        # Contrôle final en base, AVANT validation de la transaction.
        if Surah.objects.count() != EXPECTED_SURAHS or Ayah.objects.count() != EXPECTED_AYAT:
            raise ImportErrorQuran(
                f"Contrôle final échoué : {Surah.objects.count()} sourates, {Ayah.objects.count()} versets en base."
            )

    return report
