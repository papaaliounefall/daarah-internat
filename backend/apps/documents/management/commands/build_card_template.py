"""Régénère le fond « vierge » de la carte et le logo d'en-tête à partir du modèle officiel."""
from django.core.management.base import BaseCommand

from apps.documents.pdf import template


class Command(BaseCommand):
    help = "Reconstruit assets/carte_talibe_vierge.jpg et assets/logo_daara.png depuis carte_talibe_modele.jpg."

    def handle(self, *args, **options):
        self.stdout.write(f"Fond vierge : {template.build_blank_background()}")
        self.stdout.write(f"Logo : {template.build_logo()}")
