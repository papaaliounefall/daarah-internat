from django.apps import AppConfig


class MemorizationConfig(AppConfig):
    name = "apps.memorization"
    label = "memorization"

    def ready(self):
        from . import signals  # noqa: F401  (enregistre le semis des valeurs par défaut)
