# PDF-ENGINE — ReportLab body builder for the Infranex BT investor brief.
# Route: Report brief (ReportLab) · TocDocTemplate + multiBuild · English.
# Cover is rendered separately (html2poster.js) and merged here via pypdf.

import os
import sys
import hashlib

PDF_SKILL_DIR = "/home/z/my-project/skills/pdf"
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, "scripts"))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    Image, KeepTogether, CondPageBreak, HRFlowable,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from PIL import Image as PILImage

# ── Fonts (allowed set only) ────────────────────────────────────────────────
FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
# Variable NotoSansSC[wght].ttf is unreadable by ReportLab in this sandbox;
# the doc is pure English, so alias the fallback names to static NotoSerifSC.
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

from pdf import install_font_fallback  # noqa: E402  (skill scripts on path)
install_font_fallback()

# Bind em dashes to the preceding word (nbsp) so justification can never
# place the dash at line start (CJK punctuation rule, applied to EN text too).
from reportlab.platypus import Paragraph as _P  # noqa: E402
_orig_para_init = _P.__init__


def _dash_safe_init(self, text, style=None, *args, **kwargs):
    if isinstance(text, str):
        text = text.replace(" \u2014", "\u00a0\u2014")
    _orig_para_init(self, text, style, *args, **kwargs)


_P.__init__ = _dash_safe_init

# ── Cascade palette (design_engine palette-cascade --intent cold --mode minimal) ──
PAGE_BG      = colors.HexColor("#f0f1f1")
SECTION_BG   = colors.HexColor("#e9ebeb")
CARD_BG      = colors.HexColor("#e3e6e8")
TABLE_STRIPE = colors.HexColor("#eeeff0")
HEADER_FILL  = colors.HexColor("#37454c")
COVER_BLOCK  = colors.HexColor("#59707b")
BORDER       = colors.HexColor("#b7c3c9")
ICON         = colors.HexColor("#3e6274")
ACCENT       = colors.HexColor("#2784b3")
ACCENT_2     = colors.HexColor("#b44053")
TEXT_PRIMARY = colors.HexColor("#202224")
TEXT_MUTED   = colors.HexColor("#6e7477")
SEM_SUCCESS  = colors.HexColor("#519166")
SEM_WARNING  = colors.HexColor("#91753c")
SEM_ERROR    = colors.HexColor("#97554f")

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_ROW_EVEN = colors.white
TABLE_ROW_ODD = TABLE_STRIPE

# ── Page geometry (symmetric margins) ───────────────────────────────────────
PAGE_W, PAGE_H = A4
MARGIN = 0.95 * inch
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
MAX_KEEP_HEIGHT = PAGE_H * 0.4

DOC_TITLE = "Infranex BT - The GPU Mining Decision Engine for Bittensor"
DOC_AUTHOR = "Infranex BT"

# ── Styles ──────────────────────────────────────────────────────────────────
st_body = ParagraphStyle("Body", fontName="FreeSerif", fontSize=10.5, leading=17,
                         alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY,
                         spaceBefore=0, spaceAfter=8)
st_lead = ParagraphStyle("Lead", parent=st_body, fontSize=11.5, leading=19,
                         textColor=HEADER_FILL, spaceAfter=10)
st_h1 = ParagraphStyle("H1", fontName="FreeSerif", fontSize=22, leading=27,
                       textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=2)
st_h2 = ParagraphStyle("H2", fontName="FreeSerif", fontSize=15, leading=20,
                       textColor=HEADER_FILL, spaceBefore=14, spaceAfter=6)
st_h3 = ParagraphStyle("H3", fontName="FreeSerif", fontSize=11.5, leading=16,
                       textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=4)
st_kicker = ParagraphStyle("Kicker", fontName="FreeSerif", fontSize=9, leading=12,
                           textColor=ACCENT, spaceBefore=0, spaceAfter=4)
st_bullet = ParagraphStyle("Bullet", fontName="FreeSerif", fontSize=10.5, leading=16,
                           alignment=TA_LEFT, textColor=TEXT_PRIMARY,
                           leftIndent=14, spaceAfter=5)
