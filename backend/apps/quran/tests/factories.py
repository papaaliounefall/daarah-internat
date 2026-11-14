"""Mini-corpus de TEST (jamais utilisé en production) : structure réelle de 3 sourates courtes, texte factice.

Le vrai corpus provient exclusivement de ``manage.py import_quran``.
"""
from apps.quran.models import AudioResource, Ayah, Reciter, Surah

# (numéro, nom simple, nom arabe, nb de versets, page, juz, hizb)
MINI = [
    (1, "Al-Fatihah", "الفاتحة", 7, 1, 1, 1),
    (112, "Al-Ikhlas", "الإخلاص", 4, 604, 30, 60),
    (114, "An-Nas", "الناس", 6, 604, 30, 60),
]


def load_mini_corpus():
    for number, simple, arabic, count, page, juz, hizb in MINI:
        surah = Surah.objects.create(
            number=number, name_arabic=arabic, name_simple=simple, name_french=simple, revelation_place="makkah",
            verses_count=count, page_start=page, page_end=page, bismillah_pre=number != 1,
        )
        for n in range(1, count + 1):
            Ayah.objects.create(
                surah=surah, number_in_surah=n, verse_key=f"{number}:{n}", text_uthmani=f"[test {number}:{n}]",
                juz=juz, hizb=hizb, rub_el_hizb=hizb * 4, page=page,
            )
    return Surah.objects.all()


def load_test_audio():
    reciter = Reciter.objects.create(
        slug="husary-murattal", name="Al-Husary (test)", source="quran.com", source_id="6", is_default=True,
    )
    s1 = Surah.objects.get(pk=1)
    AudioResource.objects.create(reciter=reciter, surah=s1, url="https://example.test/audio/1.mp3")
    AudioResource.objects.create(
        reciter=reciter, surah=s1, ayah=Ayah.objects.get(verse_key="1:1"), url="https://example.test/audio/1-1.mp3"
    )
    return reciter
