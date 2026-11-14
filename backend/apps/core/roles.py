from django.db import models


class Role(models.TextChoices):
    DIRECTEUR = "DIRECTEUR", "Directeur"
    ASSISTANT = "ASSISTANT", "Directeur assistant / Assistante administrative"
    MAITRE = "MAITRE", "Maître coranique"
    PARENT = "PARENT", "Parent / Tuteur"


D, A, M, P = Role.DIRECTEUR, Role.ASSISTANT, Role.MAITRE, Role.PARENT

ADMIN_ROLES = frozenset({D, A})
STAFF_ROLES = frozenset({D, A, M})
ALL_ROLES = frozenset({D, A, M, P})
DIRECTOR_ONLY = frozenset({D})
