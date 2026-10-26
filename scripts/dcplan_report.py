#!/usr/bin/env python3
"""Mini GPU Datacenter Investment Plan — ReportLab body (Report brief, Report route).
Template 07 Crystal Blue fixed body palette. English document -> FreeSerif.
TOC gate: YES -> TocDocTemplate + multiBuild. Cover generated separately (html2poster.js)
and merged via pypdf as page 0.
"""
import os, sys, hashlib

PDF_SKILL_DIR = '/home/z/my-project/skills/pdf'
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, 'scripts'))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT, TA_CENTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak,
                                Table, TableStyle, Image, KeepTogether, CondPageBreak,
                                HRFlowable)
from reportlab.platypus.tableofcontents import TableOfContents
from PIL import Image as PILImage

# ---------------- fonts ----------------
FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Noto Sans SC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Noto Sans SC Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
registerFontFamily('Noto Sans SC', normal='Noto Sans SC', bold='NotoSerifSC-Bold')
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold',
                   italic='FreeSerif-Italic', boldItalic='FreeSerif-BoldItalic')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

from pdf import install_font_fallback
install_font_fallback()

# ---------------- palette (Template 07 Crystal Blue — fixed body subset) ----------------
PAGE_BG       = colors.HexColor('#f5f8fc')
SECTION_BG    = colors.HexColor('#edf2f9')
CARD_BG       = colors.HexColor('#e4ecf5')
TABLE_STRIPE  = colors.HexColor('#eef3fa')
HEADER_FILL   = colors.HexColor('#1a4a7a')
BORDER        = colors.HexColor('#c0d0e2')
ACCENT        = colors.HexColor('#2d7ab3')
TEXT_PRIMARY  = colors.HexColor('#142840')
TEXT_MUTED    = colors.HexColor('#5a7a96')
TABLE_HEADER_COLOR = HEADER_FILL
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

# ---------------- page geometry ----------------
MARGIN = 1.0 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
H1_ORPHAN = AVAIL_H * 0.25
MAX_KEEP = PAGE_H * 0.4

ASSETS = '/home/z/my-project/scripts/assets'
OUT_BODY = '/home/z/my-project/scripts/assets/dcplan_body.pdf'

# ---------------- styles ----------------
body = ParagraphStyle('Body', fontName='FreeSerif', fontSize=10.5, leading=17,
                      alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY, spaceAfter=10)
h1 = ParagraphStyle('H1x', fontName='FreeSerif', fontSize=22, leading=27,
                    textColor=TEXT_PRIMARY, spaceBefore=6, spaceAfter=4)
h2 = ParagraphStyle('H2x', fontName='FreeSerif', fontSize=15, leading=20,
                    textColor=HEADER_FILL, spaceBefore=14, spaceAfter=6)
h3 = ParagraphStyle('H3x', fontName='FreeSerif', fontSize=11.5, leading=16,
                    textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=4)
caption = ParagraphStyle('Cap', fontName='FreeSerif', fontSize=8.5, leading=12,
                         alignment=TA_CENTER, textColor=TEXT_MUTED)
bullet = ParagraphStyle('Bul', fontName='FreeSerif', fontSize=10.5, leading=17,
                        alignment=TA_LEFT, textColor=TEXT_PRIMARY, leftIndent=14,
                        bulletIndent=2, spaceAfter=6)
quote = ParagraphStyle('Quote', fontName='FreeSerif-Italic', fontSize=10.5, leading=17,
                       leftIndent=24, textColor=TEXT_MUTED, spaceBefore=6, spaceAfter=10)
th = ParagraphStyle('TH', fontName='FreeSerif', fontSize=9.5, leading=13,
                    textColor=colors.white, alignment=TA_CENTER)
td = ParagraphStyle('TD', fontName='FreeSerif', fontSize=9.5, leading=13,
                    textColor=TEXT_PRIMARY, alignment=TA_CENTER)
tdl = ParagraphStyle('TDL', fontName='FreeSerif', fontSize=9.5, leading=13,
                     textColor=TEXT_PRIMARY, alignment=TA_LEFT)
stat_big = ParagraphStyle('StatBig', fontName='FreeSerif', fontSize=20, leading=24,
                          textColor=ACCENT, alignment=TA_CENTER)
stat_lab = ParagraphStyle('StatLab', fontName='FreeSerif', fontSize=8.5, leading=11,
                          textColor=TEXT_MUTED, alignment=TA_CENTER)
