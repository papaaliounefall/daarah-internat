"""Reçu de paiement (A5 portrait)."""
from __future__ import annotations

import io

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A5
from reportlab.pdfgen import canvas

from . import arabic
from .common import draw_letterhead, format_date, format_fcfa, hex_color

RED = HexColor("#B42318")
GREY = Color(0.40, 0.40, 0.40)
INK = Color(0.08, 0.10, 0.09)


def render_receipt(data: dict) -> bytes:
    """``data`` : voir ``apps.documents.views.receipt_data`` (valeurs déjà prêtes à imprimer)."""
    arabic.register_fonts()
    est = data["establishment"]
    primary = hex_color(est.primary_color, "#114232")
    accent = hex_color(est.accent_color, "#C5A059")
    cancelled = data["cancelled"]
    W, H = A5
    margin = 34
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A5)
    c.setTitle(f"Reçu {data['receipt_number']}" + (" (ANNULÉ)" if cancelled else ""))
    c.setAuthor(est.name)
    c.setSubject("Reçu de paiement")

    y = draw_letterhead(c, est, W, H - 28)

    # --- titre + numéro ---
    y -= 14
    c.setFillColor(primary)
    arabic.draw_text(c, margin, y, "REÇU DE PAIEMENT", font=arabic.LATIN_BOLD, size=15)
    c.setFillColor(INK)
    arabic.draw_text(c, W - margin, y, f"N° {data['receipt_number']}", font=arabic.LATIN_BOLD, size=11, align="right")
    y -= 8
    c.setStrokeColor(Color(0.85, 0.85, 0.85))
    c.setLineWidth(0.5)
    c.line(margin, y, W - margin, y)

    # --- lignes d'information ---
    rows = [("Talibé", data["student_name"]), ("Matricule", data["registration_number"]),
            ("Objet", data["object"])]
    if data.get("due_label"):
        rows.append(("Échéance", data["due_label"]))
    rows += [("Mode de paiement", data["method"])]
    if data.get("reference"):
        rows.append(("Référence", data["reference"]))
    rows += [("Date du paiement", data["date"]), ("Encaissé par", data["recorded_by"])]
    y -= 6
    for label, value in rows:
        y -= 17
        c.setFillColor(GREY)
        arabic.draw_text(c, margin, y, label, font=arabic.LATIN, size=8.5)
        c.setFillColor(INK)
        arabic.draw_text(c, W - margin, y, value, font=arabic.LATIN_BOLD, size=10, align="right",
                         max_width=W - 2 * margin - 100, min_size=6.5)
        c.setStrokeColor(Color(0.92, 0.92, 0.92))
        c.line(margin, y - 5, W - margin, y - 5)

    # --- montant ---
    y -= 26
    box_h = 40
    c.setStrokeColor(RED if cancelled else accent)
    c.setFillColor(Color(0.99, 0.97, 0.94))
    c.setLineWidth(1.2)
    c.roundRect(margin, y - box_h + 12, W - 2 * margin, box_h, 6, stroke=1, fill=1)
    c.setFillColor(GREY)
    arabic.draw_text(c, margin + 12, y - 8, "MONTANT REÇU", font=arabic.LATIN_BOLD, size=8)
    c.setFillColor(RED if cancelled else primary)
    arabic.draw_text(c, W - margin - 12, y - 10, format_fcfa(data["amount"]), font=arabic.LATIN_BOLD, size=19,
                     align="right")
    if cancelled:
        c.setStrokeColor(RED)
        c.setLineWidth(1)
        width = arabic.text_width(format_fcfa(data["amount"]), arabic.LATIN_BOLD, 19)
        c.line(W - margin - 12 - width, y - 4, W - margin - 12, y - 4)
    y -= box_h

    if cancelled:
        y -= 8
        c.setFillColor(RED)
        arabic.draw_text(c, margin, y, "PAIEMENT ANNULÉ", font=arabic.LATIN_BOLD, size=9.5)
        detail = " — ".join(p for p in [data.get("cancel_reason"), data.get("cancelled_info")] if p)
        if detail:
            y -= 12
            arabic.draw_text(c, margin, y, detail, font=arabic.LATIN, size=8, max_width=W - 2 * margin, min_size=5.5)

    # --- signatures ---
    sig_y = 62
    c.setStrokeColor(Color(0.6, 0.6, 0.6))
    c.setLineWidth(0.5)
    half = (W - 2 * margin - 20) / 2
    for i, label in enumerate(("Cachet et signature de l'établissement", "Signature du payeur")):
        x0 = margin + i * (half + 20)
        c.line(x0, sig_y, x0 + half, sig_y)
        c.setFillColor(GREY)
        arabic.draw_text(c, x0 + half / 2, sig_y - 10, label, font=arabic.LATIN, size=7, align="center")

    c.setFillColor(GREY)
    arabic.draw_text(c, W / 2, 26, f"Édité le {data['printed_at']} par {data['printed_by']}", font=arabic.LATIN,
                     size=6.5, align="center", max_width=W - 2 * margin, min_size=5)

    # --- filigrane ANNULÉ ---
    if cancelled:
        c.saveState()
        c.translate(W / 2, H / 2 - 20)
        c.rotate(32)
        c.setFillColor(Color(0.71, 0.14, 0.09, alpha=0.16))
        c.setFont(arabic.LATIN_BOLD, 74)
        c.drawCentredString(0, 0, "ANNULÉ")
        c.restoreState()

    c.showPage()
    c.save()
    return buf.getvalue()
