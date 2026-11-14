"""Crée les niveaux de qualité et critères d'évaluation par défaut pour les établissements existants (idempotent)."""
from django.core.management.base import BaseCommand, CommandError

from apps.core.models import Establishment
from apps.memorization.defaults import seed_defaults


class Command(BaseCommand):
    help = "Sème les niveaux de qualité et critères d'évaluation par défaut (sans écraser l'existant)."

    def add_arguments(self, parser):
        parser.add_argument("--establishment", help="Slug d'un établissement (par défaut : tous).")

    def handle(self, *args, **opts):
        qs = Establishment.objects.all()
        if opts["establishment"]:
            qs = qs.filter(slug=opts["establishment"])
            if not qs.exists():
                raise CommandError(f"Établissement introuvable : {opts['establishment']}")
        for est in qs:
            res = seed_defaults(est)
            self.stdout.write(f"{est.name} : {res['quality_levels']} niveaux et {res['criteria']} critères créés.")