toc_l0 = ParagraphStyle('TOC0', fontName='FreeSerif', fontSize=12, leading=20, leftIndent=16,
                        textColor=TEXT_PRIMARY)
toc_title = ParagraphStyle('TOCTitle', fontName='FreeSerif', fontSize=20, leading=26,
                           textColor=TEXT_PRIMARY, spaceAfter=14)

# ---------------- doc template ----------------
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page - 1, key))  # body-relative (TOC page = roman i)

ROMAN = {1: 'i', 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v'}

def page_decor(canvas, doc):
    canvas.saveState()
    # page background (Template 07 XL tier)
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # header: title left + accent rule
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.62 * inch, 'Mini GPU Datacenter Investment Plan')
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 0.70 * inch, PAGE_W - MARGIN, PAGE_H - 0.70 * inch)
    # footer: author left + page number right + light rule
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 0.45 * inch, 'Infranex BT · October 2026')
    page_label = ROMAN.get(doc.page, str(doc.page)) if doc.page == 1 else str(doc.page - 1)
    canvas.drawRightString(PAGE_W - MARGIN, 0.45 * inch, page_label)
    canvas.restoreState()

def add_heading(text, style, level=0):
    key = 'h_%s' % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/><b>%s</b>' % (key, text), style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def h1_block(text):
    return [CondPageBreak(H1_ORPHAN),
            add_heading(text, h1, level=0),
            HRFlowable(width='100%', color=ACCENT, thickness=1.5, spaceBefore=0, spaceAfter=12)]

def safe_keep(elements):
    total = 0
    for el in elements:
        w, hgt = el.wrap(AVAIL_W, PAGE_H)
        total += hgt
    if total <= MAX_KEEP:
        return [KeepTogether(elements)]
    if len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)

def P(text, style=body):
    return Paragraph(text, style)

def make_table(header, rows, ratios, left_cols=()):
    assert abs(sum(ratios) - 1.0) < 1e-6
    widths = [r * AVAIL_W * 0.98 for r in ratios]
    data = [[Paragraph('<b>%s</b>' % c, th) for c in header]]
    for row in rows:
        cells = []
        for i, c in enumerate(row):
            cells.append(Paragraph(str(c), tdl if i in left_cols else td))
        data.append(cells)
    t = Table(data, colWidths=widths, hAlign='CENTER', repeatRows=1)
    style = [('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
             ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
             ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
             ('LEFTPADDING', (0, 0), (-1, -1), 6),
             ('RIGHTPADDING', (0, 0), (-1, -1), 6),
             ('TOPPADDING', (0, 0), (-1, -1), 5),
             ('BOTTOMPADDING', (0, 0), (-1, -1), 5)]
    for i in range(1, len(rows) + 1):
        style.append(('BACKGROUND', (0, i), (-1, i),
                      TABLE_ROW_ODD if i % 2 == 0 else TABLE_ROW_EVEN))
    t.setStyle(TableStyle(style))
    return t

def callout_row(stats):
    """stats: list of (big, label) — rendered as a centered row of callout boxes."""
    n = len(stats)
    box_w = (AVAIL_W * 0.92) / n
    cells = []
    for big, lab in stats:
        inner = Table([[Paragraph('<b>%s</b>' % big, stat_big)],
                       [Paragraph(lab, stat_lab)]], colWidths=[box_w - 12])
        inner.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
            ('BOX', (0, 0), (-1, -1), 1, ACCENT),
            ('TOPPADDING', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 9),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
        cells.append(inner)
    outer = Table([cells], colWidths=[box_w] * n, hAlign='CENTER')
    outer.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                               ('LEFTPADDING', (0, 0), (-1, -1), 4),
                               ('RIGHTPADDING', (0, 0), (-1, -1), 4)]))
    return outer

def embed_image(path, max_width=None, max_height=None):
    if max_width is None:
        max_width = AVAIL_W
    if max_height is None:
        max_height = A4[1] * 0.35
    img = PILImage.open(path)
    ow, oh = img.size
    rw = max_width / ow if ow > max_width else 1.0
    rh = max_height / oh if oh > max_height else 1.0
    r = min(rw, rh)
    return Image(path, width=ow * r, height=oh * r)

# ================= story =================
story = []

# --- TOC page (front matter, roman numbering) ---
toc = TableOfContents()
toc.levelStyles = [toc_l0]
story.append(Paragraph('<b>Table of Contents</b>', toc_title))
story.append(toc)
story.append(PageBreak())