st_caption = ParagraphStyle("Caption", fontName="FreeSerif", fontSize=8.5, leading=12,
                            alignment=TA_CENTER, textColor=TEXT_MUTED,
                            spaceBefore=3, spaceAfter=6)
st_quote = ParagraphStyle("Quote", fontName="FreeSerif-Italic", fontSize=11, leading=17,
                          alignment=TA_LEFT, textColor=HEADER_FILL)
st_stat = ParagraphStyle("StatBig", fontName="FreeSerif", fontSize=17, leading=21,
                         textColor=ACCENT, alignment=TA_CENTER)
st_stat_label = ParagraphStyle("StatLabel", fontName="FreeSerif", fontSize=8.5, leading=11.5,
                               textColor=TEXT_MUTED, alignment=TA_CENTER)
st_cell = ParagraphStyle("Cell", fontName="FreeSerif", fontSize=9.5, leading=13,
                         alignment=TA_LEFT, textColor=TEXT_PRIMARY)
st_cell_c = ParagraphStyle("CellC", parent=st_cell, alignment=TA_CENTER)
st_cell_head = ParagraphStyle("CellHead", fontName="FreeSerif", fontSize=9.5, leading=13,
                              alignment=TA_LEFT, textColor=colors.white)
st_cell_head_c = ParagraphStyle("CellHeadC", parent=st_cell_head, alignment=TA_CENTER)
st_toc_title = ParagraphStyle("TocTitle", fontName="FreeSerif", fontSize=20, leading=26,
                              textColor=TEXT_PRIMARY, spaceAfter=14)

ROMAN = {1: "i", 2: "ii", 3: "iii", 4: "iv", 5: "v", 6: "vi", 7: "vii", 8: "viii"}


