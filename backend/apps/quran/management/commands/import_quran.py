"""Importe le Coran (114 sourates, 6236 versets) depuis l'API officielle Quran.com v4.

    python manage.py import_quran [--with-verse-audio] [--no-audio]

Idempotent. Code de sortie ≠ 0 si la source est indisponible ou incohérente (totaux ≠ 114 / 6236).
"""
from django.core.management.base import BaseCommand, CommandError

from apps.quran.importer import ImportErrorQuran, run_import


class Command(BaseCommand):
    help = "Importe le corpus coranique depuis l'API Quran.com v4 (texte uthmani tel quel, audio Al-Husary)."

    def add_arguments(self, parser):
        parser.add_argument("--with-verse-audio", action="store_true", help="Importe aussi l'audio verset par verset.")
        parser.add_argument("--no-audio", action="store_true", help="N'importe que le texte.")

    def handle(self, *args, **opts):
        try:
            report = run_import(
                with_verse_audio=opts["with_verse_audio"], with_audio=not opts["no_audio"],
                progress=lambda m: self.stdout.write(m) if opts["verbosity"] >= 2 else None,
            )
        except ImportErrorQuran as exc:
            raise CommandError(f"Import interrompu, aucune donnée modifiée : {exc}") from exc
        self.stdout.write(self.style.SUCCESS(
            f"Import terminé : {report.surahs} sourates, {report.ayat} versets contrôlés."
        ))
        if report.reciter:
            self.stdout.write(
                f"Récitateur : {report.reciter} — audio de sourate : {report.audio_chapters}, "
                f"audio de verset : {report.audio_verses}."
            )
        for w in report.warnings:
            self.stdout.write(self.style.WARNING(w))