# =========== 1. Executive Summary ===========
story.extend(h1_block('1. Executive Summary and Decision'))
story.append(P(
    'This plan answers one question with chain data instead of enthusiasm: <b>what should a '
    '$50,000 mini GPU datacenter look like in October 2026 if its purpose is to earn from '
    'Bittensor subnets?</b> The answer comes from the Infranex BT conviction engine, which '
    're-scores all 128 live subnets daily on an owned-hardware basis, plus measured rental '
    'earnings from the lium.io GPU marketplace (trailing 30 days to 2026-10-23) and verified '
    'street prices from the secondary GPU market. Three findings drive every recommendation '
    'that follows.'))
story.append(P(
    '<b>First, GPU subnet mining alone does not pay for hardware.</b> Scoring every tier of '
    'hardware through the same engine shows that only one broad-seat GPU subnet (REAX, SN92) '
    'earns a RUN verdict today, with a new-entrant expected value of roughly $453 per month. '
    'Even a $33,000 H200 unlocks just one additional RUN subnet (SayGM, EV $266 per month). '
    '<b>Second, hosting the same cards on the rental market out-earns mining them.</b> A used '
    'H100 80GB card earned a measured $1,388 per month hosting, at 72 percent occupancy, '
    'versus $453 expected from mining it. <b>Third, the two strategies are complementary '
    'rather than competing</b>, because the engine re-scores daily and can signal when a card '
    'should switch from renting to mining.'))
story.append(Spacer(1, 6))
story.append(callout_row([('$38,000', 'Hardware capex (of $50k budget)'),
                          ('$2,645', 'Base net hosting income, $ per month'),
                          ('~14 mo', 'Base-case breakeven'),
                          ('2 × H100', '80GB · recommended build')]))
story.append(Spacer(1, 10))
story.append(P(
    'The recommended build is the <b>Twin-Hopper node</b>: two used NVIDIA H100 PCIe 80GB '
    'cards in one used 4U server, hosted on lium.io with soft-limit pricing, with one card '
    'designated as a flex slot that the app can flip to subnet mining the moment a subnet\'s '
    'expected value exceeds the hosting day-rate. Total hardware cost is approximately '
    '$38,000, leaving a $12,000 operating buffer that covers registration burns, four months '
    'of electricity, and TAO price volatility. In parallel, at zero hardware cost, the three '
    'CPU-only RUN subnets (Noah, Hone, CliqueAI) should be run on a rented VPS immediately, '
    'since they out-earn the entire GPU build by an order of magnitude.'))

# =========== 2. Evidence ===========
story.extend(h1_block('2. The Evidence: What the Chain Data Shows'))
story.append(Paragraph('2.1 Subnet scan by hardware tier', h2))
story.append(P(
    'The conviction engine was run against every subnet at three hardware tiers: the 80GB '
    'datacenter class (H100/A100), the 141GB H200 class, and the 180GB+ B300 class. Each tier '
    'was scored with the exact owned-basis formula the app uses in the browser (55 percent '
    'earn-pick, 25 percent diligence, 20 percent confidence, gated by rig fit and diligence '
    'hard rules). The result is unambiguous: adding memory unlocks rentable subnets almost '
    'linearly but unlocks <b>earning</b> subnets barely at all. The 141GB band adds exactly '
    'one new RUN (SayGM at conviction 57, EV $266 per month), and the 180GB band adds none.'))
tier_tbl = make_table(
    ['Hardware tier', 'Rentable subnets', 'RUN verdicts', 'What the extra memory unlocks'],
    [['96GB (RTX PRO 6000)', '82 of 128', '4', 'REAX (SN92) — the only broad-seat GPU mining RUN'],
     ['80GB (H100 / A100)', '82 of 128', '4', 'Same four RUNs: Noah, Hone, REAX, CliqueAI'],
     ['141GB (H200)', '124 of 128', '5', 'One new RUN: SayGM (SN28), conviction 57, EV $266/mo'],
     ['180GB+ (B300)', '128 of 128', '5', 'No new RUN — lium.io (SN51) scores AVOID 30 for mining']],
    [0.22, 0.16, 0.13, 0.49], left_cols=(0, 3))
story.extend(safe_keep([tier_tbl, Spacer(1, 6),
                        Paragraph('Table 1: Conviction-engine scan across hardware tiers (live chain data, 128 subnets, October 2026).', caption)]))
