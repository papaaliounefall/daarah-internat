from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.core.models import Establishment

from .defaults import seed_defaults


@receiver(post_save, sender=Establishment, dispatch_uid="memorization_seed_defaults")
def seed_defaults_on_new_establishment(sender, instance, created, raw=False, **kwargs):
    """Tout nouvel établissement reçoit les niveaux de qualité et critères d'évaluation par défaut."""
    if created and not raw:
        seed_defaults(instance)
