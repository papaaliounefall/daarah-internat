"""Produit un PDF de contrôle de l'alignement de la carte (textes repères, aucune donnée réelle)."""
from django.core.management.base import BaseCommand

from apps.documents.pdf.card import FIELDS, render_card


class Command(BaseCommand):
    help = "Génère un PDF de contrôle (valeurs repères) pour ajuster FIELDS / PHOTO_BOX dans apps/documents/pdf/card.py."

    def add_arguments(self, parser):
        parser.add_argument("--out", default="carte_controle.pdf")
        parser.add_argument("--photo", help="Chemin d'une image à placer dans le cadre (facultatif)")

    def handle(self, *args, **opts):
        values = {key: f"[{key}]" for key, *_ in FIELDS}
        photo = None
        if opts["photo"]:
            with open(opts["photo"], "rb") as fh:
                photo = fh.read()
        with open(opts["out"], "wb") as fh:
            fh.write(render_card(values, photo, title="Carte talibé - contrôle"))
        self.stdout.write(self.style.SUCCESS(f"PDF de contrôle écrit : {opts['out']}"))