story.append(Spacer(1, 12))
story.append(P(
    'The pattern behind Table 1 is structural rather than temporary. Forty-four GPU subnets '
    'now require 141-180GB fleet hardware such as 8x H200 or 8x B300 nodes, which places '
    'GPU emissions firmly in institutional territory. Inside the tiers an individual can '
    'reach, reward concentration is severe: Chutes pays only 7 percent of its miners and its '
    'top ten UIDs capture 100 percent of incentive flow. A single operator buying retail '
    'hardware is therefore competing for the one broad-seat subnet (REAX, 92 percent rewarded, '
    'top-10 share 58 percent) plus the option to host.'))

story.append(Paragraph('2.2 What the same cards earn from hosting', h2))
story.append(P(
    'Hosting flips the economics. The lium.io marketplace pays GPU providers by the hour, '
    'with a validator idle-pool that keeps paying soft-limit rates when a card is unrented. '
    'The measured trailing-30-day earnings per card are shown in Figure 1. The H200 earns the '
    'most per card among affordable options ($3,118 per month at 89 percent occupancy) and '
    'carries the largest idle-pool weight (0.56, meaning idle H200 hours keep earning). The '
    'used H100 earns $1,388 per month at 72 percent occupancy with a realized rate of $1.92 '
    'per rental hour — and crucially, used H100s trade for roughly half the price of an H200.'))
story.append(Spacer(1, 24))
img1 = embed_image(f'{ASSETS}/dcplan_hosting_yield.png', max_height=270)
story.extend(safe_keep([img1, Spacer(1, 8),
                        Paragraph('Figure 1: Measured per-card hosting earnings, USD per GPU-month, trailing 30 days to 2026-10-23 (source: lium.io provider tables scraped by the Infranex BT engine).', caption)]))
story.append(Spacer(1, 24))
host_tbl = make_table(
    ['GPU', 'Earn $/GPU-mo', 'Listed / rented', 'Occupancy', 'Realized $/hr', 'Idle weight', 'Street price'],
    [['B300 (288GB)', '$6,238', '273 / 242', '81%', '$8.34', '0.05', '~$55,000'],
     ['H200 (141GB)', '$3,118', '170 / 153', '89%', '$4.05', '0.56', '$31,000-40,000'],
     ['H100 (80GB)', '$1,388', '289 / 160', '72%', '$1.92', 'none', '$15,000-28,000 used'],
     ['PRO 6000 Server', '$1,092', '162 / 145', '87%', '$1.43', '0.025', '$16,600-20,200'],
     ['PRO 6000 WS', '$942', '20 / 19', '95%', '$1.24', '0.027', '~$16,000'],
     ['A100 (80GB)', '$778', '54 / 46', '67%', '$1.22', 'none', '~$12,000-18,900'],
     ['RTX 6000 Ada', '$599', '41 / 39', '80%', '$0.78', 'none', '~$6,800']],
    [0.185, 0.135, 0.14, 0.115, 0.13, 0.115, 0.18], left_cols=(0, 6))
story.extend(safe_keep([host_tbl, Spacer(1, 6),
                        Paragraph('Table 2: Hosting marketplace economics per card. Earnings are measured trailing-30d provider income including idle-pool pay; prices are October 2026 secondary-market research.', caption)]))
story.append(Spacer(1, 12))
story.append(P(
    'Two comparisons in Table 2 decide the build. A used H100 earns 27 percent more per month '
    'hosting ($1,388) than a new RTX PRO 6000 Server ($1,092) while costing a similar amount '
    'or less on the secondary market, because its 80GB of HBM3e remains the reference card for '
    'inference tenants. And every card\'s hosting yield comfortably exceeds its subnet mining '
    'expected value: $1,388 hosting versus $453 mining EV for the H100, $3,118 versus $266 '
    'for the H200. That ratio, not enthusiasm, is why the recommended strategy is '
    'host-first with a data-triggered mining option.'))

# =========== 3. Recommended build ===========
story.extend(h1_block('3. Recommended Build: The Twin-Hopper Node'))
story.append(P(
    'The Twin-Hopper node pairs two used H100 PCIe 80GB cards in a single used 4U server. '
    'Two cards rather than one gives the balanced 50/50 strategy a physical form: card one is '
    'the <b>anchor slot</b>, hosted continuously for stable base income, while card two is the '
    '<b>flex slot</b> — hosted by default, but switchable to subnet mining whenever the app\'s '
    'daily re-score finds a subnet whose expected value beats the hosting day-rate (about '
    '$45 per day for an H100 at measured rates). Two cards also halve the blast radius of any '
    'single-card failure and allow staged purchasing across the 3-6 month window.'))
