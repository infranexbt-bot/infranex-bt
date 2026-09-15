#!/usr/bin/env python3
# GEN HANDBOOK PDF — Infranex BT Operator Handbook (Report route, ReportLab body + Playwright cover)
# Pipeline per pdf skill briefs/report.md:
#   body: TocDocTemplate + multiBuild (clickable TOC)  ->  merge cover via pypdf  ->  QA chain
import os, sys, hashlib

SKILL_SCRIPTS = "/home/z/my-project/skills/pdf/scripts"
if SKILL_SCRIPTS not in sys.path:
    sys.path.insert(0, SKILL_SCRIPTS)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak,
                                Table, TableStyle, KeepTogether, CondPageBreak, Flowable)
from reportlab.platypus.tableofcontents import TableOfContents

from handbook_content import CONTENT

# ---------------------------------------------------------------- fonts
FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Noto Sans SC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Noto Sans SC Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("SarasaMonoSC", f"{FONT_DIR}/truetype/chinese/SarasaMonoSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif", f"{FONT_DIR}/truetype/freefont/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Bold", f"{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Italic", f"{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-BoldItalic", f"{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSans", f"{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf"))

registerFontFamily("NotoSerifSC", normal="NotoSerifSC", bold="NotoSerifSC-Bold")
registerFontFamily("Noto Sans SC", normal="Noto Sans SC", bold="Noto Sans SC Bold")
registerFontFamily("FreeSerif", normal="FreeSerif", bold="FreeSerif-Bold",
                   italic="FreeSerif-Italic", boldItalic="FreeSerif-BoldItalic")
registerFontFamily("DejaVuSans", normal="DejaVuSans", bold="DejaVuSans")

from pdf import install_font_fallback  # noqa: E402  (skill helper)
install_font_fallback()

# ------------------------------------------------- palette (Template 07 body, fixed)
PAGE_BG      = colors.HexColor("#f5f8fc")   # XL ultra-light blue-white
SECTION_BG   = colors.HexColor("#edf2f9")   # XL light blue-gray
CARD_BG      = colors.HexColor("#e4ecf5")   # L  soft blue card
TABLE_STRIPE = colors.HexColor("#eef3fa")   # L  subtle blue row
HEADER_FILL  = colors.HexColor("#1a4a7a")   # M  deep blue (bridges to cover)
BORDER       = colors.HexColor("#c0d0e2")   # S  blue-gray lines
ACCENT       = colors.HexColor("#2d7ab3")   # XS = cover glow color
TEXT_PRIMARY = colors.HexColor("#142840")   # deep blue-black
TEXT_MUTED   = colors.HexColor("#5a7a96")   # blue-gray secondary

# ---------------------------------------------------------------- geometry
MARGIN = 1.0 * inch                       # symmetric left/right/top/bottom
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN             # ~451pt
AVAIL_H = PAGE_H - 2 * MARGIN
H1_COND_BREAK = AVAIL_H * 0.25            # 3/4-threshold rule for major sections
MAX_KEEP_HEIGHT = PAGE_H * 0.4

DOC_TITLE = "Infranex BT Operator Handbook"
BODY_OUT  = "/home/z/my-project/tool-results/handbook_body.pdf"
COVER_IN  = "/home/z/my-project/tool-results/handbook_cover.pdf"
FINAL_OUT = "/home/z/my-project/download/infranex-bt-operator-handbook.pdf"

# ---------------------------------------------------------------- styles
st_h1 = ParagraphStyle("H1", fontName="FreeSerif", fontSize=19, leading=25,
                       textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=4)
st_h2 = ParagraphStyle("H2", fontName="FreeSerif", fontSize=13.5, leading=19,
                       textColor=HEADER_FILL, spaceBefore=14, spaceAfter=6)
st_body = ParagraphStyle("Body", fontName="FreeSerif", fontSize=10.5, leading=17,
                         textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=9)
st_bullet = ParagraphStyle("Bullet", parent=st_body, alignment=TA_LEFT,
                           leftIndent=16, bulletIndent=4, spaceAfter=5)
st_numbered = ParagraphStyle("Numbered", parent=st_body, alignment=TA_LEFT,
                             leftIndent=18, spaceAfter=6)
st_caption = ParagraphStyle("Caption", fontName="FreeSerif", fontSize=8.5, leading=12,
                            textColor=TEXT_MUTED, alignment=TA_CENTER)
st_th = ParagraphStyle("TH", fontName="FreeSerif", fontSize=9.5, leading=13,
                       textColor=colors.white, alignment=TA_CENTER)
