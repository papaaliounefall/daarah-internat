"""Initialise le contenu du portail public avec les SEULS faits vérifiables (cahier des charges + carte officielle).

Faits utilisés (carte talibé officielle) :
  - nom : Daara Internat Shaykh Aliou Fatima
  - localisation : Kahone - Kaolack - Sénégal
  - téléphones : 77 634 46 76 / 70 640 40 58
  - e-mail : seydinandiaye1975@gmail.com

N'invente NI histoire, NI mission, NI vision, NI valeurs, NI activités, NI équipe, NI coordonnées GPS : ces champs
restent vides, à rédiger par le Daara depuis son espace d'administration (``PATCH /api/site-content/``).
Idempotent : ne remplit que les champs vides, sauf avec ``--force`` (écrase les 4 faits ci-dessus).
"""
from django.conf import settings
from django.core.management.base import BaseCommand

from apps.core.models import Establishment
from apps.public_site.models import SiteContent

FACTS = {
    "name": "Daara Internat Shaykh Aliou Fatima",
    "city": "Kahone - Kaolack",
    "country": "Sénégal",
    "phone": "77 634 46 76 / 70 640 40 58",
    "email": "seydinandiaye1975@gmail.com",
    "address": "Kahone - Kaolack - Sénégal",
}
TO_WRITE_BY_DAARA = ["tagline", "history", "mission", "vision", "values", "activities", "team", "admission_info",
                     "latitude", "longitude"]


class Command(BaseCommand):
    help = "Initialise le contenu public avec les faits vérifiables (nom, localisation, téléphones, e-mail)."

    def add_arguments(self, parser):
        parser.add_argument("--slug", default=settings.DEFAULT_ESTABLISHMENT_SLUG)
        parser.add_argument("--force", action="store_true", help="Écrase les champs de contact déjà renseignés.")

    def handle(self, *args, **opts):
        force = opts["force"]
        est, created = Establishment.objects.get_or_create(
            slug=opts["slug"],
            defaults={k: FACTS[k] for k in ("name", "city", "country", "phone", "email", "address")},
        )
        if not created:
            changed = []
            for field in ("city", "country", "phone", "email", "address"):
                if force or not getattr(est, field):
                    setattr(est, field, FACTS[field])
                    changed.append(field)
            if changed:
                est.save(update_fields=changed + ["updated_at"])

        content, _ = SiteContent.objects.get_or_create(establishment=est)
        changed = []
        for field, value in (("contact_phone", FACTS["phone"]), ("contact_email", FACTS["email"]),
                             ("address", FACTS["address"])):
            if force or not getattr(content, field):
                setattr(content, field, value)
                changed.append(field)
        if changed:
            content.save(update_fields=changed + ["updated_at"])

        self.stdout.write(self.style.SUCCESS(
            f"Contenu public initialisé pour « {est.name} » (champs renseignés : {', '.join(changed) or 'aucun'})."))
        self.stdout.write(self.style.WARNING(
            "À rédiger par le Daara (laissés vides, rien n'est inventé) : " + ", ".join(TO_WRITE_BY_DAARA)))