story.append(P(
    'The H100 PCIe was chosen over the alternatives for three verifiable reasons. It has the '
    'best earnings-per-dollar of any card under $50k (Table 2): roughly $1,388 per month for '
    'a $15,000-16,500 used card, a 12-14 month gross payback. It fits a standard PCIe slot '
    'and 700W budget, so it runs in a conventional used server rather than an SXM chassis. '
    'And it retains a deep resale market: CoreWeave-era H100 contracts reportedly rebooked at '
    '95 percent of original pricing, and refurb cards hold mid-80s percent of new value, which '
    'caps depreciation risk while Blackwell supply is constrained.'))
bom_tbl = make_table(
    ['Component', 'Specification', 'Est. cost'],
    [['2x NVIDIA H100 PCIe 80GB', 'Used, verified hours, seller warranty preferred ($15,500-16,500 each)', '$31,000'],
     ['4U server chassis + mainboard', 'Used Supermicro / Dell, 2x PCIe 4.0 x16, dual 1600W PSU, 32-core Xeon or EPYC included', '$3,500'],
     ['System memory', '256GB ECC DDR4/DDR5 (8x 32GB)', '$900'],
     ['Storage', '2x 2TB NVMe (raid1) + 1x 4TB SATA for logs/weights', '$400'],
     ['Networking', '10GbE switch + 2x SFP+ NICs with DAC cables', '$450'],
     ['Power infrastructure', 'Metered PDU + 3kVA line-interactive UPS', '$700'],
     ['Rack + airflow', '12U open-frame rack, shelf, high-static-pressure intake fans and filters', '$250'],
     ['Cables, spares, thermal paste, misc', 'PCIe risers not required; power adapters as needed', '$300'],
     ['Contingency (about 1.5%)', 'Price movement between quote and purchase', '$500'],
     ['<b>Hardware total</b>', '<b>of $50,000 budget — leaves $12,000 operating buffer</b>', '<b>$38,000</b>']],
    [0.30, 0.52, 0.18], left_cols=(0, 1))
story.extend(safe_keep([bom_tbl, Spacer(1, 6),
                        Paragraph('Table 3: Twin-Hopper bill of materials. Prices are October 2026 secondary-market midpoints; the $12,000 buffer equals the 75/25 capital split.', caption)]))
story.append(Spacer(1, 12))
story.append(Paragraph('3.1 Home deployment requirements', h2))
story.append(P(
    'At full load the node draws approximately 1.65 kilowatts (2x 700W cards plus a 250W '
    'system), which averages near 1.2kW with hosting duty cycles — about 880 kWh per month or '
    '$106 at your $0.12 per kWh rate. Two dedicated 120V 20A circuits (or one 240V circuit) '
    'are required; have an electrician confirm breaker headroom before ordering hardware. '
    'The node dissipates roughly 1.4kW of heat, equivalent to a small space heater: plan for '
    'exhaust ducting or a through-wall fan in summer, and expect the UPS to bridge brief '
    'outages only, not sustained ones. Noise from 4U high-static fans is significant, so a '
    'garage, basement, or insulated closet is the realistic placement.'))
story.append(P(
    'Network requirements are modest for hosting: lium tenants typically pull model weights '
    'once and then stream tokens, so symmetric 100Mbps upstream suffices and 1Gbps fiber is '
    'comfortable. A stable public IP or IPv6 prefix with inbound port forwarding is needed for '
    'the marketplace handshake, and the machine should run headless with out-of-band or '
    'remote management so reboots never require physical presence. Uptime is the product: '
    'the difference between 95 percent and 80 percent availability is roughly $350 per month '
    'at measured rates, which is why the UPS, remote management, and automatic re-listing '
    'scripts are in the bill of materials rather than treated as extras.'))

# =========== 4. Alternatives ===========
story.extend(h1_block('4. Alternatives Considered'))
story.append(P(
    'Three alternative builds were evaluated against the same budget and constraints before '
    'settling on the Twin-Hopper. The single H200 NVL is the strongest per-card earner and '
    'unlocks the SayGM RUN, but it concentrates $33,000 in one card with no redundancy and no '
    'parallel mining slot. Two RTX PRO 6000 Server cards give the newest silicon and a 96GB '
    'frame buffer, but at real October 2026 street prices ($16,600-20,200 each) they earn '
    '27 percent less per month than used H100s and push payback past 19 months. Eight consumer '
    'RTX 5090s reach the budget but inherit consumer drivers, 32GB frame buffers, and the '
    'lowest hosting yield in the catalog ($464 per card), making them uncompetitive.'))
