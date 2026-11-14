"""Corpus coranique de référence (global, commun à tous les établissements).

Le texte est importé tel quel depuis une source reconnue (commande ``import_quran``) et n'est
JAMAIS modifié, réordonné ni généré localement.
"""
from django.db import models


class Surah(models.Model):
    number = models.PositiveSmallIntegerField(primary_key=True)
    name_arabic = models.CharField(max_length=60)
    name_simple = models.CharField(max_length=60)  # translittération
    name_french = models.CharField(max_length=80, blank=True)
    revelation_place = models.CharField(max_length=10, blank=True)  # makkah / madinah
    verses_count = models.PositiveSmallIntegerField()
    page_start = models.PositiveSmallIntegerField(null=True)
    page_end = models.PositiveSmallIntegerField(null=True)
    bismillah_pre = models.BooleanField(default=True)

    class Meta:
        ordering = ["number"]

    def __str__(self):
        return f"{self.number}. {self.name_simple}"


class Ayah(models.Model):
    surah = models.ForeignKey(Surah, on_delete=models.CASCADE, related_name="ayat")
    number_in_surah = models.PositiveSmallIntegerField()
    verse_key = models.CharField(max_length=8, unique=True)  # « 2:255 »
    text_uthmani = models.TextField()
    juz = models.PositiveSmallIntegerField()
    hizb = models.PositiveSmallIntegerField()  # 1..60
    rub_el_hizb = models.PositiveSmallIntegerField()  # 1..240
    page = models.PositiveSmallIntegerField()  # page du mushaf de Médine (604 pages)
    sajda = models.BooleanField(default=False)

    class Meta:
        ordering = ["surah_id", "number_in_surah"]
        constraints = [models.UniqueConstraint(fields=["surah", "number_in_surah"], name="uniq_ayah_in_surah")]
        indexes = [models.Index(fields=["juz"]), models.Index(fields=["page"])]

    def __str__(self):
        return self.verse_key


class Reciter(models.Model):
    slug = models.SlugField(unique=True)
    name = models.CharField(max_length=120)
    source = models.CharField(max_length=60)  # ex. « quran.com »
    source_id = models.CharField(max_length=40)
    is_default = models.BooleanField(default=False)
    license_note = models.TextField(blank=True)

    def __str__(self):
        return self.name


class AudioResource(models.Model):
    """URL audio réellement fournie par la source. Aucune URL n'est fabriquée à la main."""

    reciter = models.ForeignKey(Reciter, on_delete=models.CASCADE, related_name="audio")
    surah = models.ForeignKey(Surah, on_delete=models.CASCADE, related_name="audio")
    ayah = models.ForeignKey(Ayah, on_delete=models.CASCADE, null=True, blank=True, related_name="audio")
    url = models.URLField(max_length=500)
    duration_seconds = models.FloatField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["reciter", "surah", "ayah"], name="uniq_audio")]
        indexes = [models.Index(fields=["reciter", "surah"])]
