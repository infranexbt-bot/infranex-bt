#!/usr/bin/env python3
# ---------------------------------------------------------------------------
# GPU Provider Analysis — Operator Brief (Report route)
# Body: ReportLab (Template 07 Crystal Blue body palette, fixed per cover.md)
# Cover: rendered separately via html2poster.js, merged here via pypdf.
# ---------------------------------------------------------------------------
import os, sys, hashlib

BASE = "/home/z/my-project"
PDF_SKILL_DIR = os.path.join(BASE, "skills", "pdf")
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, "scripts"))
sys.path.insert(0, os.path.join(BASE, "scripts"))

import gpu_report_content as C

# ── Fonts (registration FIRST, then fallback install) ───────────────────────
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

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

from pdf import install_font_fallback
install_font_fallback()

# ── Palette: Template 07 Crystal Blue body subset (fixed per cover.md) ──────
from reportlab.lib import colors

PAGE_BG      = colors.HexColor("#f5f8fc")   # XL — ultra-light blue-white
SECTION_BG   = colors.HexColor("#edf2f9")   # XL
CARD_BG      = colors.HexColor("#e4ecf5")   # L  — callout fill
TABLE_STRIPE = colors.HexColor("#eef3fa")   # L  — odd row stripe
HEADER_FILL  = colors.HexColor("#1a4a7a")   # M  — table header / H2 color
BORDER       = colors.HexColor("#c0d0e2")   # S  — grid + rules
ACCENT       = colors.HexColor("#2d7ab3")   # XS — rules, callout box, H1 rule
TEXT_PRIMARY = colors.HexColor("#142840")
TEXT_MUTED   = colors.HexColor("#5a7a96")

# ── Chart (matplotlib, charts.md rules) ─────────────────────────────────────
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

CHART_PNG = os.path.join(BASE, "scripts", "gpu_chart_h100.png")

def make_chart():
    tiers = ["Vast.ai\nunverified floor", "RunPod\nCommunity", "Vast.ai\nverified median",
             "TensorDock", "Lambda\nLabs", "RunPod\nSecure Cloud", "Akash\nbid median"]
    sticker = [1.20, 1.99, 2.16, 2.25, 2.86, 2.89, 3.37]
    uptime  = [0.92, 0.97, 0.97, 0.92, 0.995, 0.995, 0.97]
    effective = [s / u for s, u in zip(sticker, uptime)]

    plt.rcParams["font.sans-serif"] = ["DejaVu Sans"]
    plt.rcParams["axes.unicode_minus"] = False

    fig, ax = plt.subplots(figsize=(7.4, 3.9), dpi=200, constrained_layout=True)
    y = np.arange(len(tiers))
    h = 0.36
    b1 = ax.barh(y - h/2, sticker, height=h, color="#2d7ab3", label="Sticker rate", zorder=3)
    b2 = ax.barh(y + h/2, effective, height=h, color="#1a4a7a", label="Effective rate (uptime-adj.)", zorder=3)
    ax.bar_label(b1, fmt="$%.2f", padding=3, fontsize=8.5, color="#2d7ab3")
    ax.bar_label(b2, fmt="$%.2f", padding=3, fontsize=8.5, color="#1a4a7a")
    ax.set_yticks(y)
    ax.set_yticklabels(tiers, fontsize=8.5, color="#142840")
    ax.invert_yaxis()
    ax.set_xlabel("$ per GPU-hour (H100 class, observed Sep 2026)", fontsize=9.5, color="#142840")
    ax.set_xlim(0, 4.35)
    ax.tick_params(axis="x", labelsize=8.5, colors="#5a7a96")
    ax.tick_params(axis="y", length=0)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color("#c0d0e2")
    ax.grid(axis="x", linestyle="--", linewidth=0.5, alpha=0.2, zorder=0)
    ax.legend(loc="lower center", bbox_to_anchor=(0.5, 1.02), ncol=2,
              frameon=False, fontsize=9)
    fig.savefig(CHART_PNG)  # constrained_layout manages spacing; no tight_layout
    plt.close(fig)

make_chart()

# ── Document scaffolding ────────────────────────────────────────────────────
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak,
                                Table, TableStyle, Image, KeepTogether, CondPageBreak,
                                HRFlowable)