alt_tbl = make_table(
    ['Build', 'Capex', 'Net $/mo (base)', 'Payback', 'Key trade-off'],
    [['<b>Twin-Hopper: 2x used H100 PCIe</b>', '$38,000', '$2,645', '~14 mo', 'Best earnings-per-dollar; two independent slots; 80GB VRAM ceiling'],
     ['Single H200 NVL (141GB)', '~$38,000', '$3,065', '~13 mo', 'Highest per-card yield + idle pool; single point of failure; no parallel slot'],
     ['2x PRO 6000 Blackwell Server', '~$38,000', '$2,079', '~19 mo', 'Newest silicon, 96GB; 27% lower hosting yield; TEE option unused (plain-GPU mandate)'],
     ['8x RTX 5090 (consumer)', '~$37,000', '$1,700 est.', '~22 mo', 'Cheapest per card but consumer-class reliability and lowest $/card yield']],
    [0.27, 0.12, 0.15, 0.11, 0.35], left_cols=(0, 4))
story.extend(safe_keep([alt_tbl, Spacer(1, 6),
                        Paragraph('Table 4: Alternative builds compared on base-case hosting economics. Net figures subtract electricity at $0.12/kWh; breakeven divides hardware capex by base net income.', caption)]))
story.append(Spacer(1, 12))
story.append(P(
    'A fifth option — buying nothing and running only CPU subnets on a rented VPS — remains '
    'valid and is actually step one of the execution plan regardless of the hardware decision. '
    'If maximizing raw dollar return per invested dollar were the only objective, the VPS path '
    'would win outright, because Noah\'s engine expected value ($13,933 per month) dwarfs '
    'anything the GPU hardware earns. The datacenter is therefore justified as a '
    '<b>diversified income stack</b> — hosting floor plus mining optionality plus ownership of '
    'appreciating scarce silicon — rather than as the single best use of $50,000.'))

# =========== 5. Earnings model ===========
story.extend(h1_block('5. Earnings Model and Payback Scenarios'))
story.append(P(
    'The base case uses the measured trailing-30-day H100 economics without optimism: '
    '$1,388 per card per month (72 percent occupancy, $1.92 realized hourly rate), duplicated '
    'across two cards, minus $106 of electricity and $25 of miscellaneous costs (static IP, '
    'backup storage, marketplace fees). That produces $2,645 of net monthly income and a '
    '14-month breakeven on $38,000 of hardware. The bull case applies the observed above-limit '
    'asks (hosts listing H100 capacity at $2.50-3.13 per hour during demand spikes) at 90 '
    'percent occupancy, reaching $3,180 net and a 12-month breakeven. The bear case halves the '
    'measured earnings — a reasonable proxy for new-tenant scarcity as H200 and Blackwell '
    'supply grows — and yields $1,270 net, breakeven at roughly 30 months.'))
scen_tbl = make_table(
    ['Scenario', 'Assumptions', 'Gross $/mo', 'Net $/mo', 'Payback'],
    [['Bear', 'Measured earnings -50% (demand shifts to newer silicon)', '$1,400', '$1,270', '~30 mo'],
     ['<b>Base</b>', '<b>Measured trailing-30d rates (72% occ, $1.92/hr), both cards hosted</b>', '<b>$2,776</b>', '<b>$2,645</b>', '<b>~14 mo</b>'],
     ['Bull', '90% occupancy at $2.50/hr market-ask pricing', '$3,285', '$3,180', '~12 mo']],
    [0.12, 0.46, 0.14, 0.14, 0.14], left_cols=(1,))
story.extend(safe_keep([scen_tbl, Spacer(1, 6),
                        Paragraph('Table 5: Payback scenarios for the Twin-Hopper build. Net figures subtract $106 electricity and $25 miscellaneous monthly costs.', caption)]))
story.append(Spacer(1, 24))
img2 = embed_image(f'{ASSETS}/dcplan_payback.png', max_height=260)
story.extend(safe_keep([img2, Spacer(1, 8),
                        Paragraph('Figure 2: Cumulative net cashflow by month. The bear case does not cross zero within the 24-month window shown; bull and base breakeven at months 12 and 14.', caption)]))
