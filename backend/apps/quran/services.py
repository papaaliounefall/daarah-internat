"""Accès métier au corpus coranique. Lecture seule : le texte n'est jamais généré ni modifié."""
from __future__ import annotations

from typing import NamedTuple

from rest_framework.exceptions import ValidationError

from .models import Ayah, Surah


class ResolvedRange(NamedTuple):
    surah: Surah
    ayah_start: int
    ayah_end: int
    juz: int
    hizb: int
    page: int


def resolve_range(surah_number, ayah_start, ayah_end) -> ResolvedRange:
    """Valide une plage de versets et retourne juz / hizb / page du DERNIER verset.

    Lève ``ValidationError`` (messages en français, par champ) si la sourate n'existe pas, si la
    plage est incohérente (début > fin, verset hors sourate) ou si le corpus n'est pas importé.
    """
    try:
        number, start, end = int(surah_number), int(ayah_start), int(ayah_end)
    except (TypeError, ValueError):
        raise ValidationError({"detail": "Sourate et versets doivent être des nombres entiers."}) from None
    surah = Surah.objects.filter(pk=number).first()
    if surah is None:
        raise ValidationError({"surah": f"La sourate {number} n'existe pas (1 à 114)."})
    if start < 1:
        raise ValidationError({"ayah_start": "Le premier verset doit être au moins 1."})
    if start > end:
        raise ValidationError({"ayah_end": "Le dernier verset doit être supérieur ou égal au premier."})
    if end > surah.verses_count:
        raise ValidationError(
            {"ayah_end": f"La sourate {surah.name_simple} compte {surah.verses_count} versets : "
                         f"le verset {end} n'existe pas."}
        )
    last = Ayah.objects.filter(surah=surah, number_in_surah=end).first()
    if last is None or not Ayah.objects.filter(surah=surah, number_in_surah=start).exists():
        raise ValidationError(
            {"detail": "Le corpus coranique n'est pas (entièrement) importé : contactez l'administrateur."}
        )
    return ResolvedRange(surah, start, end, last.juz, last.hizb, last.page)
