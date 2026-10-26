#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate-dc-plan.py — Owned GPU Data Centre business plan (Report route).

Pipeline: ReportLab body (TOC + 12 chapters, charts) -> merge HTML/Playwright
cover (Template 07 Crystal Blue, rendered separately via html2poster.js) ->
single A4 PDF. Palette: Template 07 fixed body palette (see typesetting/cover.md).
"""
import os
import sys
import hashlib

PROJ = "/home/z/my-project"
SKILL_SCRIPTS = os.path.join(PROJ, "skills/pdf/scripts")
sys.path.insert(0, SKILL_SCRIPTS)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJ + "/scripts")

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily, stringWidth
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak,
                                Table, TableStyle, Image, KeepTogether, CondPageBreak,
                                HRFlowable)
from reportlab.platypus.tableofcontents import TableOfContents

import dc_plan_data as D

# ---------------------------------------------------------------- fonts
FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif", f"{FONT_DIR}/truetype/freefont/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Bold", f"{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Italic", f"{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-BoldItalic", f"{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSans", f"{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf"))
registerFontFamily("NotoSerifSC", normal="NotoSerifSC", bold="NotoSerifSC-Bold")
registerFontFamily("FreeSerif", normal="FreeSerif", bold="FreeSerif-Bold",
                   italic="FreeSerif-Italic", boldItalic="FreeSerif-BoldItalic")
registerFontFamily("DejaVuSans", normal="DejaVuSans", bold="DejaVuSans")

from pdf import install_font_fallback  # noqa: E402
install_font_fallback()

# ------------------------------------------- Template 07 fixed body palette
PAGE_BG = colors.HexColor("#f5f8fc")
SECTION_BG = colors.HexColor("#edf2f9")
CARD_BG = colors.HexColor("#e4ecf5")
TABLE_STRIPE = colors.HexColor("#eef3fa")
HEADER_FILL = colors.HexColor("#1a4a7a")
BORDER = colors.HexColor("#c0d0e2")
ACCENT = colors.HexColor("#2d7ab3")
TEXT_PRIMARY = colors.HexColor("#142840")
TEXT_MUTED = colors.HexColor("#5a7a96")

# ---------------------------------------------------------------- geometry
MARGIN = 0.9 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
H1_ORPHAN = AVAIL_H * 0.25
MAX_KEEP = PAGE_H * 0.4

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dc-plan-assets")
BODY_PDF = os.path.join(ASSETS, "body.pdf")
COVER_PDF = os.path.join(ASSETS, "cover.pdf")
FINAL_PDF = os.path.join(PROJ, "download", "owned-gpu-datacentre-business-plan.pdf")
DOC_TITLE = "Owned GPU Data Centre on Bittensor & Compute Markets - Business Plan"

# ---------------------------------------------------------------- styles
S = {}
S["body"] = ParagraphStyle("Body", fontName="FreeSerif", fontSize=10.5, leading=17,
                           alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY,
                           spaceBefore=0, spaceAfter=10)
S["h1"] = ParagraphStyle("H1", fontName="FreeSerif", fontSize=20, leading=26,
                         alignment=TA_LEFT, textColor=HEADER_FILL,
                         spaceBefore=6, spaceAfter=2)
S["h2"] = ParagraphStyle("H2", fontName="FreeSerif", fontSize=14, leading=19,
                         textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=6)
S["caption"] = ParagraphStyle("Caption", fontName="FreeSerif", fontSize=8.5, leading=12,
                              alignment=TA_CENTER, textColor=TEXT_MUTED,
                              spaceBefore=3, spaceAfter=6)
S["note"] = ParagraphStyle("Note", fontName="FreeSerif-Italic", fontSize=9, leading=13.5,
                           alignment=TA_LEFT, textColor=TEXT_MUTED, spaceBefore=0, spaceAfter=0)
S["toc_title"] = ParagraphStyle("TocTitle", fontName="FreeSerif", fontSize=20, leading=26,
                                textColor=HEADER_FILL, spaceAfter=14)
S["stat_big"] = ParagraphStyle("StatBig", fontName="FreeSerif", fontSize=20, leading=24,
                               textColor=ACCENT, alignment=TA_CENTER)
S["stat_label"] = ParagraphStyle("StatLabel", fontName="FreeSerif", fontSize=8.5, leading=11.5,
                                 textColor=TEXT_MUTED, alignment=TA_CENTER)


def cell_style(size, bold=False, white=False, center=True):
    return ParagraphStyle(
        f"c{size}{bold}{white}{center}",
        fontName="FreeSerif", fontSize=size, leading=size * 1.3,
        alignment=TA_CENTER if center else TA_LEFT,
        textColor=colors.white if white else TEXT_PRIMARY)


# ---------------------------------------------------------------- helpers
def add_heading(text, style, level=0):
    key = "h_%s" % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/><b>%s</b>' % (key, text), style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p


def safe_keep_together(elements):
    total_h = 0
    for el in elements:
        w, h = el.wrap(AVAIL_W, PAGE_H)
        total_h += h
    if total_h <= MAX_KEEP:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)


def make_table(data, ratios, font_size=8.5, header_size=8.5, left_cols=()):
    """Palette-compliant table: Paragraph cells, proportional widths, centered."""
    assert abs(sum(ratios) - 1.0) < 0.02, "ratios must sum to 1"
    col_widths = [r * AVAIL_W * 0.99 for r in ratios]
    assert len(col_widths) == len(data[0]), \
        "colWidths (%d) != columns (%d)" % (len(col_widths), len(data[0]))
    assert sum(col_widths) <= AVAIL_W + 0.5
    head = cell_style(header_size, bold=True, white=True)
    wrapped = []
    for ri, row in enumerate(data):
        out = []
        for ci, cell in enumerate(row):
            if ri == 0:
                out.append(Paragraph("<b>%s</b>" % cell, head))
            else:
                st = cell_style(font_size, center=ci not in left_cols)
                out.append(Paragraph(str(cell), st))
        wrapped.append(out)
    t = Table(wrapped, colWidths=col_widths, hAlign="CENTER", repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_FILL),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for ri in range(1, len(data)):
        style.append(("BACKGROUND", (0, ri), (-1, ri),
                      colors.white if ri % 2 == 1 else TABLE_STRIPE))
    t.setStyle(TableStyle(style))
    return t


def note_box(text):
    inner = Paragraph(text, S["note"])
    t = Table([[inner]], colWidths=[AVAIL_W * 0.99], hAlign="CENTER")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 3, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def callout_row(stats):
    cells = []
    for big, label in stats:
        inner = Table(
            [[Paragraph("<b>%s</b>" % big, S["stat_big"])],
             [Paragraph(label, S["stat_label"])]],
            colWidths=[AVAIL_W * 0.30])
        inner.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
            ("BOX", (0, 0), (-1, -1), 1, ACCENT),
            ("TOPPADDING", (0, 0), (-1, 0), 9),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 9),
            ("TOPPADDING", (0, -1), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        cells.append(inner)
    row = Table([cells], colWidths=[AVAIL_W / 3.0] * 3, hAlign="CENTER")
    row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return row


def embed_image(path, max_width=None, max_height=None):
    from PIL import Image as PILImage
    if max_width is None:
        max_width = AVAIL_W
    if max_height is None:
        max_height = A4[1] * 0.35
    pil = PILImage.open(path)
    ow, oh = pil.size
    ratio = min(max_width / ow if ow > max_width else 1.0,
                max_height / oh if oh > max_height else 1.0)
    return Image(path, width=ow * ratio, height=oh * ratio)


# ---------------------------------------------------------------- charts
def build_payback_chart(path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    C_A, C_B, C_C, C_MUTED = "#2d7ab3", "#1a4a7a", "#7fb0d4", "#5a7a96"
    months = list(range(0, 61))
    fig, ax = plt.subplots(figsize=(7.4, 3.5), dpi=200, constrained_layout=True)
    crossings = {}
    for key, color, label in (("A", C_A, "Rig A (2x 5090)"),
                              ("B", C_B, "Rig B (4x 5090)"),
                              ("C", C_C, "Rig C (2x PRO 6000)")):
        m = D.METRICS[key]
        base_net = m["net"]["base"]
        cum = [-m["capex"] + base_net * x for x in months]
        ax.plot(months, [v / 1000.0 for v in cum], color=color, lw=2.2, label=label,
                solid_capstyle="round")
        for i in range(1, len(months)):
            if cum[i - 1] < 0 <= cum[i]:
                xc = i - 1 + (-cum[i - 1]) / (cum[i] - cum[i - 1])
                crossings[key] = xc
                ax.plot([xc], [0], "o", color=color, ms=6, mec="white", mew=1.2, zorder=5)
                dy, dx = {"A": (9, 5), "B": (-17, 5), "C": (12, 7)}[key]
                ax.annotate("%.0f mo" % xc, (xc, 0), textcoords="offset points",
                            xytext=(dx, dy), fontsize=9, color=color, fontweight="bold")
    ax.axhline(0, color=C_MUTED, lw=0.8, ls="--", alpha=0.5)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#c0d0e2")
    ax.spines["bottom"].set_color("#c0d0e2")
    ax.grid(True, ls="--", alpha=0.2, lw=0.5)
    ax.set_xlabel("Month", fontsize=10, color="#142840")
    ax.set_ylabel("Cumulative net cash ($k)", fontsize=10, color="#142840")
    ax.tick_params(colors="#5a7a96", labelsize=9)
    ax.legend(loc="lower right", frameon=False, fontsize=9)
    fig.savefig(path)
    plt.close(fig)


def build_profit_chart(path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    C_A, C_B, C_C = "#2d7ab3", "#1a4a7a", "#7fb0d4"
    utils = [0.20, 0.35, 0.50, 0.75]
    bar_w = 0.24
    x = np.arange(len(utils))
    fig, ax = plt.subplots(figsize=(7.4, 3.4), dpi=200, constrained_layout=True)

    def series(key, color, offset):
        vals = []
        for u in utils:
            r = D.RIGS[key]
            ask = D.ASK[r["gpu_class"]]
            host = ask * D.SHARE_BLEND * u * D.HOURS * r["gpus_n"]
            mine = D.MINING[r["gpu_class"]]["base"] * r["gpus_n"]
            kwh = r["wall_kw"] * D.HOURS
            vals.append((host + mine - kwh * D.ELEC - D.OTHER_OPEX) / 1000.0)
        bars = ax.bar(x + offset, vals, bar_w, color=color, edgecolor="none", label=None)
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v + 0.04, "%.1f" % v,
                    ha="center", va="bottom", fontsize=8, color="#5a7a96")
        return bars

    series("A", C_A, -bar_w)
    series("B", C_B, 0.0)
    series("C", C_C, bar_w)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color("#c0d0e2")
    ax.spines["bottom"].set_color("#c0d0e2")
    ax.grid(True, axis="y", ls="--", alpha=0.2, lw=0.5)
    ax.set_xticks(x)
    ax.set_xticklabels(["20% util", "35% util", "50% util (base)", "75% util"], fontsize=9,
                       color="#142840")
    ax.set_ylabel("Monthly net profit ($k)", fontsize=10, color="#142840")
    ax.tick_params(colors="#5a7a96", labelsize=9)
    import matplotlib.patches as mpatches
    ax.legend(handles=[mpatches.Patch(color=C_A, label="Rig A (2x 5090)"),
                       mpatches.Patch(color=C_B, label="Rig B (4x 5090)"),
                       mpatches.Patch(color=C_C, label="Rig C (2x PRO 6000)")],
              loc="upper left", bbox_to_anchor=(0, 1.14), ncol=3, frameon=False, fontsize=9)
    fig.savefig(path)
    plt.close(fig)


# ---------------------------------------------------------------- doc template
TOC_PAGES = 1  # verified after build; footer switches roman->arabic after this


class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            text = getattr(flowable, "bookmark_text", "")
            key = getattr(flowable, "bookmark_key", "")
            # body-relative page number (TOC is front matter, footer resets to 1)
            self.notify("TOCEntry", (level, text, self.page - TOC_PAGES, key))


def on_page(canvas, doc):
    canvas.saveState()
    # header: doc title + accent rule
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - MARGIN + 18, DOC_TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - MARGIN + 12, PAGE_W - MARGIN, PAGE_H - MARGIN + 12)
    # footer: author left, page number right, light rule above
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, MARGIN - 14, PAGE_W - MARGIN, MARGIN - 14)
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, MARGIN - 26, "Infranex BT - October 2026")
    roman = {1: "i", 2: "ii", 3: "iii"}
    if doc.page <= TOC_PAGES:
        num = roman.get(doc.page, "i")
    else:
        num = str(doc.page - TOC_PAGES)
    canvas.drawRightString(PAGE_W - MARGIN, MARGIN - 26, num)
    canvas.restoreState()


# ---------------------------------------------------------------- story
def chapter_story(idx, ch):
    parts = []
    title = "%d. %s" % (idx, ch["title"])
    head = add_heading(title, S["h1"], level=0)
    rule = HRFlowable(width="100%", thickness=1.2, color=ACCENT,
                      spaceBefore=2, spaceAfter=10)
    first_para = Paragraph(ch["paras"][0], S["body"])
    parts.append(CondPageBreak(H1_ORPHAN))
    parts.extend(safe_keep_together([head, rule, first_para]))
    for p in ch["paras"][1:]:
        parts.append(Paragraph(p, S["body"]))
    if ch.get("callouts"):
        parts.append(Spacer(1, 8))
        parts.append(callout_row(ch["callouts"]))
        parts.append(Spacer(1, 12))
    if ch.get("table") is not None or idx == 6:
        tbl = ch["table"]
        if idx == 6:
            tbl = build_scenario_table()
        ratios = table_ratios(idx, tbl)
        fs = 8.0 if idx == 6 or len(tbl[0]) >= 7 else 8.5
        t = make_table(tbl, ratios, font_size=fs, header_size=fs + 0.5,
                       left_cols={1} if idx == 12 else set())
        parts.append(Spacer(1, 12))
        if len(tbl) <= 15:
            parts.extend(safe_keep_together([t, Paragraph(ch["table_caption"], S["caption"])]))
        else:
            parts.append(t)
            parts.append(Paragraph(ch["table_caption"], S["caption"]))
        parts.append(Spacer(1, 8))
    if ch.get("note"):
        parts.append(note_box(ch["note"]))
        parts.append(Spacer(1, 8))
    if ch.get("table2") is not None:
        ratios2 = table_ratios(idx, ch["table2"], second=True)
        t2 = make_table(ch["table2"], ratios2, font_size=8.5, header_size=9)
        parts.append(Spacer(1, 10))
        parts.extend(safe_keep_together([t2, Paragraph(ch["table2_caption"], S["caption"])]))
        parts.append(Spacer(1, 8))
    if ch.get("chart"):
        png = os.path.join(ASSETS, ch["chart"] + ".png")
        img = embed_image(png, max_width=AVAIL_W * 0.98, max_height=300)
        cap = Paragraph(ch["chart_caption"], S["caption"])
        parts.append(Spacer(1, 16))
        parts.extend(safe_keep_together([img, cap]))
        parts.append(Spacer(1, 12))
    if ch.get("chart2"):
        png2 = os.path.join(ASSETS, ch["chart2"] + ".png")
        img2 = embed_image(png2, max_width=AVAIL_W * 0.98, max_height=300)
        cap2 = Paragraph(ch["chart2_caption"], S["caption"])
        parts.append(Spacer(1, 18))
        parts.extend(safe_keep_together([img2, cap2]))
        parts.append(Spacer(1, 12))
    return parts


def table_ratios(ch, tbl, second=False):
    """Chapter-number-based dispatch (ch = 1..12). len(ratios) MUST equal cols."""
    n = len(tbl[0])
    if ch == 2:
        return [0.30, 0.20, 0.20, 0.30]                    # Lium snapshot (4)
    if ch == 3 and not second:
        return [0.19, 0.27, 0.27, 0.27]                    # rig spec (4)
    if ch == 4 and not second:
        return [0.15, 0.23, 0.14, 0.15, 0.14, 0.19]        # mining candidates (6)
    if ch == 4 and second:
        return [0.14, 0.16, 0.28, 0.26, 0.16]              # platform comparison (5)
    if ch == 5:
        return [0.12, 0.28, 0.37, 0.23]                    # decision ladder (4)
    if ch == 6:
        return [0.14] + [0.1075] * 8                       # scenario economics (9)
    if ch == 7:
        return [0.13, 0.11, 0.47, 0.29]                    # phases (4)
    if ch == 8:
        return [0.16, 0.19, 0.22, 0.13, 0.30]              # sensitivity (5)
    if ch == 9:
        return [0.16, 0.10, 0.09, 0.65]                    # risk register (4)
    if ch == 10 and not second:
        return [0.20, 0.44, 0.36]                          # procurement (3)
    if ch == 10 and second:
        return [0.20, 0.40, 0.40]                          # deltas (3)
    if ch == 11:
        return [0.22, 0.40, 0.38]                          # integration (3)
    if ch == 12:
        return [0.07, 0.93]                                # sources (2)
    return [1.0 / n] * n


def build_scenario_table():
    hdr = ["Scenario", "Host $/card", "Mine $/card",
           "Rig A net", "Rig A payback", "Rig B net", "Rig B payback",
           "Rig C net", "Rig C payback"]
    rows = [hdr]
    for s in ("cons", "base", "opt"):
        a, b, c = D.METRICS["A"], D.METRICS["B"], D.METRICS["C"]
        rows.append([
            D.SCEN_LABEL[s],
            "$%d" % round(a["host_card"][s]),
            "$%d" % D.MINING["5090"][s],
            "$%d" % round(a["net"][s]),
            "%.1f mo" % a["payback"][s],
            "$%d" % round(b["net"][s]),
            "%.1f mo" % b["payback"][s],
            "$%d" % round(c["net"][s]),
            "%.1f mo" % c["payback"][s],
        ])
    return rows


def main():
    build_payback_chart(os.path.join(ASSETS, "payback.png"))
    build_profit_chart(os.path.join(ASSETS, "profit.png"))

    doc = TocDocTemplate(
        BODY_PDF, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN,
        title=DOC_TITLE, author="Z.ai", creator="Z.ai",
        subject="Business plan: owned Blackwell GPU rig with dual-stream hosting + subnet mining revenue")

    story = []
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle("TOC0", fontName="FreeSerif", fontSize=11, leading=18,
                       leftIndent=6, textColor=TEXT_PRIMARY),
    ]
    story.append(Paragraph("<b>Table of Contents</b>", S["toc_title"]))
    story.append(HRFlowable(width="100%", thickness=1.2, color=ACCENT, spaceBefore=0, spaceAfter=12))
    story.append(toc)
    story.append(PageBreak())

    chapters = [D.CH1, D.CH2, D.CH3, D.CH4, D.CH5, D.CH6,
                D.CH7, D.CH8, D.CH9, D.CH10, D.CH11, D.CH12]
    for i, ch in enumerate(chapters, start=1):
        story.extend(chapter_story(i, ch))

    doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)
    print("body built:", BODY_PDF)

    # merge cover as page 0
    from pypdf import PdfReader, PdfWriter
    A4_W, A4_H = 595.28, 841.89

    def normalize(page):
        w, h = float(page.mediabox.width), float(page.mediabox.height)
        if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
            page.scale_to(A4_W, A4_H)
        return page

    writer = PdfWriter()
    writer.add_page(normalize(PdfReader(COVER_PDF).pages[0]))
    body = PdfReader(BODY_PDF)
    for pg in body.pages:
        writer.add_page(normalize(pg))
    writer.add_metadata({
        "/Title": DOC_TITLE, "/Author": "Z.ai", "/Creator": "Z.ai",
        "/Subject": "Business plan: owned Blackwell GPU rig with dual-stream hosting + subnet mining revenue",
    })
    os.makedirs(os.path.dirname(FINAL_PDF), exist_ok=True)
    with open(FINAL_PDF, "wb") as f:
        writer.write(f)
    print("final:", FINAL_PDF, "| body pages:", len(body.pages))


if __name__ == "__main__":
    main()