story.append(Spacer(1, 24))
story.append(P(
    'Subnet mining income is deliberately excluded from these tables because its expected '
    'value today ($453 per month per card on REAX) is below the hosting yield it would '
    'displace. The honest way to treat mining is as a free option exercised only when the '
    'data flips: if a subnet\'s new-entrant EV rises above the card\'s hosting rate — through '
    'reward-distribution broadening, a new broad-seat launch, or a sharp TAO price move — the '
    'flex card switches and the model updates. At TAO $247, holding one mid-pack REAX seat at '
    'the mid-pack P&L ($897 net per month) would also beat hosting; the engine tracks this '
    'threshold daily so the decision never depends on guesswork.'))

# =========== 6. Execution ===========
story.extend(h1_block('6. Staged Execution Plan (Months 0-6)'))
story.append(P(
    'The staged path spends Phase 0 money immediately (it is tiny), defers GPU capital until '
    'the first rental month validates the platform, and uses the operating buffer for '
    'ramp-month costs and registration burns. Each phase has a measurable exit condition, so '
    'the plan can pause between phases without stranding capital. This converts the 3-6 month '
    'timeline into a sequence of evidence gates rather than a single leap.'))
phase_tbl = make_table(
    ['Phase', 'When', 'Actions', 'Capital at risk'],
    [['<b>0. CPU-first</b>', 'Week 1', 'Rent VPS (~$40-80/mo); register and run the CPU RUN list: Noah (SN82, 16/82 seats open), Hone (SN5), CliqueAI (SN83); wire the app as the daily monitor', '$80 + first burns'],
     ['<b>1. Anchor card</b>', 'Weeks 2-6', 'Buy 1x used H100 + server + infra (~$22,000); validate card health (memtest, thermal, hours); list on lium at soft-limit $1.39; measure real occupancy for 30 days', '~$22,000'],
     ['<b>2. Flex card</b>', 'Months 2-4', 'On 30d occupancy at or above 60% and payouts verified: buy 2nd H100 ($15,500-16,500); enable flex-slot mining automation (flip rule)', '~$16,500'],
     ['<b>3. Optimize</b>', 'Months 4-6', 'Tune pricing (soft-limit vs market-ask by day), add monitoring alerts, evaluate REAX/SayGM seats vs hosting rate monthly, build the depreciation reserve', 'from buffer']],
    [0.14, 0.11, 0.55, 0.20], left_cols=(0, 2, 3))
story.extend(safe_keep([phase_tbl, Spacer(1, 6),
                        Paragraph('Table 6: Staged execution with exit conditions. Phase 2 proceeds only if Phase 1 validates occupancy; each later phase can pause without stranding earlier capital.', caption)]))
story.append(Spacer(1, 12))
story.append(P(
    'Two practical notes belong in the plan rather than in footnotes. Registration burns on '
    'hot subnets can reach meaningful TAO amounts, and the $12,000 buffer exists partly to '
    'absorb them without touching hardware money. And the VPS subnets from Phase 0 will '
    'likely pay for the entire GPU build over its payback window if their current seat '
    'economics hold — which is precisely why Phase 0 is scheduled first and monitored daily '
    'rather than treated as an afterthought.'))

# =========== 7. Risks ===========
story.extend(h1_block('7. Risks and Mitigations'))
risk_tbl = make_table(
    ['Risk', 'Likelihood', 'Impact', 'Mitigation'],
    [['Rental rates decay as H200/B200 supply grows', 'Medium', 'High', 'Bear case priced at -50%; H100 holds value via refurb market; flex slot flips to mining when EV crosses hosting rate'],
     ['Occupancy below 60% in early months', 'Medium', 'Medium', 'Idle-pool soft-limit pricing keeps idle pay flowing; Phase 2 gated on real occupancy data'],
     ['Used-card health (mined hours, thermal wear)', 'Medium', 'High', 'Buy from sellers with hour verification and warranty; burn-in memtest + 72h stability loop before listing'],
     ['TAO price drawdown cuts subnet income', 'High', 'Medium', 'Hosting income is USD-denominated; buffer sized at $12k; no leverage anywhere in the plan'],
     ['Home power/cooling events trip the node', 'Medium', 'Low-Medium', 'Dedicated circuits + UPS + auto-restart + remote management; availability target 95%'],
     ['Marketplace / validator policy change', 'Low', 'Medium', 'Multi-marketplace listing (lium + Vast.ai class alternatives); no exclusive dependence'],
     ['Registration burn loss on full subnets', 'Medium', 'Low', 'Only register subnets with free seats or positive EV; engine gates registrations daily']],
    [0.30, 0.12, 0.12, 0.46], left_cols=(0, 3))