st_td = ParagraphStyle("TD", fontName="FreeSerif", fontSize=9, leading=12.5,
                       textColor=TEXT_PRIMARY, alignment=TA_LEFT)
st_stat = ParagraphStyle("Stat", fontName="FreeSerif", fontSize=19, leading=23,
                         textColor=ACCENT, alignment=TA_CENTER)
st_stat_label = ParagraphStyle("StatLabel", fontName="FreeSerif", fontSize=8, leading=11,
                               textColor=TEXT_MUTED, alignment=TA_CENTER)
st_callout = ParagraphStyle("Callout", fontName="FreeSerif", fontSize=10.5, leading=16.5,
                            textColor=TEXT_PRIMARY, alignment=TA_LEFT)
st_toc_title = ParagraphStyle("TocTitle", fontName="FreeSerif", fontSize=19, leading=25,
                              textColor=TEXT_PRIMARY, spaceAfter=14)

# ---------------------------------------------------------------- doc template
class BodyStartMarker(Flowable):
    """Zero-size flowable that records the page where the body (arabic 1) begins."""
    is_body_start = True
    def wrap(self, w, h): return (0, 0)
    def draw(self): pass

class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if getattr(flowable, "is_body_start", False):
            self._body_start_page = self.page
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            text = getattr(flowable, "bookmark_text", "")
            key = getattr(flowable, "bookmark_key", "")
            body_start = getattr(self, "_body_start_page", None)
            display = self.page - body_start + 1 if body_start else self.page
            # clickable TOC: key as 4th tuple element; pages shown in body numbering
            self.notify("TOCEntry", (level, text, display, key))

def roman(n):
    vals = [(10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")]
    out = ""
    for v, s in vals:
        while n >= v:
            out += s; n -= v
    return out

def draw_furniture(canvas, doc):
    canvas.saveState()
    # full-page tinted background (drawn before flowables)
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # header: title left + accent rule
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.62 * inch, DOC_TITLE.upper())
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 0.70 * inch, PAGE_W - MARGIN, PAGE_H - 0.70 * inch)
    # footer: light rule + author left + page number right
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 0.66 * inch, PAGE_W - MARGIN, 0.66 * inch)
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 0.5 * inch, "Infranex Operations")
    body_start = getattr(doc, "_body_start_page", None)
    if body_start is None or doc.page < body_start:
        label = roman(doc.page)          # front matter: i, ii, ...
    else:
        label = str(doc.page - body_start + 1)   # body resets to arabic 1
    canvas.drawRightString(PAGE_W - MARGIN, 0.5 * inch, label)
    canvas.restoreState()

def add_heading(text, style, level=0):
    key = "h_" + hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/><b>%s</b>' % (key, text), style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text.replace(" ", " ").replace("·", "-")
    p.bookmark_key = key
    return p

def safe_keep_together(elements):
    total_h = 0
    for el in elements:
        w, h = el.wrap(AVAIL_W, PAGE_H)
        total_h += h
    if total_h <= MAX_KEEP_HEIGHT:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)

# ---------------------------------------------------------------- block builders
def make_table(blk):
    ratios = blk["ratios"]
    assert abs(sum(ratios) - 1.0) < 0.01, "ratios must sum to 1"
    col_w = [r * AVAIL_W for r in ratios]
    assert sum(col_w) <= AVAIL_W + 0.5, "table exceeds available width"
    data = [[Paragraph("<b>%s</b>" % h, st_th) for h in blk["header"]]]
    for row in blk["rows"]:
        data.append([Paragraph(c, st_td) for c in row])
    t = Table(data, colWidths=col_w, hAlign="CENTER", repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_FILL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5.5),
    ]
    for i in range(1, len(data)):
        style.append(("BACKGROUND", (0, i), (-1, i),
                      TABLE_STRIPE if i % 2 == 1 else colors.white))
    t.setStyle(TableStyle(style))
    out = [Spacer(1, 12), t]
    if blk.get("caption"):
        out += [Spacer(1, 6), Paragraph(blk["caption"], st_caption), Spacer(1, 14)]
    else:
        out += [Spacer(1, 14)]
    return out