from reportlab.platypus.tableofcontents import TableOfContents
from PIL import Image as PILImage

MARGIN = 0.9 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
H1_ORPHAN = AVAIL_H * 0.25
MAX_KEEP = PAGE_H * 0.4

BODY_PDF = os.path.join(BASE, "scripts", "gpu_report_body.pdf")
COVER_PDF = os.path.join(BASE, "scripts", "gpu_cover.pdf")
FINAL_PDF = os.path.join(BASE, "download", "GPU-Provider-Analysis-Operator-Brief.pdf")

# ── Styles ──────────────────────────────────────────────────────────────────
body = ParagraphStyle("Body", fontName="FreeSerif", fontSize=10.5, leading=17,
                      alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY, spaceAfter=10)
h1 = ParagraphStyle("H1", fontName="FreeSerif", fontSize=19, leading=24,
                    textColor=TEXT_PRIMARY, spaceBefore=18, spaceAfter=4)
h2 = ParagraphStyle("H2", fontName="FreeSerif", fontSize=13.5, leading=18,
                    textColor=HEADER_FILL, spaceBefore=14, spaceAfter=6)
caption = ParagraphStyle("Caption", fontName="FreeSerif", fontSize=8.5, leading=12,
                         alignment=TA_CENTER, textColor=TEXT_MUTED)
toc_title = ParagraphStyle("TOCTitle", fontName="FreeSerif", fontSize=19, leading=24,
                           textColor=TEXT_PRIMARY, spaceAfter=14)
th = ParagraphStyle("TH", fontName="FreeSerif", fontSize=9, leading=12,
                    textColor=colors.white, alignment=TA_CENTER)
td = ParagraphStyle("TD", fontName="FreeSerif", fontSize=9, leading=12,
                    textColor=TEXT_PRIMARY, alignment=TA_LEFT)
td_c = ParagraphStyle("TDC", parent=td, alignment=TA_CENTER)
stat_style = ParagraphStyle("StatBig", fontName="FreeSerif", fontSize=21, leading=25,
                            textColor=ACCENT, alignment=TA_CENTER)
label_style = ParagraphStyle("StatLabel", fontName="FreeSerif", fontSize=8.5, leading=12,
                             textColor=TEXT_MUTED, alignment=TA_CENTER)
step_style = ParagraphStyle("Step", fontName="FreeSerif", fontSize=10.5, leading=17,
                            alignment=TA_LEFT, textColor=TEXT_PRIMARY, spaceAfter=8,
                            leftIndent=16, firstLineIndent=-16)

# ── Doc template with TOC + page furniture ──────────────────────────────────
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            text = getattr(flowable, "bookmark_text", "")
            key = getattr(flowable, "bookmark_key", "")
            # Displayed body numbering = doc.page - 1 (page 1 is the TOC, shown as 'i')
            self.notify("TOCEntry", (level, text, self.page - 1, key))

    def beforePage(self):
        c = self.canv
        c.saveState()
        # Full-bleed page background (Template 07 XL tier)
        c.setFillColor(PAGE_BG)
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        # Header: title left + accent rule
        c.setFont("FreeSerif", 7.5)
        c.setFillColor(TEXT_MUTED)
        c.drawString(MARGIN, PAGE_H - 0.55 * inch, C.TITLE.upper())
        c.setStrokeColor(ACCENT)
        c.setLineWidth(1.2)
        c.line(MARGIN, PAGE_H - 0.62 * inch, PAGE_W - MARGIN, PAGE_H - 0.62 * inch)
        # Footer: light rule + author left + page number right
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.5)
        c.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
        c.setFont("FreeSerif", 7.5)
        c.setFillColor(TEXT_MUTED)
        c.drawString(MARGIN, 0.45 * inch, "Infranex Compute Research")
        page_label = "i" if self.page == 1 else str(self.page - 1)
        c.drawRightString(PAGE_W - MARGIN, 0.45 * inch, page_label)
        c.restoreState()

