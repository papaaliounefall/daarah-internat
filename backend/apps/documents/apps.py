from django.apps import AppConfig


class DocumentsConfig(AppConfig):
    name = "apps.documents"
    label = "documents"
    verbose_name = "Documents (cartes, reçus, rapports)"

    def ready(self):
        # Branche la génération automatique de la carte après l'enregistrement d'un talibé.
        from . import signals  # noqa: F401
