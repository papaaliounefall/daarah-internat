"""Fond « vierge » de la carte talibé, dérivé du modèle officiel.

Le modèle fourni (``assets/carte_talibe_modele.jpg``, 1280 x 853 px) contient deux textes d'exemple qui ne doivent
pas figurer sur la carte finale : « PHOTO - Coller la photo ici 35x45mm » et « Format photo 35x45mm ». On les
efface en reconstituant le fond uni du cadre (interpolation horizontale des pixels voisins, ligne par ligne) ;
le logo, le texte arabe, les bandeaux, le cadre doré et le pied de page restent strictement ceux du modèle.

Régénérer le fond : ``python manage.py build_card_template``.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / "assets"
MODEL = ASSETS / "carte_talibe_modele.jpg"
BLANK = ASSETS / "carte_talibe_vierge.jpg"
LOGO = ASSETS / "logo_daara.png"

# Rectangles (x0, y0, x1, y1) en pixels du modèle, mesurés sur l'image : textes à masquer + marge.
TEXT_MASKS = [
    (168, 518, 428, 576),   # « PHOTO - Coller la photo ici / 35x45mm »
    (210, 640, 388, 672),   # « Format photo 35x45mm »
]
# Emblème (livre ouvert + couronne de lauriers) pour les en-têtes de documents.
LOGO_BOX = (532, 8, 748, 184)


def _erase(img: Image.Image, box: tuple[int, int, int, int], margin: int = 5) -> None:
    x0, y0, x1, y1 = box
    px = img.load()
    for y in range(y0, y1 + 1):
        left = [px[x, y] for x in range(x0 - margin, x0)]
        right = [px[x, y] for x in range(x1 + 1, x1 + 1 + margin)]
        lc = tuple(sum(c[i] for c in left) // len(left) for i in range(3))
        rc = tuple(sum(c[i] for c in right) // len(right) for i in range(3))
        span = max(1, x1 - x0)
        for x in range(x0, x1 + 1):
            t = (x - x0) / span
            px[x, y] = tuple(round(lc[i] + (rc[i] - lc[i]) * t) for i in range(3))


def build_blank_background(src: Path = MODEL, dst: Path = BLANK, quality: int = 95) -> Path:
    img = Image.open(src).convert("RGB")
    for box in TEXT_MASKS:
        _erase(img, box)
    img.save(dst, "JPEG", quality=quality, subsampling=0)
    return dst


def build_logo(src: Path = MODEL, dst: Path = LOGO) -> Path:
    """Découpe l'emblème officiel du modèle (fond blanc conservé) pour les en-têtes de reçus et rapports."""
    logo = Image.open(src).convert("RGB").crop(LOGO_BOX)
    # Le fond du modèle est un blanc légèrement grisé : on le ramène à du blanc pur pour qu'il se fonde dans la page.
    logo = logo.point(lambda v: min(255, round(v * 255 / 238)))
    logo.save(dst, "PNG", optimize=True)
    return dst
