"""Rapport financier PDF (A4 portrait) : synthèse, répartition, évolution mensuelle, impayés."""
from __future__ import annotations

import io

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from . import arabic
from .common import draw_letterhead, format_date, format_fcfa, hex_color

MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre",
             "novembre", "décembre"]


def _month_label(key: str) -> str:
    y, m = key.split("-")
    return f"{MONTHS_FR[int(m) - 1].capitalize()} {y}"


def _para(text, base: ParagraphStyle) -> Paragraph:
    """Paragraphe sûr pour l'arabe : texte remis en ordre visuel + police Amiri si besoin."""
    text = str(text or "")
    style = base
    if arabic.has_arabic(text):
        style = ParagraphStyle(base.name + "Ar", parent=base, fontName=arabic.AR_BOLD if "Bold" in base.fontName or "Semi" in base.fontName else arabic.AR)
    safe = arabic.shape(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(safe, style)


class _Doc(SimpleDocTemplate):
    pass


def render_finance_report(data: dict, establishment, printed_by: str, printed_at: str) -> bytes:
    arabic.register_fonts()
    primary = hex_color(establishment.primary_color, "#114232")
    accent = hex_color(establishment.accent_color, "#C5A059")
    W, H = A4
    margin = 18 * mm
    head_h = 128  # hauteur réservée à l'en-tête de la première page (points)

    base = ParagraphStyle("base", fontName=arabic.LATIN, fontSize=8.5, leading=11, textColor=colors.HexColor("#1b1b1b"))
    bold = ParagraphStyle("bold", parent=base, fontName=arabic.LATIN_BOLD)
    right = ParagraphStyle("right", parent=base, alignment=TA_RIGHT)
    right_bold = ParagraphStyle("rightb", parent=right, fontName=arabic.LATIN_BOLD)
    h1 = ParagraphStyle("h1", parent=bold, fontSize=15, leading=19, textColor=primary)
    h2 = ParagraphStyle("h2", parent=bold, fontSize=10.5, leading=14, textColor=primary, spaceBefore=10, spaceAfter=4)
    small = ParagraphStyle("small", parent=base, fontSize=7.5, leading=10, textColor=colors.HexColor("#666666"))

    def header_footer(c: canvas.Canvas, doc):
        c.saveState()
        if doc.page == 1:
            draw_letterhead(c, establishment, W, H - 24, logo_h=52, margin=margin)
        else:
            c.setFillColor(primary)
            arabic.draw_text(c, margin, H - 30, establishment.name, font=arabic.LATIN_BOLD, size=9)
            c.setStrokeColor(accent)
            c.setLineWidth(0.8)
            c.line(margin, H - 36, W - margin, H - 36)
        c.setFillColor(colors.HexColor("#777777"))
        arabic.draw_text(c, margin, 20, f"Édité le {printed_at} par {printed_by}", font=arabic.LATIN, size=6.5)
        arabic.draw_text(c, W - margin, 20, f"Page {doc.page}", font=arabic.LATIN, size=6.5, align="right")
        c.restoreState()

    def table(rows, widths, header=True, align_right_from=1, total_row=False):
        t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
        style = [
            ("FONTNAME", (0, 0), (-1, -1), arabic.LATIN), ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, colors.HexColor("#DDDDDD")),
            ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ]
        if header:
            style += [("BACKGROUND", (0, 0), (-1, 0), primary), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                      ("FONTNAME", (0, 0), (-1, 0), arabic.LATIN_BOLD)]
        if total_row:
            style += [("FONTNAME", (0, -1), (-1, -1), arabic.LATIN_BOLD),
                      ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F4EFE3"))]
        t.setStyle(TableStyle(style))
        return t

    def money_table(title, rows, label_header):
        """Tableau Libellé | Nb | Montant."""
        body = [[label_header, "Nombre", "Montant"]] + [[l, str(n), format_fcfa(t)] for l, t, n in rows]
        t = table(body, [95 * mm, 25 * mm, 54 * mm])
        t.setStyle(TableStyle([("ALIGN", (1, 0), (-1, -1), "RIGHT")]))
        return KeepTogether([Paragraph(title, h2), t])

    story = [Spacer(1, head_h - 18)]
    period = f"du {format_date(data['date_from'])} au {format_date(data['date_to'])}"
    story += [Paragraph("RAPPORT FINANCIER", h1), Paragraph(f"Période : {period}", base), Spacer(1, 6)]

    # --- synthèse ---
    summary = [
        ["Recettes — paiements des familles", format_fcfa(data["payments_total"])],
        ["Recettes — dons", format_fcfa(data["donations_total"])],
        ["TOTAL DES RECETTES", format_fcfa(data["revenue_total"])],
        ["Dépenses validées", format_fcfa(data["expenses_total"])],
        ["SOLDE (recettes - dépenses)", format_fcfa(data["balance"])],
    ]
    t = table(summary, [110 * mm, 64 * mm], header=False)
    t.setStyle(TableStyle([("ALIGN", (1, 0), (1, -1), "RIGHT"), ("FONTNAME", (0, 2), (-1, 2), arabic.LATIN_BOLD),
                           ("FONTNAME", (0, 4), (-1, 4), arabic.LATIN_BOLD),
                           ("BACKGROUND", (0, 4), (-1, 4), colors.HexColor("#F4EFE3")),
                           ("TEXTCOLOR", (1, 4), (1, 4), colors.HexColor("#B42318") if data["balance"] < 0 else primary)]))
    story += [Paragraph("Synthèse", h2), t]
    notes = []
    if data["cancelled_payments_count"]:
        notes.append(f"{data['cancelled_payments_count']} paiement(s) annulé(s) sur la période : exclus des recettes.")
    if data["pending_expenses_count"]:
        notes.append(f"{data['pending_expenses_count']} dépense(s) en attente de validation : non comptées.")
    for n in notes:
        story.append(Paragraph(n, small))

    # --- répartition ---
    if data["by_kind"]:
        story.append(money_table("Répartition des paiements par nature", data["by_kind"], "Nature"))
    if data["by_method"]:
        story.append(money_table("Répartition des paiements par mode", data["by_method"], "Mode de paiement"))
    if data["by_category"]:
        story.append(money_table("Dépenses validées par catégorie", data["by_category"], "Catégorie"))

    # --- évolution mensuelle ---
    if data["months"]:
        rows = [["Mois", "Recettes", "Dépenses", "Solde"]]
        for key, rec, dep in data["months"]:
            rows.append([_month_label(key), format_fcfa(rec), format_fcfa(dep), format_fcfa(rec - dep)])
        t = table(rows, [54 * mm, 40 * mm, 40 * mm, 40 * mm])
        t.setStyle(TableStyle([("ALIGN", (1, 0), (-1, -1), "RIGHT")]))
        story += [KeepTogether([Paragraph("Évolution mensuelle", h2), t])]

    # --- impayés ---
    story.append(Paragraph("Impayés (échéances échues non soldées)", h2))
    story.append(Paragraph(
        f"{data['unpaid_count']} échéance(s) impayée(s) pour {data['unpaid_students']} talibé(s) — "
        f"total restant dû : <b>{format_fcfa(data['unpaid_total'])}</b> (au {format_date(data['date_to'])}).", base))
    if data["unpaid"]:
        rows = [["Talibé", "Matricule", "Échéances", "Plus ancienne", "Restant dû"]]
        for r in data["unpaid"]:
            rows.append([_para(r["student"], base), r["registration_number"], str(r["count"]),
                         format_date(r["oldest"]), format_fcfa(r["remaining"])])
        t = table(rows, [62 * mm, 30 * mm, 20 * mm, 28 * mm, 34 * mm])
        t.setStyle(TableStyle([("ALIGN", (2, 0), (-1, -1), "RIGHT")]))
        story += [Spacer(1, 4), t]
        if data["unpaid_truncated"]:
            story.append(Paragraph(f"Liste limitée aux {len(data['unpaid'])} plus gros restants dus.", small))

    buf = io.BytesIO()
    doc = _Doc(buf, pagesize=A4, leftMargin=margin, rightMargin=margin, topMargin=46, bottomMargin=34,
               title="Rapport financier", author=establishment.name, subject="Rapport financier")
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    return buf.getvalue()