story.extend(safe_keep([risk_tbl, Spacer(1, 6),
                        Paragraph('Table 7: Risk register with mitigations. The two structural risks — silicon depreciation and rental-rate decay — are priced into the bear case rather than assumed away.', caption)]))
story.append(Spacer(1, 12))
story.append(P(
    'The single risk that deserves standing attention is rental-rate decay. The hosting '
    'market\'s yield curve rewards the newest memory class: B300 cards earned 4.5 times the '
    'H100 rate in the measured window. As Blackwell fleets multiply, H100 hourly rates will '
    'face downward pressure; the plan\'s defense is that used H100 capital cost also fell into '
    'the $15,000-16,500 band precisely because of that trend, so the yield-on-cost remains '
    'competitive even as absolute rates drift. The engine\'s daily scrape of marketplace '
    'economics makes this trend measurable month over month instead of discovered at renewal '
    'time.'))

# =========== 8. Monitoring ===========
story.extend(h1_block('8. Monitoring and the Mining Flip Rule'))
story.append(P(
    'The Infranex BT app is the operating console for this datacenter, and its daily re-score '
    'is what turns a static hardware purchase into a responsive income stack. Three monitors '
    'matter. First, the <b>hosting rate tracker</b>: the engine already scrapes lium.io '
    'economics daily, so H100 yield per card and occupancy can be charted month over month '
    'against the $1,388 baseline. Second, the <b>mining flip rule</b>: when any subnet reachable '
    'by an 80GB card posts a new-entrant expected value above the hosting day-rate (about '
    '$45 per day), the flex slot mines instead of hosting; today no subnet passes this gate, '
    'and the app\'s Opportunities tab is the place to watch it. Third, the <b>CPU subnet '
    'watch</b>: Noah, Hone, and CliqueAI seat counts and EVs change weekly, and their combined '
    'income currently exceeds the GPU node\'s by several multiples.'))
story.append(P(
    'A simple monthly review closes the loop. Compare realized hosting income per card with '
    'the $1,388 baseline; if two consecutive months print below 70 percent of baseline, move '
    'pricing to market-ask, evaluate listing on a second marketplace, and re-run the '
    'engine\'s tier scan for any newly reachable RUN subnet. If a subnet flips to RUN with EV '
    'above the hosting rate, move the flex card within the same week, because seat dynamics on '
    'broad subnets reward early registration. The plan\'s numbers will drift with the chain; '
    'the discipline that keeps it profitable is checking those drifts against these written '
    'thresholds rather than from memory.'))

# ---------------- build ----------------
doc = TocDocTemplate(OUT_BODY, pagesize=A4,
                     leftMargin=MARGIN, rightMargin=MARGIN,
                     topMargin=MARGIN, bottomMargin=MARGIN,
                     title='Mini GPU Datacenter Investment Plan',
                     author='Z.ai', creator='Z.ai',
                     subject='Bittensor subnet earning infrastructure — staged build plan under $50k')
doc.multiBuild(story, onFirstPage=page_decor, onLaterPages=page_decor)
print('body built:', OUT_BODY)

# ---------------- merge cover + body ----------------
from pypdf import PdfReader, PdfWriter
A4_W, A4_H = 595.28, 841.89

def normalize(page):
    w, hgt = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - A4_W) > 0.1 or abs(hgt - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page

writer = PdfWriter()
cover = PdfReader(f'{ASSETS}/dcplan_cover.pdf').pages[0]
writer.add_page(normalize(cover))
for pg in PdfReader(OUT_BODY).pages:
    writer.add_page(normalize(pg))
writer.add_metadata({'/Title': 'Mini GPU Datacenter Investment Plan',
                     '/Author': 'Z.ai', '/Creator': 'Z.ai',
                     '/Subject': 'Bittensor subnet earning infrastructure — staged build plan under $50k'})
FINAL = '/home/z/my-project/download/Mini_GPU_Datacenter_Investment_Plan.pdf'
os.makedirs(os.path.dirname(FINAL), exist_ok=True)
with open(FINAL, 'wb') as f:
    writer.write(f)
print('final:', FINAL)
