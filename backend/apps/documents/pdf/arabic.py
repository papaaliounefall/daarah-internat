"""Rendu correct du texte arabe (et mixte arabe/latin) dans les PDF ReportLab.

ReportLab dessine les glyphes un par un, dans l'ordre logique, sans « shaping » OpenType : une chaîne
arabe brute s'affiche donc avec des lettres isolées et inversées. Deux étapes sont indispensables :

1. ``arabic_reshaper`` remplace chaque lettre par sa forme contextuelle (initiale, médiane, finale, isolée,
   ligatures lam-alif…) en « Presentation Forms » Unicode ;
2. ``python-bidi`` réordonne la ligne en ordre visuel (droite -> gauche, chiffres et mots latins conservés).

La police doit contenir ces « Presentation Forms » : **Amiri** (SIL OFL, voir ``assets/fonts/OFL-Amiri.txt``) les
fournit. Une police Unicode quelconque ne suffit pas.

Usage :
    register_fonts()
    draw_text(canvas, x, y, "مدرسة الشيخ علي فاطمة الداخلية", size=12, align="right")
"""
from __future__ import annotations

import re
from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

AR = "Amiri"
AR_BOLD = "Amiri-Bold"
LATIN = "NotoSans"
LATIN_BOLD = "NotoSans-SemiBold"

_FONT_FILES = {
    AR: "Amiri-Regular.ttf",
    AR_BOLD: "Amiri-Bold.ttf",
    LATIN: "NotoSans-Regular.ttf",
    LATIN_BOLD: "NotoSans-SemiBold.ttf",
}

# Blocs Unicode arabes (lettres de base + formes de présentation A et B).
ARABIC_RE = re.compile("[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]")

_reshaper = arabic_reshaper.ArabicReshaper(
    configuration={"delete_harakat": True, "support_ligatures": True, "delete_tatweel": False}
)
_registered = False


def register_fonts() -> None:
    """Enregistre (une seule fois) les polices embarquées dans le registre ReportLab."""
    global _registered
    if _registered:
        return
    for name, filename in _FONT_FILES.items():
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / filename)))
    pdfmetrics.registerFontFamily(LATIN, normal=LATIN, bold=LATIN_BOLD, italic=LATIN, boldItalic=LATIN_BOLD)
    pdfmetrics.registerFontFamily(AR, normal=AR, bold=AR_BOLD, italic=AR, boldItalic=AR_BOLD)
    _registered = True


def has_arabic(text: str | None) -> bool:
    return bool(text and ARABIC_RE.search(text))


def shape(text: str | None) -> str:
    """Texte prêt à être dessiné : lettres liées + ordre visuel. Le latin pur est renvoyé tel quel."""
    if not text:
        return ""
    if not has_arabic(text):
        return text
    return get_display(_reshaper.reshape(text))


def font_for(text: str | None, latin: str = LATIN, arabic: str | None = None) -> str:
    """Police adaptée : Amiri (qui contient aussi le latin) dès qu'un caractère arabe est présent."""
    if has_arabic(text):
        if arabic:
            return arabic
        return AR_BOLD if latin == LATIN_BOLD else AR
    return latin


def text_width(text: str, font: str, size: float) -> float:
    register_fonts()
    return pdfmetrics.stringWidth(shape(text), font, size)


def fit_size(text: str, font: str, max_size: float, max_width: float, min_size: float = 4.0) -> float:
    """Plus grande taille (<= max_size) pour que le texte tienne dans max_width, plancher min_size."""
    register_fonts()
    shaped = shape(text)
    width = pdfmetrics.stringWidth(shaped, font, max_size)
    if width <= max_width or width == 0:
        return max_size
    return max(min_size, max_size * max_width / width * 0.995)  # marge : évite les arrondis flottants


def truncate_to_width(text: str, font: str, size: float, max_width: float) -> str:
    """Tronque avec « … » si, même à la taille minimale, le texte dépasse la largeur disponible."""
    register_fonts()
    if pdfmetrics.stringWidth(shape(text), font, size) <= max_width:
        return text
    while len(text) > 1 and pdfmetrics.stringWidth(shape(text.rstrip() + "…"), font, size) > max_width:
        text = text[:-1]
    return text.rstrip() + "…"


def draw_text(canvas, x: float, y: float, text: str | None, *, font: str = LATIN, size: float = 10,
              align: str = "left", max_width: float | None = None, min_size: float = 4.0) -> float:
    """Dessine ``text`` (latin, arabe ou mixte). Retourne la taille de police effectivement utilisée.

    ``align`` : left | right | center (par rapport à ``x``). Si ``max_width`` est donné, la taille est réduite
    automatiquement (jusqu'à ``min_size``) puis le texte est tronqué en dernier recours.
    """
    if not text:
        return size
    register_fonts()
    font = font_for(text, font)
    if max_width is not None:
        size = fit_size(text, font, size, max_width, min_size)
        text = truncate_to_width(text, font, size, max_width)
    shaped = shape(text)
    width = pdfmetrics.stringWidth(shaped, font, size)
    if align == "right":
        x -= width
    elif align == "center":
        x -= width / 2
    canvas.setFont(font, size)
    canvas.drawString(x, y, shaped)
    return size