def make_statband(blk):
    stats = blk["stats"]
    col_w = [AVAIL_W / len(stats)] * len(stats)
    row_stats = [Paragraph("<b>%s</b>" % s, st_stat) for s, _ in stats]
    row_labels = [Paragraph(l, st_stat_label) for _, l in stats]
    t = Table([row_stats, row_labels], colWidths=col_w, hAlign="CENTER")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("BOX", (0, 0), (-1, -1), 1, ACCENT),
        ("LINEAFTER", (0, 0), (-2, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
        ("TOPPADDING", (0, 1), (-1, 1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
    ]))
    return [Spacer(1, 8), t, Spacer(1, 14)]

def make_callout(blk):
    p = Paragraph(blk["text"], st_callout)
    t = Table([[p]], colWidths=[AVAIL_W * 0.94], hAlign="CENTER")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("LINEBEFORE", (0, 0), (0, -1), 4, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return [Spacer(1, 6), t, Spacer(1, 12)]

def make_numbered(blk):
    out = []
    for i, item in enumerate(blk["items"], 1):
        out.append(Paragraph("<b>%d.</b>  %s" % (i, item), st_numbered))
    out.append(Spacer(1, 6))
    return out

def make_bullets(blk):
    out = []
    for item in blk["items"]:
        out.append(Paragraph(item, st_bullet, bulletText="\u2022"))
    out.append(Spacer(1, 6))
    return out

# ---------------------------------------------------------------- story build
story = []

# --- TOC (front matter, roman numbering) ---
story.append(Paragraph("<b>Table of Contents</b>", st_toc_title))
toc = TableOfContents()
toc.levelStyles = [
    ParagraphStyle("TOC0", fontName="FreeSerif", fontSize=11.5, leading=20,
                   textColor=TEXT_PRIMARY, leftIndent=6),
    ParagraphStyle("TOC1", fontName="FreeSerif", fontSize=10, leading=16,
                   textColor=TEXT_MUTED, leftIndent=26),
]
story.append(toc)
story.append(PageBreak())
story.append(BodyStartMarker())          # body arabic numbering starts here

pending_heading = None   # keep heading with its first following block
for blk in CONTENT:
    kind = blk["kind"]
    if kind == "h1":
        story.append(CondPageBreak(H1_COND_BREAK))
        story.append(Spacer(1, 10))
        h = add_heading(blk["text"], st_h1, level=0)
        rule = Table([[""]], colWidths=[AVAIL_W], rowHeights=[2])
        rule.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 1.2, ACCENT),
                                  ("TOPPADDING", (0, 0), (-1, -1), 0),
                                  ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
        pending_heading = [h, rule, Spacer(1, 8)]
        continue
    if kind == "h2":
        h = add_heading(blk["text"], st_h2, level=1)
        pending_heading = [h]
        continue

    if kind == "body":
        flow = [Paragraph(blk["text"], st_body)]
    elif kind == "table":
        flow = make_table(blk)
    elif kind == "statband":
        flow = make_statband(blk)
    elif kind == "callout":
        flow = make_callout(blk)
    elif kind == "numbered":
        flow = make_numbered(blk)
    elif kind == "bullet":
        flow = make_bullets(blk)
    else:
        raise ValueError("unknown block kind: %s" % kind)

    if pending_heading:
        story.extend(safe_keep_together(pending_heading + flow[:1]))
        story.extend(flow[1:])
        pending_heading = None
    else:
        story.extend(flow)

# ---------------------------------------------------------------- build body PDF
doc = TocDocTemplate(
    BODY_OUT, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN,
    title=DOC_TITLE, author="Z.ai", creator="Z.ai",
    subject="Operator handbook for the Infranex BT Bittensor intelligence and mining operations platform",
)
doc.multiBuild(story, onFirstPage=draw_furniture, onLaterPages=draw_furniture)
print("body built:", BODY_OUT)

# ---------------------------------------------------------------- merge cover + body
from pypdf import PdfReader, PdfWriter  # noqa: E402

A4_W, A4_H = 595.28, 841.89

def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.4 or abs(h - A4_H) > 0.4:
        page.scale_to(A4_W, A4_H)
    return page

writer = PdfWriter()
writer.add_page(normalize_page_to_a4(PdfReader(COVER_IN).pages[0]))
for page in PdfReader(BODY_OUT).pages:
    writer.add_page(normalize_page_to_a4(page))
writer.add_metadata({
    "/Title": DOC_TITLE,
    "/Author": "Z.ai",
    "/Creator": "Z.ai",
    "/Subject": "Operator handbook for the Infranex BT Bittensor intelligence and mining operations platform",
})
os.makedirs(os.path.dirname(FINAL_OUT), exist_ok=True)
with open(FINAL_OUT, "wb") as f:
    writer.write(f)
print("final merged:", FINAL_OUT, "pages:", len(writer.pages))
