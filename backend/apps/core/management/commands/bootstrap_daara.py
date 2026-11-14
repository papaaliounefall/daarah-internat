"""Initialise l'établissement et le compte directeur (idempotent, sans aucune donnée fictive).

Variables d'environnement lues :
  DAARA_NAME, DAARA_SLUG (défaut : settings.DEFAULT_ESTABLISHMENT_SLUG), DAARA_CITY, DAARA_PHONE, DAARA_EMAIL,
  DIRECTOR_USERNAME, DIRECTOR_PASSWORD, DIRECTOR_FIRST_NAME, DIRECTOR_LAST_NAME, DIRECTOR_EMAIL

Si DIRECTOR_PASSWORD est absent lors de la première création, un mot de passe aléatoire est généré et
affiché UNE SEULE FOIS (à noter immédiatement ; changement obligatoire à la première connexion).
"""
import os
import secrets

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.core.models import Establishment
from apps.core.roles import Role


class Command(BaseCommand):
    help = "Crée l'établissement et le directeur initial s'ils n'existent pas."

    def handle(self, *args, **options):
        env = os.environ.get
        slug = env("DAARA_SLUG", settings.DEFAULT_ESTABLISHMENT_SLUG)
        est, created = Establishment.objects.get_or_create(
            slug=slug,
            defaults={
                "name": env("DAARA_NAME", "Daara Internat Shaykh Aliou Fatima"),
                "city": env("DAARA_CITY", "Kahone, Kaolack"),
                "phone": env("DAARA_PHONE", ""),
                "email": env("DAARA_EMAIL", ""),
            },
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"Établissement créé : {est.name}"))

        User = get_user_model()
        if User.objects.filter(establishment=est, role=Role.DIRECTEUR).exists():
            return

        username = env("DIRECTOR_USERNAME", "directeur")
        password = env("DIRECTOR_PASSWORD") or secrets.token_urlsafe(14)
        generated = not env("DIRECTOR_PASSWORD")
        user = User(
            username=username, role=Role.DIRECTEUR, establishment=est,
            first_name=env("DIRECTOR_FIRST_NAME", "Directeur"), last_name=env("DIRECTOR_LAST_NAME", ""),
            email=env("DIRECTOR_EMAIL", ""), is_staff=True, must_change_password=True,  # le mot de passe initial n'est jamais définitif
        )
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Compte directeur créé : {username}"))
        if generated:
            self.stdout.write(self.style.WARNING(f"Mot de passe initial (affiché une seule fois) : {password}"))