def add_heading(text, style, level=0):
    key = "h_" + hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/><b>%s</b>' % (key, text), style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def h1_block(text, first_para=None, level=0):
    """H1 + accent underline + optional first paragraph, orphan-protected."""
    items = [add_heading(text, h1, level=level),
             HRFlowable(width="100%", thickness=1.2, color=ACCENT,
                        spaceBefore=0, spaceAfter=10)]
    if first_para is not None:
        items.append(first_para)
    return [CondPageBreak(H1_ORPHAN), KeepTogether(items)]

def safe_keep_together(elements):
    total_h = 0
    for el in elements:
        w, hgt = el.wrap(AVAIL_W, PAGE_H)
        total_h += hgt
    if total_h <= MAX_KEEP:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)

def styled_table(header, rows, ratios, center_cols=None):
    """Standard table: HEADER_FILL header, TABLE_STRIPE odd rows, all Paragraph cells."""
    assert abs(sum(ratios) - 1.0) < 0.01, "ratios must sum to 1"
    col_widths = [r * AVAIL_W * 0.98 for r in ratios]
    assert sum(col_widths) <= AVAIL_W + 0.5
    center_cols = center_cols or set()
    data = [[Paragraph("<b>%s</b>" % cell, th) for cell in header]]
    for row in rows:
        line = []
        for j, cell in enumerate(row):
            st = td_c if j in center_cols else td
            line.append(Paragraph(str(cell), st))
        data.append(line)
    t = Table(data, colWidths=col_widths, hAlign="CENTER", repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_FILL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        style.append(("BACKGROUND", (0, i), (-1, i),
                      TABLE_STRIPE if i % 2 == 1 else colors.white))
    t.setStyle(TableStyle(style))
    return t

def callout(stat, label, width=300):
    box = Table([[Paragraph("<b>%s</b>" % stat, stat_style)],
                 [Paragraph(label, label_style)]], colWidths=[width])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("BOX", (0, 0), (-1, -1), 1, ACCENT),
        ("TOPPADDING", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
        ("TOPPADDING", (0, 1), (-1, 1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    box.hAlign = "CENTER"
    return box

def embed_image(path, max_width, max_height=PAGE_H * 0.35):
    pil = PILImage.open(path)
    ow, oh = pil.size
    ratio = min(max_width / ow if ow > max_width else 1.0,
                max_height / oh if oh > max_height else 1.0)
    return Image(path, width=ow * ratio, height=oh * ratio)

def table_block(title_caption, tbl):
    return [Spacer(1, 8)] + safe_keep_together([tbl, Spacer(1, 6),
            Paragraph(title_caption, caption)]) + [Spacer(1, 14)]

# ── Story ───────────────────────────────────────────────────────────────────
story = []

# TOC (front matter, displayed as page i)
story.append(Paragraph("<b>Table of Contents</b>", toc_title))
story.append(HRFlowable(width="100%", thickness=1.2, color=ACCENT, spaceAfter=14))
toc = TableOfContents()
toc.levelStyles = [
    ParagraphStyle("TOC0", fontName="FreeSerif", fontSize=11.5, leading=20,
                   leftIndent=6, textColor=TEXT_PRIMARY),
    ParagraphStyle("TOC1", fontName="FreeSerif", fontSize=10, leading=16,
                   leftIndent=26, textColor=TEXT_MUTED),
]
story.append(toc)
story.append(PageBreak())

# Chapter 1 — Verdict Up Front
story += h1_block("1. " + C.CH1_TITLE, Paragraph(C.CH1_P1, body))
story += table_block(C.CH1_TABLE_CAPTION,
                     styled_table(C.CH1_TABLE_HEADER, C.CH1_TABLE_ROWS,
                                  [0.045, 0.185, 0.095, 0.115, 0.28, 0.28],
                                  center_cols={0, 2, 3}))
story.append(Spacer(1, 4))
story.append(callout(C.CH1_CALLOUT_STAT, C.CH1_CALLOUT_LABEL, width=340))
story.append(Spacer(1, 10))
story.append(Paragraph(C.CH1_P2, body))

# Chapter 2 — Scope, Method and Data Sources
story += h1_block("2. " + C.CH2_TITLE, Paragraph(C.CH2_P1, body))
story.append(Paragraph(C.CH2_P2, body))

# Chapter 3 — Provider-by-Provider Review
story += h1_block("3. " + C.CH3_TITLE, Paragraph(C.CH3_INTRO, body))
for sub_title, sub_body in [
    (C.CH3_S1_TITLE, C.CH3_S1), (C.CH3_S2_TITLE, C.CH3_S2),
    (C.CH3_S3_TITLE, C.CH3_S3), (C.CH3_S4_TITLE, C.CH3_S4),
    (C.CH3_S5_TITLE, C.CH3_S5),
]:
    story += safe_keep_together([add_heading("3." if False else sub_title, h2, level=1),
                                 Paragraph(sub_body, body)])

# Chapter 4 — Runtime and Reliability
story += h1_block("4. " + C.CH4_TITLE, Paragraph(C.CH4_P1, body))
story += table_block(C.CH4_TABLE_CAPTION,
                     styled_table(C.CH4_TABLE_HEADER, C.CH4_TABLE_ROWS,
                                  [0.21, 0.10, 0.12, 0.11, 0.46],
                                  center_cols={1, 2, 3}))
story.append(Spacer(1, 10))
story.append(Paragraph(C.CH4_P2, body))
story.append(Spacer(1, 14))
chart_img = embed_image(CHART_PNG, max_width=AVAIL_W * 0.96)
story += safe_keep_together([chart_img, Spacer(1, 8),
                             Paragraph(C.CH4_CHART_CAPTION, caption)])
story.append(Spacer(1, 14))
story.append(callout(C.CH4_CALLOUT_STAT, C.CH4_CALLOUT_LABEL, width=340))

# Chapter 5 — Top GPU Performers
story += h1_block("5. " + C.CH5_TITLE, Paragraph(C.CH5_P1, body))
story += table_block(C.CH5_TABLE_CAPTION,
                     styled_table(C.CH5_TABLE_HEADER, C.CH5_TABLE_ROWS,
                                  [0.06, 0.10, 0.08, 0.12, 0.22, 0.42],
                                  center_cols={0, 2, 3}))
story.append(Paragraph(C.CH5_P2, body))

# Chapter 6 — Provider Fit for Subnet Mining
story += h1_block("6. " + C.CH6_TITLE, Paragraph(C.CH6_P1, body))
story += table_block(C.CH6_TABLE_CAPTION,
                     styled_table(C.CH6_TABLE_HEADER, C.CH6_TABLE_ROWS,
                                  [0.155, 0.21, 0.115, 0.115, 0.405],
                                  center_cols={2, 3}))
story.append(Paragraph(C.CH6_P2, body))

# Chapter 7 — Operator Action Checklist
story += h1_block("7. " + C.CH7_TITLE, Paragraph(C.CH7_INTRO, body))
for i, (step, detail) in enumerate(C.CH7_STEPS, 1):
    story.append(Paragraph("<b>%d. %s</b> %s" % (i, step, detail), step_style))
story.append(Spacer(1, 6))
story.append(Paragraph(C.CH7_CLOSE, body))

# Chapter 8 — Limitations and Sources
story += h1_block("8. " + C.CH8_TITLE, Paragraph(C.CH8_P1, body))
story.append(Paragraph(C.CH8_P2, body))

# ── Build body ──────────────────────────────────────────────────────────────
doc = TocDocTemplate(
    BODY_PDF, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=MARGIN, bottomMargin=MARGIN,
    title=C.TITLE, author="Z.ai", creator="Z.ai", subject=C.SUBJECT,
)
doc.multiBuild(story)
print("body built:", BODY_PDF)

# ── Merge cover + body → single final PDF ───────────────────────────────────
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize_page_to_a4(page):
    box = page.mediabox
    w, hh = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.1 or abs(hh - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page

writer = PdfWriter()
writer.add_page(normalize_page_to_a4(PdfReader(COVER_PDF).pages[0]))
for page in PdfReader(BODY_PDF).pages:
    writer.add_page(normalize_page_to_a4(page))
writer.add_metadata({
    "/Title": C.TITLE,
    "/Author": "Z.ai",
    "/Creator": "Z.ai",
    "/Subject": C.SUBJECT,
})
os.makedirs(os.path.dirname(FINAL_PDF), exist_ok=True)
with open(FINAL_PDF, "wb") as f:
    writer.write(f)
print("final:", FINAL_PDF)
