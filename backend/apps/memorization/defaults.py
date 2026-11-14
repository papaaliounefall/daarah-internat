"""Valeurs de configuration par défaut (modifiables ensuite par le directeur). Ce ne sont pas des données fictives."""
from __future__ import annotations

from decimal import Decimal

from .models import EvaluationCriterion, QualityLevel

# (code, libellé français, libellé arabe, rang : 0 = meilleur)
DEFAULT_QUALITY_LEVELS = [
    ("MUMTAZ", "Excellent", "ممتاز", 0),
    ("JAYYID_JIDDAN", "Très bien", "جيد جدًا", 1),
    ("JAYYID", "Bien", "جيد", 2),
    ("MAQBUL", "Passable", "مقبول", 3),
    ("A_REVOIR", "À revoir", "يحتاج إلى مراجعة", 4),
]

DEFAULT_CRITERIA = [
    "Exactitude de la mémorisation",
    "Fluidité de la récitation",
    "Respect des règles de tajwid",
    "Autonomie du talibé",
]


def seed_defaults(establishment) -> dict:
    """Crée les niveaux et critères par défaut manquants (idempotent : n'écrase jamais une configuration existante)."""
    created = {"quality_levels": 0, "criteria": 0}
    for code, label, label_ar, rank in DEFAULT_QUALITY_LEVELS:
        _, new = QualityLevel.objects.get_or_create(
            establishment=establishment, code=code, defaults={"label": label, "label_ar": label_ar, "rank": rank},
        )
        created["quality_levels"] += new
    for order, name in enumerate(DEFAULT_CRITERIA):
        _, new = EvaluationCriterion.objects.get_or_create(
            establishment=establishment, name=name,
            defaults={"max_score": Decimal("20"), "weight": Decimal("1"), "order": order},
        )
        created["criteria"] += new
    return created
