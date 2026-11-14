"""Éléments communs des PDF administratifs (reçus, rapports) : formats, en-tête officiel, couleurs."""
from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.utils import ImageReader

from . import arabic
from .template import LOGO, build_logo

# En-tête arabe OFFICIEL de ce Daara, repris tel quel de la carte talibé (3 lignes).
# Il n'est imprimé que pour l'établissement par défaut : le modèle ``Establishment`` n'a pas (encore) de
# champ « nom en arabe » pour les autres établissements.
OFFICIAL_ARABIC_HEADER = ["مدرسة الشيخ علي فاطمة الداخلية", "لتحفيظ القرآن", "كاهون كولاك - السنغال"]


def format_fcfa(amount) -> str:
    """35000 -> « 35 000 FCFA » (espace comme séparateur de milliers, pas de décimales)."""
    value = int(Decimal(amount or 0))
    sign = "-" if value < 0 else ""
    return f"{sign}{abs(value):,}".replace(",", " ") + " FCFA"


def format_date(d) -> str:
    return d.strftime("%d/%m/%Y") if d else ""


def hex_color(value: str | None, default: str) -> Color:
    try:
        return HexColor(value or default)
    except Exception:  # noqa: BLE001
        return HexColor(default)


def arabic_header_lines(establishment) -> list[str]:
    configured = [ln.strip() for ln in (getattr(establishment, "name_ar", "") or "").splitlines() if ln.strip()]
    if configured:
        return configured
    if establishment.slug == getattr(settings, "DEFAULT_ESTABLISHMENT_SLUG", None):
        return OFFICIAL_ARABIC_HEADER
    return []


def contact_line(establishment) -> str:
    place = ", ".join(p for p in [establishment.address, establishment.city, establishment.country] if p)
    parts = [place]
    if establishment.phone:
        parts.append(f"Tél : {establishment.phone}")
    if establishment.email:
        parts.append(establishment.email)
    return "  |  ".join(p for p in parts if p)


def logo_reader() -> ImageReader | None:
    if not LOGO.exists():
        build_logo()
    return ImageReader(str(LOGO)) if LOGO.exists() else None


def draw_letterhead(c, establishment, page_w: float, top_y: float, *, logo_h: float = 62, margin: float = 34) -> float:
    """En-tête centré : emblème, nom arabe (si connu), nom latin, coordonnées, filet doré. Retourne l'ordonnée basse."""
    arabic.register_fonts()
    primary = hex_color(establishment.primary_color, "#114232")
    accent = hex_color(establishment.accent_color, "#C5A059")
    mid = page_w / 2
    y = top_y
    logo = logo_reader()
    if logo is not None:
        iw, ih = logo.getSize()
        w = logo_h * iw / ih
        c.drawImage(logo, mid - w / 2, y - logo_h, w, logo_h, mask="auto")
        y -= logo_h + 6
    for line in arabic_header_lines(establishment):
        c.setFillColor(accent)
        arabic.draw_text(c, mid, y - 10, line, font=arabic.AR_BOLD, size=11, align="center")
        y -= 13
    c.setFillColor(primary)
    arabic.draw_text(c, mid, y - 14, establishment.name, font=arabic.LATIN_BOLD, size=12.5, align="center",
                     max_width=page_w - 2 * margin)
    y -= 18
    c.setFillColor(Color(0.35, 0.35, 0.35))
    arabic.draw_text(c, mid, y - 9, contact_line(establishment), font=arabic.LATIN, size=7, align="center",
                     max_width=page_w - 2 * margin, min_size=5)
    y -= 14
    c.setStrokeColor(accent)
    c.setLineWidth(1.2)
    c.line(margin, y, page_w - margin, y)
    c.setStrokeColor(primary)
    c.setLineWidth(0.4)
    c.line(margin, y - 2.4, page_w - margin, y - 2.4)
    return y - 8
