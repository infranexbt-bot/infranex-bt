#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bittensor: The Complete Guide — body PDF builder (ReportLab, Report route).

Design system: Cover Template 07 'Crystal Blue' fixed body palette
(skills/pdf/typesetting/cover.md — Template 07 body subset). One 215-degree
hue family across cover and body. English document -> FreeSerif family.
"""
import os
import sys
import hashlib

SKILL_SCRIPTS = '/home/z/my-project/skills/pdf/scripts'
if SKILL_SCRIPTS not in sys.path:
    sys.path.insert(0, SKILL_SCRIPTS)

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, KeepTogether,
                                CondPageBreak, Image, HRFlowable)
from reportlab.platypus.tableofcontents import TableOfContents
from PIL import Image as PILImage

# ------------------------------------------------------------------ fonts
FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
# NOTE: NotoSansSC on this host is a variable font that ReportLab cannot load;
# English document -> FreeSerif primary, NotoSerifSC handles any stray CJK glyph.
pdfmetrics.registerFont(TTFont('SarasaMonoSC', f'{FONT_DIR}/truetype/chinese/SarasaMonoSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))

registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold',
                   italic='FreeSerif-Italic', boldItalic='FreeSerif-BoldItalic')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

from pdf import install_font_fallback  # noqa: E402
install_font_fallback()

# ------------------------------------------------------------- palette
# Template 07 Crystal Blue — fixed body subset (cover.md, Template 07)
PAGE_BG      = colors.HexColor('#f5f8fc')   # XL
SECTION_BG   = colors.HexColor('#edf2f9')   # XL
CARD_BG      = colors.HexColor('#e4ecf5')   # L
TABLE_STRIPE = colors.HexColor('#eef3fa')   # L
HEADER_FILL  = colors.HexColor('#1a4a7a')   # M
BORDER       = colors.HexColor('#c0d0e2')   # S
ACCENT       = colors.HexColor('#2d7ab3')   # XS
TEXT_PRIMARY = colors.HexColor('#142840')
TEXT_MUTED   = colors.HexColor('#5a7a96')

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_ROW_EVEN = colors.white
TABLE_ROW_ODD = TABLE_STRIPE

# ------------------------------------------------------------- geometry
PAGE_W, PAGE_H = A4
MARGIN = 0.9 * inch                    # symmetric left/right
TOP_MARGIN = 1.02 * inch
BOTTOM_MARGIN = 0.92 * inch
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - TOP_MARGIN - BOTTOM_MARGIN
H1_COND = AVAIL_H * 0.25

DOC_TITLE = 'Bittensor: The Complete Guide'
DOC_AUTHOR = 'Infranex BT'
BODY_PDF = os.path.join(BASE, 'bt_body.pdf')

# --------------------------------------------------------------- styles
S = {}
S['body'] = ParagraphStyle('BodyEN', fontName='FreeSerif', fontSize=10.5,
                           leading=17, alignment=TA_JUSTIFY,
                           textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=9)
S['h1'] = ParagraphStyle('H1', fontName='FreeSerif-Bold', fontSize=21,
                         leading=26, textColor=HEADER_FILL,
                         spaceBefore=0, spaceAfter=0)
S['h2'] = ParagraphStyle('H2', fontName='FreeSerif-Bold', fontSize=14.5,
                         leading=19, textColor=HEADER_FILL,
                         spaceBefore=14, spaceAfter=6)
S['h3'] = ParagraphStyle('H3', fontName='FreeSerif-Bold', fontSize=11.5,
                         leading=16, textColor=TEXT_PRIMARY,
                         spaceBefore=12, spaceAfter=5)
S['bullet'] = ParagraphStyle('Bullet', fontName='FreeSerif', fontSize=10.5,
                             leading=16.5, alignment=TA_LEFT,
                             textColor=TEXT_PRIMARY, leftIndent=16,
                             firstLineIndent=0, spaceAfter=5)
S['numbered'] = ParagraphStyle('Numbered', fontName='FreeSerif', fontSize=10.5,
                               leading=16.5, alignment=TA_LEFT,
                               textColor=TEXT_PRIMARY, leftIndent=20,
                               firstLineIndent=0, spaceAfter=7)
S['quote'] = ParagraphStyle('Quote', fontName='FreeSerif-Italic', fontSize=11.5,
                            leading=17.5, alignment=TA_LEFT,
                            textColor=HEADER_FILL)
S['stat_big'] = ParagraphStyle('StatBig', fontName='FreeSerif-Bold',
                               fontSize=15.5, leading=19, textColor=ACCENT,
                               alignment=TA_CENTER)
S['stat_label'] = ParagraphStyle('StatLabel', fontName='FreeSerif',
                                 fontSize=8, leading=11, textColor=TEXT_MUTED,
                                 alignment=TA_CENTER)
S['caption'] = ParagraphStyle('Caption', fontName='FreeSerif', fontSize=8.5,
                              leading=12, textColor=TEXT_MUTED,
                              alignment=TA_CENTER, spaceBefore=0, spaceAfter=0)
S['th'] = ParagraphStyle('TH', fontName='FreeSerif-Bold', fontSize=9.5,
                         leading=12.5, textColor=colors.white,
                         alignment=TA_LEFT)
S['td'] = ParagraphStyle('TD', fontName='FreeSerif', fontSize=9,
                         leading=12.5, textColor=TEXT_PRIMARY,
                         alignment=TA_LEFT)
S['toc_title'] = ParagraphStyle('TocTitle', fontName='FreeSerif-Bold',
                                fontSize=20, leading=25,
                                textColor=HEADER_FILL, spaceAfter=4)

TOC_L0 = ParagraphStyle('TOCH1', fontName='FreeSerif-Bold', fontSize=11,
                        leading=20, leftIndent=0, textColor=TEXT_PRIMARY)
TOC_L1 = ParagraphStyle('TOCH2', fontName='FreeSerif', fontSize=9.5,
                        leading=15, leftIndent=18, textColor=TEXT_MUTED)


# ------------------------------------------------------------ doc class
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))


def page_decor(canvas, doc):
    """Page background + header + footer (all-English canvas text)."""
    canvas.saveState()
    # Layer 0: page background (Template 07 XL tier)
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # Header
    canvas.setFillColor(TEXT_MUTED)
    canvas.setFont('FreeSerif', 7.5)
    canvas.drawString(MARGIN, PAGE_H - 0.52 * inch,
                      'BITTENSOR — THE COMPLETE GUIDE')
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 0.52 * inch,
                           'INFRANEX BT · MINER INTELLIGENCE')
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 0.60 * inch, PAGE_W - MARGIN,
                PAGE_H - 0.60 * inch)
    # Footer
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN, 0.64 * inch, PAGE_W - MARGIN, 0.64 * inch)
    canvas.setFillColor(TEXT_MUTED)
    canvas.setFont('FreeSerif', 7.5)
    canvas.drawString(MARGIN, 0.46 * inch, 'Infranex BT — October 2026')
    canvas.drawRightString(PAGE_W - MARGIN, 0.46 * inch, str(doc.page))
    canvas.restoreState()


# ------------------------------------------------------------- helpers
MAX_KEEP_HEIGHT = PAGE_H * 0.4


def safe_keep_together(elements):
    total_h = 0
    for el in elements:
        try:
            _, h = el.wrap(AVAIL_W, PAGE_H)
        except Exception:
            h = 0
        total_h += h
    if total_h <= MAX_KEEP_HEIGHT:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)


def add_heading(text, style, level=0):
    key = 'h_%s' % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/><b>%s</b>' % (key, text), style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p


def h1_block(num, title, story):
    heading = add_heading('%d. %s' % (num, title), S['h1'], level=0)
    rule = HRFlowable(width='100%', thickness=1.4, color=ACCENT,
                      spaceBefore=5, spaceAfter=11, lineCap='butt')
    story.append(CondPageBreak(H1_COND))
    story.append(Spacer(1, 14))
    story.extend(safe_keep_together([heading, rule]))


def h2_block(num, title, story):
    heading = add_heading('%s %s' % (num, title), S['h2'], level=1)
    story.append(CondPageBreak(64))
    story.append(heading)


def stats_row(items, story):
    n = len(items)
    col_w = (AVAIL_W * 0.86) / n
    row_big = [Paragraph('<b>%s</b>' % big, S['stat_big']) for big, _ in items]
    row_lab = [Paragraph(lab, S['stat_label']) for _, lab in items]
    t = Table([row_big, row_lab], colWidths=[col_w] * n, hAlign='CENTER')
    style = [
        ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
        ('BOX', (0, 0), (-1, -1), 0.9, ACCENT),
        ('VALIGN', (0, 0), (-1, 0), 'BOTTOM'),
        ('VALIGN', (0, 1), (-1, 1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, 0), 11),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 2),
        ('TOPPADDING', (0, 1), (-1, 1), 2),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 11),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]
    for i in range(1, n):
        style.append(('LINEBEFORE', (i, 0), (i, -1), 0.6, BORDER))
    t.setStyle(TableStyle(style))
    story.append(Spacer(1, 8))
    story.append(t)
    story.append(Spacer(1, 14))


def quote_block(text, story):
    t = Table([[Paragraph(text, S['quote'])]], colWidths=[AVAIL_W * 0.90],
              hAlign='CENTER')
    t.setStyle(TableStyle([
        ('LINEBEFORE', (0, 0), (0, -1), 2, ACCENT),
        ('LEFTPADDING', (0, 0), (-1, -1), 16),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(Spacer(1, 6))
    story.append(t)
    story.append(Spacer(1, 12))


def build_table(spec, story):
    ratios = spec['ratios']
    col_w = [r * AVAIL_W * 0.985 for r in ratios]
    assert sum(col_w) <= AVAIL_W + 0.5, 'table exceeds available width'
    data = [[Paragraph('<b>%s</b>' % h, S['th']) for h in spec['header']]]
    for row in spec['rows']:
        data.append([Paragraph(nb(c), S['td']) for c in row])
    t = Table(data, colWidths=col_w, hAlign='CENTER', repeatRows=1)
    style = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 5.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5.5),
    ]
    for i in range(1, len(data)):
        bg = TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD
        style.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style))
    caption = Paragraph(nb(spec['caption']), S['caption'])
    story.append(Spacer(1, 14))
    if len(data) <= 15:
        story.extend(safe_keep_together([t, Spacer(1, 6), caption]))
    else:
        story.append(t)
        story.append(Spacer(1, 6))
        story.append(caption)
    story.append(Spacer(1, 16))


def embed_image(path, max_width=None, max_height=None):
    if max_width is None:
        max_width = AVAIL_W
    if max_height is None:
        max_height = PAGE_H * 0.33
    pil = PILImage.open(path)
    ow, oh = pil.size
    rw = max_width / ow if ow > max_width else 1.0
    rh = max_height / oh if oh > max_height else 1.0
    ratio = min(rw, rh)
    return Image(path, width=ow * ratio, height=oh * ratio)


def chart_block(spec, story):
    img = embed_image(os.path.join(BASE, spec['path']),
                      max_width=AVAIL_W * 0.97,
                      max_height=spec.get('max_h', 260))
    caption = Paragraph(nb(spec['caption']), S['caption'])
    story.append(Spacer(1, 18))
    story.extend(safe_keep_together([img, Spacer(1, 7), caption]))
    story.append(Spacer(1, 18))


# ---------------------------------------------------------------- story
from bt_content_a import SECTIONS_A  # noqa: E402
from bt_content_b import SECTIONS_B  # noqa: E402

BLOCKS = SECTIONS_A + SECTIONS_B


def nb(text):
    """Bind em dashes to the preceding word so a line never starts with one."""
    if isinstance(text, str):
        return text.replace(' \u2014 ', '\u00a0\u2014 ')
    return text

story = []

# --- TOC page (front matter; body PDF page 1) ---
story.append(Paragraph('<b>Table of Contents</b>', S['toc_title']))
story.append(HRFlowable(width='100%', thickness=1.4, color=ACCENT,
                        spaceBefore=5, spaceAfter=16, lineCap='butt'))
toc = TableOfContents()
toc.levelStyles = [TOC_L0, TOC_L1]
story.append(toc)
story.append(PageBreak())

h1_count = 0
h2_count = 0
for kind, payload in BLOCKS:
    if kind == 'h1':
        h1_count += 1
        h1_block(h1_count, payload, story)
    elif kind == 'h2':
        h2_count += 1
        h2_block('%d.%d' % (h1_count, h2_count), payload, story)
    elif kind == 'h3':
        story.append(CondPageBreak(50))
        story.append(Paragraph('<b>%s</b>' % payload, S['h3']))
    elif kind == 'body':
        story.append(Paragraph(nb(payload), S['body']))
    elif kind == 'bullets':
        for item in payload:
            story.append(Paragraph('\u2022  %s' % nb(item),
                                   S['bullet']))
        story.append(Spacer(1, 4))
    elif kind == 'numbered':
        for i, item in enumerate(payload, 1):
            story.append(Paragraph('<b>%d.</b>  %s' % (i, nb(item)),
                                   S['numbered']))
        story.append(Spacer(1, 4))
    elif kind == 'quote':
        quote_block(nb(payload), story)
    elif kind == 'stats':
        stats_row(payload, story)
    elif kind == 'table':
        build_table(payload, story)
    elif kind == 'chart':
        chart_block(payload, story)
    else:
        raise ValueError('unknown block kind: %s' % kind)

doc = TocDocTemplate(
    BODY_PDF, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=TOP_MARGIN, bottomMargin=BOTTOM_MARGIN,
    title=DOC_TITLE, author='Z.ai', creator='Z.ai',
    subject='A complete guide to Bittensor: TAO, subnets, validators, '
            'miners, and the business model for Infranex BT',
)
doc.multiBuild(story, onFirstPage=page_decor, onLaterPages=page_decor)
print('body built:', BODY_PDF)

# ------------------------------------------------------------- merge
from pypdf import PdfReader, PdfWriter  # noqa: E402

A4_W, A4_H = 595.28, 841.89
COVER_PDF = os.path.join(BASE, 'bt_cover.pdf')
FINAL_PDF = '/home/z/my-project/download/Bittensor_Complete_Guide_Infranex_BT.pdf'
os.makedirs(os.path.dirname(FINAL_PDF), exist_ok=True)


def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.3 or abs(h - A4_H) > 0.3:
        page.scale_to(A4_W, A4_H)
    return page


writer = PdfWriter()
writer.add_page(normalize_page_to_a4(PdfReader(COVER_PDF).pages[0]))
for page in PdfReader(BODY_PDF).pages:
    writer.add_page(normalize_page_to_a4(page))
writer.add_metadata({
    '/Title': DOC_TITLE + ' — Infranex BT',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'What Bittensor is, what it does, subnets, TAO supply, '
                'validators and miners, and the Infranex BT business model',
})
with open(FINAL_PDF, 'wb') as f:
    writer.write(f)
print('final merged:', FINAL_PDF, 'pages:', len(PdfReader(FINAL_PDF).pages))