class TocDocTemplate(SimpleDocTemplate):
    """SimpleDocTemplate + TOC notification + zone-aware footer."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.body_start_page = None

    def afterFlowable(self, flowable):
        if getattr(flowable, "body_start_marker", False) and self.body_start_page is None:
            self.body_start_page = self.page
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            text = getattr(flowable, "bookmark_text", "")
            key = getattr(flowable, "bookmark_key", "")
            # TOC must show the DISPLAYED page number (body resets to arabic 1),
            # not the physical body-PDF page.
            offset = (self.body_start_page - 1) if self.body_start_page else 0
            self.notify("TOCEntry", (level, text, self.page - offset, key))

    def afterPage(self):
        c = self.canv
        page = self.page
        c.saveState()
        in_body = self.body_start_page is not None and page >= self.body_start_page
        if in_body:
            # header: muted title left + accent rule
            c.setFont("FreeSerif", 7.5)
            c.setFillColor(TEXT_MUTED)
            c.drawString(MARGIN, PAGE_H - 0.52 * inch, DOC_TITLE)
            c.setStrokeColor(ACCENT)
            c.setLineWidth(1.2)
            c.line(MARGIN, PAGE_H - 0.60 * inch, PAGE_W - MARGIN, PAGE_H - 0.60 * inch)
            # footer: light rule + author left + arabic page right (reset at body)
            c.setStrokeColor(BORDER)
            c.setLineWidth(0.5)
            c.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
            c.setFont("FreeSerif", 7.5)
            c.setFillColor(TEXT_MUTED)
            c.drawString(MARGIN, 0.45 * inch, "Infranex BT · Investor Brief")
            num = str(page - self.body_start_page + 1)
            c.drawRightString(PAGE_W - MARGIN, 0.45 * inch, num)
        else:
            # front matter: centered roman numeral
            c.setFont("FreeSerif", 9)
            c.setFillColor(TEXT_MUTED)
            c.drawCentredString(PAGE_W / 2, 0.45 * inch, ROMAN.get(page, str(page)))
        c.restoreState()


def add_heading(text, style, level=0, marker=False):
    key = "h_" + hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph(f'<a name="{key}"/><b>{text}</b>', style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    if marker:
        p.body_start_marker = True
    return p


def safe_keep_together(elements):
    total_h = 0
    for el in elements:
        w, h = el.wrap(AVAIL_W, PAGE_H)
        total_h += h
    if total_h <= MAX_KEEP_HEIGHT:
        return [KeepTogether(elements)]
    if len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)


def embed_image(path, max_width=None, max_height=280):
    if max_width is None:
        max_width = AVAIL_W
    pil = PILImage.open(path)
    ow, oh = pil.size
    ratio = min(max_width / ow if ow > max_width else 1.0,
                max_height / oh if oh > max_height else 1.0)
    return Image(path, width=ow * ratio, height=oh * ratio)


# ── Block builders ──────────────────────────────────────────────────────────

def build_callout(big, label):
    t = Table(
        [[Paragraph(f"<b>{big}</b>", st_stat)], [Paragraph(label, st_stat_label)]],
        colWidths=[AVAIL_W * 0.64], hAlign="CENTER",
    )
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("BOX", (0, 0), (-1, -1), 1, ACCENT),
        ("TOPPADDING", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ("TOPPADDING", (0, 1), (-1, 1), 0),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))
    return [Spacer(1, 10), KeepTogether(t), Spacer(1, 12)]


def build_stats(items):
    """items: list of (big, label) — one stat band row."""
    cells = [[Paragraph(f"<b>{b}</b>", st_stat), Paragraph(lbl, st_stat_label)] for b, lbl in items]
    t = Table([cells], colWidths=[AVAIL_W / len(items)] * len(items), hAlign="CENTER")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("LINEABOVE", (0, 0), (-1, 0), 1.2, ACCENT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return [Spacer(1, 12), KeepTogether(t), Spacer(1, 14)]


def build_table(headers, rows, ratios, caption=None, center_cols=None, font=None):
    center_cols = center_cols or set()
    hstyle = st_cell_head_c if False else st_cell_head
    hstyle_c = st_cell_head_c
    cstyle = st_cell
    cstyle_c = st_cell_c
    data = [[Paragraph(f"<b>{h}</b>", hstyle_c if i in center_cols else hstyle)
             for i, h in enumerate(headers)]]
    for r in rows:
        data.append([Paragraph(str(cell), cstyle_c if i in center_cols else cstyle)
                     for i, cell in enumerate(r)])
    col_widths = [ratio * AVAIL_W for ratio in ratios]
    assert sum(col_widths) <= AVAIL_W + 0.5, "table overflow"
    t = Table(data, colWidths=col_widths, hAlign="CENTER", repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(data)):
        style.append(("BACKGROUND", (0, i), (-1, i),
                      TABLE_ROW_ODD if i % 2 == 1 else TABLE_ROW_EVEN))
    t.setStyle(TableStyle(style))
    out = [Spacer(1, 14), t]
    if caption:
        out += [Paragraph(caption, st_caption)]
    out += [Spacer(1, 12)]
    if len(rows) <= 12:
        return [Spacer(1, 14)] + safe_keep_together([t] + ([Paragraph(caption, st_caption)] if caption else [])) + [Spacer(1, 12)]
    return out


def build_chart(path, caption):
    img = embed_image(path, max_width=AVAIL_W, max_height=270)
    cap = Paragraph(caption, st_caption)
    return [Spacer(1, 22)] + safe_keep_together([img, cap]) + [Spacer(1, 16)]


def build_quote(text):
    t = Table([[Paragraph(text, st_quote)]], colWidths=[AVAIL_W * 0.92], hAlign="CENTER")
    t.setStyle(TableStyle([
        ("LINEBEFORE", (0, 0), (0, -1), 2, ACCENT),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return [Spacer(1, 8), KeepTogether(t), Spacer(1, 10)]


def chapter(num, title, blocks, first=False):
    out = []
    if not first:
        out.append(CondPageBreak(AVAIL_H * 0.25))
    eyebrow = Paragraph(f"CHAPTER {num}", st_kicker)
    head = add_heading(f"{num}.  {title}", st_h1, level=0, marker=first)
    rule = HRFlowable(width="100%", thickness=1.2, color=ACCENT,
                      spaceBefore=3, spaceAfter=12)
    out += safe_keep_together([eyebrow, head, rule])
    for blk in blocks:
        kind = blk[0]
        if kind == "body":
            out.append(Paragraph(blk[1], st_body))
        elif kind == "lead":
            out.append(Paragraph(blk[1], st_lead))
        elif kind == "h2":
            out.append(Paragraph(f"<b>{blk[1]}</b>", st_h2))
        elif kind == "h3":
            out.append(Paragraph(f"<b>{blk[1]}</b>", st_h3))
        elif kind == "bullets":
            for b in blk[1]:
                out.append(Paragraph(f"• {b}", st_bullet))
            out.append(Spacer(1, 4))
        elif kind == "callout":
            out += build_callout(blk[1], blk[2])
        elif kind == "stats":
            out += build_stats(blk[1])
        elif kind == "tablex":
            _, headers, rows, ratios, caption, centers = blk
            out += build_table(headers, rows, ratios, caption=caption,
                               center_cols=set(centers))
        elif kind == "chart":
            out += build_chart(blk[1], blk[2])
        elif kind == "quote":
            out += build_quote(blk[1])
        elif kind == "spacer":
            out.append(Spacer(1, blk[1]))
    out.append(Spacer(1, 18))
    return out


# table block format: ("table", headers, rows, ratios, caption, center_cols_idx)
# normalized below to keep call sites simple.

def normalize_table_blocks(blocks):
    out = []
    for blk in blocks:
        if blk[0] == "table":
            headers, rows, ratios = blk[1], blk[2], blk[3]
            caption = blk[4] if len(blk) > 4 else None
            centers = blk[5] if len(blk) > 5 else []
            out.append(("tablex", headers, rows, ratios, caption, centers))
        else:
            out.append(blk)
    return out


def build_story(chapters):
    story = []
    # TOC front matter
    story.append(Paragraph("<b>Table of Contents</b>", st_toc_title))
    story.append(HRFlowable(width="100%", thickness=1.2, color=ACCENT, spaceAfter=16))
    toc = TableOfContents()
    toc.dotsMinLevel = 0
    toc.levelStyles = [
        ParagraphStyle("TOC0", fontName="FreeSerif", fontSize=12, leading=22,
                       leftIndent=6, textColor=TEXT_PRIMARY),
    ]
    story.append(toc)
    story.append(PageBreak())
    for idx, (num, title, blocks) in enumerate(chapters):
        blocks = normalize_table_blocks(blocks)
        story += chapter(num, title, blocks, first=(idx == 0))
    # Drop trailing spacers so the final page never exists only for padding.
    while story and isinstance(story[-1], Spacer):
        story.pop()
    return story


def main():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from pdf_content_a import CHAPTERS_A
    from pdf_content_b import CHAPTERS_B
    chapters = CHAPTERS_A + CHAPTERS_B

    body_pdf = "/home/z/my-project/scripts/pdf-body.pdf"
    doc = TocDocTemplate(
        body_pdf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN,
        title=DOC_TITLE, author="Z.ai", creator="Z.ai",
        subject="Business model and investor brief for the Infranex BT Bittensor mining decision engine",
    )
    doc.multiBuild(build_story(chapters))
    print("body built:", body_pdf)

    # merge cover (normalize to A4) + body -> final
    from pypdf import PdfReader, PdfWriter
    A4_W, A4_H = 595.28, 841.89

    def norm(page):
        w, h = float(page.mediabox.width), float(page.mediabox.height)
        if abs(w - A4_W) > 0.3 or abs(h - A4_H) > 0.3:
            page.scale_to(A4_W, A4_H)
        return page

    out_pdf = "/home/z/my-project/download/Infranex-BT-GPU-Mining-Business-Model-Investor-Brief.pdf"
    os.makedirs(os.path.dirname(out_pdf), exist_ok=True)
    writer = PdfWriter()
    writer.add_page(norm(PdfReader("/home/z/my-project/scripts/pdf-cover.pdf").pages[0]))
    for p in PdfReader(body_pdf).pages:
        writer.add_page(norm(p))
    writer.add_metadata({
        "/Title": DOC_TITLE,
        "/Author": "Z.ai",
        "/Creator": "Z.ai",
        "/Subject": "Business model and investor brief for the Infranex BT Bittensor mining decision engine",
    })
    with open(out_pdf, "wb") as f:
        writer.write(f)
    print("final:", out_pdf)


if __name__ == "__main__":
    main()
