#!/usr/bin/env python3
"""Bittensor Subnet Earning Chances - CPU Mining Report (English).
Report pipeline: ReportLab body + HTML/Playwright cover merged via pypdf.
Follows skills/pdf/briefs/report.md + typesetting rules.
"""
import os
import sys
import hashlib

PDF_SKILL_DIR = '/home/z/my-project/skills/pdf'
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, 'scripts'))

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, PageBreak, Image, KeepTogether,
                                CondPageBreak, HRFlowable)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from PIL import Image as PILImage

# ------------------------------------------------------------------
# Fonts (allowed set only)
# ------------------------------------------------------------------
FONT_DIR = '/usr/share/fonts'
pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))

registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold',
                   italic='FreeSerif-Italic', boldItalic='FreeSerif-BoldItalic')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

from pdf import install_font_fallback
install_font_fallback()

# ------------------------------------------------------------------
# Cascade palette (palette.cascade --seed 42 --mode minimal)
# ------------------------------------------------------------------
PAGE_BG       = colors.HexColor('#f5f5f4')
SECTION_BG    = colors.HexColor('#f2f1f0')
CARD_BG       = colors.HexColor('#ebeae8')
TABLE_STRIPE  = colors.HexColor('#ededeb')
HEADER_FILL   = colors.HexColor('#4e4732')
COVER_BLOCK   = colors.HexColor('#746c56')
BORDER        = colors.HexColor('#c5bfac')
ICON          = colors.HexColor('#a48e4b')
ACCENT        = colors.HexColor('#92761f')
ACCENT_2      = colors.HexColor('#3aa0c2')
TEXT_PRIMARY  = colors.HexColor('#151513')
TEXT_MUTED    = colors.HexColor('#7e7c74')
SEM_ERROR     = colors.HexColor('#a25b54')

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

# ------------------------------------------------------------------
# Page geometry (symmetric margins)
# ------------------------------------------------------------------
PAGE_W, PAGE_H = A4
MARGIN = 0.9 * inch
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
H1_ORPHAN = AVAIL_H * 0.25
MAX_KEEP = PAGE_H * 0.4

ASSETS = '/home/z/my-project/scripts/report_assets'
BODY_PDF = os.path.join(ASSETS, 'body.pdf')

# ------------------------------------------------------------------
# Styles
# ------------------------------------------------------------------
S = {}
S['body'] = ParagraphStyle('Body', fontName='FreeSerif', fontSize=10.5,
                           leading=17, alignment=TA_JUSTIFY,
                           textColor=TEXT_PRIMARY, spaceBefore=0, spaceAfter=10)
S['bullet'] = ParagraphStyle('Bullet', parent=S['body'], alignment=TA_LEFT,
                             leftIndent=18, bulletIndent=6, spaceAfter=5)
S['h1'] = ParagraphStyle('H1', fontName='FreeSerif', fontSize=22, leading=27,
                         textColor=HEADER_FILL, spaceBefore=0, spaceAfter=4)
S['h2'] = ParagraphStyle('H2', fontName='FreeSerif', fontSize=15, leading=20,
                         textColor=TEXT_PRIMARY, spaceBefore=14, spaceAfter=8)
S['kicker'] = ParagraphStyle('Kicker', fontName='FreeSerif', fontSize=10,
                             leading=14, textColor=TEXT_MUTED, spaceAfter=2)
S['caption'] = ParagraphStyle('Caption', fontName='FreeSerif', fontSize=8.5,
                              leading=12, alignment=TA_CENTER,
                              textColor=TEXT_MUTED, spaceBefore=3, spaceAfter=6)
S['quote'] = ParagraphStyle('Quote', fontName='FreeSerif-Italic', fontSize=11,
                            leading=17, textColor=HEADER_FILL,
                            alignment=TA_LEFT, leftIndent=6)
S['th'] = ParagraphStyle('TH', fontName='FreeSerif', fontSize=9.5, leading=13,
                         textColor=colors.white, alignment=TA_CENTER)
S['td'] = ParagraphStyle('TD', fontName='FreeSerif', fontSize=9, leading=13,
                         textColor=TEXT_PRIMARY, alignment=TA_CENTER)
S['tdl'] = ParagraphStyle('TDL', parent=S['td'], alignment=TA_LEFT)
S['stat'] = ParagraphStyle('Stat', fontName='FreeSerif', fontSize=20,
                           leading=24, textColor=ACCENT, alignment=TA_CENTER)
S['statlab'] = ParagraphStyle('StatLab', fontName='FreeSerif', fontSize=8,
                              leading=11, textColor=TEXT_MUTED,
                              alignment=TA_CENTER)
S['code'] = ParagraphStyle('Code', fontName='DejaVuSans', fontSize=8.5,
                           leading=13, textColor=TEXT_PRIMARY,
                           alignment=TA_LEFT)
S['toc_t'] = ParagraphStyle('TOCTitle', fontName='FreeSerif', fontSize=20,
                            leading=26, textColor=HEADER_FILL, spaceAfter=14)
S['toc0'] = ParagraphStyle('TOCH1', fontName='FreeSerif', fontSize=11.5,
                           leading=20, leftIndent=6, textColor=TEXT_PRIMARY)
S['toc1'] = ParagraphStyle('TOCH2', fontName='FreeSerif', fontSize=10,
                           leading=16, leftIndent=26, textColor=TEXT_MUTED)

# ------------------------------------------------------------------
# Doc template with TOC support
# ------------------------------------------------------------------
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            # Body-relative page number (TOC page itself is front matter 'i')
            self.notify('TOCEntry', (level, text, self.page - 1, key))


def on_page(canvas, doc):
    canvas.saveState()
    # Header: muted title + accent rule
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 42,
                      'BITTENSOR SUBNET MINING INTELLIGENCE')
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 48, PAGE_W - MARGIN, PAGE_H - 48)
    # Footer: light rule + author + page number (no denominator)
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 42, PAGE_W - MARGIN, 42)
    canvas.setFont('FreeSerif', 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 30, 'Infranex BT Intelligence Platform')
    label = 'i' if doc.page == 1 else str(doc.page - 1)
    canvas.drawRightString(PAGE_W - MARGIN, 30, label)
    canvas.restoreState()

# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def heading(text, style, level=0):
    key = 'h_%s' % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/><b>%s</b>' % (key, text), style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p


def safe_keep(elements):
    total = 0
    for el in elements:
        w, h = el.wrap(AVAIL_W, PAGE_H)
        total += h
    if total <= MAX_KEEP:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    return list(elements)


def h1_block(num, title, first_para_text):
    head = heading('%d. %s' % (num, title), S['h1'], level=0)
    rule = HRFlowable(width='100%', thickness=1.2, color=ACCENT,
                      spaceBefore=2, spaceAfter=10)
    first = Paragraph(first_para_text, S['body'])
    out = [CondPageBreak(H1_ORPHAN)]
    out += safe_keep([head, rule, first])
    return out


def h2_block(num, title, first_el):
    head = heading('%s %s' % (num, title), S['h2'], level=1)
    return safe_keep([head, first_el])


def body(text):
    return Paragraph(text, S['body'])


def bullet(text):
    return Paragraph(text, S['bullet'], bulletText='\u2022')


def make_table(header, rows, ratios, style_extra=None, font=9):
    tdst = ParagraphStyle('TDx%d' % font, parent=S['td'], fontSize=font,
                          leading=font + 4)
    tdlst = ParagraphStyle('TDLx%d' % font, parent=S['tdl'], fontSize=font,
                           leading=font + 4)
    data = [[Paragraph('<b>%s</b>' % c, S['th']) for c in header]]
    for r in rows:
        row = []
        for i, c in enumerate(r):
            st = tdlst if i == 1 or (isinstance(c, str) and len(c) > 28) else tdst
            row.append(Paragraph(str(c), st))
        data.append(row)
    widths = [x * AVAIL_W for x in ratios]
    assert sum(widths) <= AVAIL_W + 0.5, 'table overflow'
    t = Table(data, colWidths=widths, hAlign='CENTER', repeatRows=1)
    cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        cmds.append(('BACKGROUND', (0, i), (-1, i),
                     TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD))
    if style_extra:
        cmds += style_extra
    t.setStyle(TableStyle(cmds))
    return t


def table_block(title_text, tbl, caption_text, keep=True):
    cap = Paragraph(caption_text, S['caption'])
    out = [Spacer(1, 12)]
    if keep and len(tbl._cellvalues) <= 15:
        out += safe_keep([tbl, cap])
    else:
        out += [tbl, cap]
    out.append(Spacer(1, 10))
    return out


def callout_row(stats):
    boxes = []
    for value, label in stats:
        inner = Table(
            [[Paragraph('<b>%s</b>' % value, S['stat'])],
             [Paragraph(label, S['statlab'])]],
            colWidths=[104])
        inner.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
            ('BOX', (0, 0), (-1, -1), 1, ACCENT),
            ('TOPPADDING', (0, 0), (-1, 0), 9),
            ('BOTTOMPADDING', (0, -1), (-1, -1), 9),
            ('TOPPADDING', (0, -1), (-1, -1), 2),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        boxes.append(inner)
    wrap = Table([boxes], colWidths=[AVAIL_W / len(stats)] * len(stats),
                 hAlign='CENTER')
    wrap.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]))
    return wrap


def quote_block(text):
    q = Table([[Paragraph(text, S['quote'])]], colWidths=[AVAIL_W * 0.9],
              hAlign='CENTER')
    q.setStyle(TableStyle([
        ('LINEBEFORE', (0, 0), (0, 0), 2, ICON),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return q


def code_block(lines):
    paras = [Paragraph(l, S['code']) for l in lines]
    inner = Table([[p] for p in paras], colWidths=[AVAIL_W * 0.86],
                  hAlign='CENTER')
    inner.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
        ('LINEBEFORE', (0, 0), (0, -1), 2, ACCENT),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 8),
        ('TOPPADDING', (0, 1), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -2), 1),
    ]))
    return inner


def embed_image(path, max_width=None, max_height=None):
    if max_width is None:
        max_width = AVAIL_W
    if max_height is None:
        max_height = A4[1] * 0.35
    pil = PILImage.open(path)
    ow, oh = pil.size
    ratio = min(max_width / ow if ow > max_width else 1.0,
                max_height / oh if oh > max_height else 1.0)
    return Image(path, width=ow * ratio, height=oh * ratio)


def chart_block(png, caption_text):
    img = embed_image(os.path.join(ASSETS, png), max_height=250)
    cap = Paragraph(caption_text, S['caption'])
    return [Spacer(1, 16)] + safe_keep([img, cap]) + [Spacer(1, 12)]

# ------------------------------------------------------------------
# Story
# ------------------------------------------------------------------
story = []

# --- TOC page (front matter, roman footer) ---
story.append(Paragraph('<b>Table of Contents</b>', S['toc_t']))
toc = TableOfContents()
toc.levelStyles = [S['toc0'], S['toc1']]
story.append(toc)
story.append(PageBreak())

# === CONTENT ===

# ---- Chapter 1: Executive Summary ----
story += h1_block(1, 'Executive Summary',
    'This report answers a deceptively simple question for a prospective Bittensor miner: '
    'which subnets give a new entrant a realistic chance to earn rewards, and which one is '
    'the best CPU mining target right now? Every figure below is computed from the live chain '
    'snapshot captured by the Infranex BT platform at block 9,268,890, with TAO trading at '
    '$281.68 and 129 subnets registered on chain. Of those, 124 subnets have active miner '
    'emission and were scored. Each subnet was evaluated on four factors: seat availability, '
    'reward breadth among registered miners, incentive concentration among the top ten UIDs, '
    'and the per-miner share of the daily miner emission pool.')
story.append(body(
    'The headline finding is uncomfortable but clarifying: <b>not a single subnet on the '
    'network is simultaneously open-seat and broadly rewarding</b>. Tier A, the class of '
    'subnets where a newcomer can register freely and immediately receive a fair share of '
    'emissions, is empty. Roughly 98 of the 124 emitting subnets are either full or '
    'whale-dominated, and all ten subnets that do have free seats pay one to four winning '
    'miners essentially the entire pool. In practical terms, the era of "register and earn" '
    'is over; earning on Bittensor in October 2026 is a displacement game, where a new miner '
    'burns registration TAO, takes the seat of the weakest incumbent, and must outperform '
    'quickly to keep it.'))
story.append(body(
    'Within that displacement game, one CPU-only subnet stands out: <b>SN61 RedTeam</b>, the '
    'only subnet the platform\'s own opportunity picker rates PRIME. It combines the largest '
    'per-miner reward pool of any meritocratic CPU subnet (about $2,206 per average earning '
    'miner per month), a healthy 132 rewarded miners, a modest top-10 share of 26 percent, '
    'and the longest immunity window on chain at roughly 48 hours. Its realistic '
    'new-entrant expectation is approximately $574 per month net after the bond ramp. The '
    'recommended strategy is to enter SN61 as the primary target and add the two cheapest '
    'meritocratic subnets, SN101 Tag101 and SN83 CliqueAI, on the same machine for a total '
    'at-risk registration budget of roughly $80.'))
story.append(Spacer(1, 8))
story.append(callout_row([
    ('0', 'subnets that are open-seat AND broadly rewarding (Tier A)'),
    ('124', 'emitting subnets audited at block 9,268,890'),
    ('$574', 'SN61 RedTeam realistic new-entrant EV per month'),
    ('~$80', 'total burn budget for the recommended SN61 + SN101 + SN83 trio'),
]))
story.append(Spacer(1, 6))

# ---- Chapter 2: Market Snapshot and Scoring Methodology ----
story += h1_block(2, 'Market Snapshot and Scoring Methodology',
    'The analysis window is the live chain snapshot taken on October 12, 2026 at 18:23 UTC '
    'and published by the Infranex BT chain scanner. At that block the network hosted 129 '
    'subnets, of which 120 carry an on-chain identity name and 124 pay miner emissions. '
    'Total miner-side emission across those subnets is distributed extremely unevenly: a '
    'handful of flagship subnets such as SN5 Hone, SN61 RedTeam and SN120 Affine move tens '
    'of TAO per day to miners, while dozens of recently registered subnets emit only '
    'fractions of a TAO to a single dominant operator. The table below summarises the '
    'market state that the rest of this report reasons from.')
story += table_block('', make_table(
    ['Metric', 'Value'],
    [
        ['Chain block at snapshot', '9,268,890 (live, chain scanner)'],
        ['TAO price', '$281.68'],
        ['Registered subnets / named / emitting', '129 / 120 / 124'],
        ['Tier A subnets (open + broad rewards)', '0'],
        ['Tier B subnets (open seats, whale lottery)', '10'],
        ['Tier C subnets (full but meritocratic)', '16'],
        ['Tier D subnets (whale-dominated or full)', '98'],
        ['Typical immunity window', '7,200 blocks (about 24 hours)'],
    ],
    [0.52, 0.48]),
    'Table 1: Market snapshot at block 9,268,890, October 12, 2026.')
story.append(body(
    'Scoring a subnet on "chance to earn" requires different mechanics than scoring it on '
    'headline yield. The single most common mistake a new miner makes is reading a subnet\'s '
    'total miner emission, dividing by all registered miners, and assuming that is the '
    'reward waiting for them. When only one miner is actually rewarded, that arithmetic '
    'produces fantasy numbers such as the $494,766 per month frequently quoted for SN108 '
    'ChipForge. This report therefore scores every subnet on four audited factors, each '
    'measurable directly from the chain snapshot, and combines them into a 0-100 chance '
    'score. The factors are deliberately conservative: a subnet only scores well if a '
    'mediocre, non-elite operator can plausibly expect income.'))
story += table_block('', make_table(
    ['Factor', 'What it measures', 'Score weight'],
    [
        ['Seat availability', 'Open UIDs (maxUids minus registered miners); full subnets cap the score and require displacement', '40 points, or capped when full'],
        ['Reward breadth', 'rewardedMiners divided by registered miners; the share of incumbents actually receiving incentive', '25 points at 70%+ breadth, 15 at 40%+, 8 at 15%+'],
        ['Top-10 concentration', 'top10IncentiveShare; how much of all incentive the ten strongest UIDs absorb', '15 points at 50% or less, 8 at 75% or less'],
        ['Per-miner pool', 'minerEmissionTaoPerDay divided by rewardedMiners, converted to USD per month', '20 points at $600+, 12 at $150+, 6 at $30+'],
        ['Realizability', 'rewardRealizability discount when alpha is hard to realise below 0.5', 'minus 10 points'],
    ],
    [0.20, 0.50, 0.30]),
    'Table 2: The four-factor earning-chances score and its weights.')
story.append(body(
    'Two definitional notes keep later chapters honest. First, "average miner reward" '
    'throughout this report means the daily miner emission pool divided by the number of '
    'rewarded miners, not by all registered miners, and then converted at the snapshot TAO '
    'price; it is the income of a merely typical earner, not of a whale. Second, all '
    'subnets discussed as CPU targets were cross-checked against the platform\'s hardware '
    'requirements table so that the recommended rig genuinely meets each subnet\'s stated '
    'needs, which range from plain computation on SN83 to virtualised environments on SN61.'))

# ---- Chapter 3: The Tier Map ----
story += h1_block(3, 'The Tier Map: Where New Miners Can Actually Earn',
    'Sorting the 124 emitting subnets into tiers produces the map every registration '
    'decision should start from. Tier A, the empty tier, would contain subnets with free '
    'seats, broad reward distribution, low concentration and a meaningful per-miner pool; '
    'no subnet currently qualifies, which is the single most important fact in this report. '
    'Tier B contains the ten subnets with free seats whose rewards are nonetheless captured '
    'by one to four miners. Tier C is the practical hunting ground: sixteen full subnets '
    'where 200 or more of the 256 registered miners earn something and the top ten UIDs '
    'take a minority or modest share. Tier D collects the remaining 98 subnets that are '
    'either full and concentrated or dominated by a handful of operators.')
story += chart_block('tier_donut.png',
    'Figure 1: Distribution of the 124 emitting subnets by earning-chances tier. '
    'Tier A is omitted because it contains zero subnets.')
story += table_block('', make_table(
    ['Tier', 'Seats', 'Reward profile', 'Newcomer guidance'],
    [
        ['A', 'Open', 'Broad and low-concentration', 'Empty today; nothing to join and earn'],
        ['B', 'Open', '1-4 winners take ~100% of the pool', 'Free tryouts, not income; join only to compete'],
        ['C', 'Full (256/256)', '78-97% of miners earn; top-10 mostly under 45%', 'Displace the weakest UID; realistic earning path'],
        ['D', 'Mostly full', 'Concentrated or fully saturated', 'Avoid unless elite in that subnet\'s niche'],
    ],
    [0.08, 0.16, 0.38, 0.38]),
    'Table 3: Tier definitions and the recommended posture toward each.')
story.append(body(
    'Because Tier C subnets are full, entry works through Bittensor\'s displacement '
    'mechanic. A newcomer pays the subnet\'s registration burn, and the chain replaces the '
    'lowest-stake UID whose immunity window has expired; the displaced operator loses the '
    'seat. The newcomer then has the immunity period, typically 7,200 blocks or about 24 '
    'hours, and on the best targets up to 14,400 blocks or about 48 hours, to start '
    'earning incentive before becoming the next displacement candidate. The at-risk cost is '
    'therefore the burn plus roughly one to two days of effort, which is why the burns '
    'listed in Chapter 5, between 0.02 and 0.96 TAO, are the true price of admission '
    'tickets.'))
story.append(quote_block(
    'Free seats are free tryouts, not free money: in every open-seat subnet on chain '
    'today, one to four incumbents collect essentially the entire miner pool.'))
story.append(Spacer(1, 4))

# ---- Chapter 4: Best CPU Pick SN61 ----
story += h1_block(4, 'Best CPU Pick: SN61 RedTeam',
    'SN61 RedTeam, operated by Innerworks, is a decentralized security-challenge network. '
    'Miners run isolated agent environments that attempt offensive and defensive '
    'software-engineering tasks posed by validators, and rewards track how well an '
    'operator\'s agents complete those challenges. The workload is pure CPU and memory: '
    'there is no GPU requirement anywhere in the subnet\'s configuration, which makes it '
    'unusual among the high-pool subnets on chain and the natural first target for a '
    'commodity server build. The platform\'s opportunity picker scores it PRIME with a '
    'conviction of 68, the only PRIME rating on the entire network at snapshot time.')
story.append(Spacer(1, 4))
story.append(callout_row([
    ('68', 'picker conviction, the only PRIME pick on chain'),
    ('$1,061', 'average established-miner net per month'),
    ('$574', 'realistic new-entrant net per month'),
    ('48 h', 'immunity window, the longest on chain'),
]))
story.append(Spacer(1, 6))
story.append(body(
    'Three properties put SN61 ahead of every other CPU subnet. First, its miner pool is '
    'the largest among meritocratic CPU targets at about $2,206 per average earning miner '
    'per month, spread across 132 rewarded UIDs rather than a handful. Second, its '
    'concentration profile is healthy: the top ten UIDs absorb only 26 percent of '
    'incentive, so a mid-pack operator earns a meaningful share, and reward realizability '
    'is a perfect 1.00 at an alpha price of $0.0116. Third, entry risk is the lowest on '
    'chain: the registration burn is just 0.135 TAO (about $38) and the 14,400-block '
    'immunity gives a newcomer roughly two days to prove performance, twice the network '
    'norm.'))
story += table_block('', make_table(
    ['Stage', 'Diligence finding', 'What it means for entry'],
    [
        ['s3 - Seats', 'FULL at 256/256', 'Entry requires displacing the weakest eligible UID; budget the 0.135 TAO burn as spendable'],
        ['s4 - Workload', 'Software-engineering agents', 'Skill-gated: expect to tune agent tooling; not a passive box'],
        ['s8 - Validator bond', 'Bond ramp about 7.9 weeks', 'Rewards start low and climb; month-1 income realistically $150-250'],
        ['s9 - Emission trend', 'History still collecting', 'Pool size confidence will improve as the scanner accumulates history'],
        ['s11 - Governance', 'No trust signals yet', 'Standard single-team risk; size the position accordingly'],
    ],
    [0.17, 0.33, 0.50]),
    'Table 4: SN61 diligence stages that did not fully pass, from the platform picker.')
story.append(body(
    'The bond ramp deserves emphasis because it dominates cash-flow planning. Bittensor '
    'validators bond to miner hotkeys gradually, so a newly displaced-in UID earns a small '
    'fraction of the mature rate at first and approaches full weight over roughly eight '
    'weeks on SN61. The $574 new-entrant figure already blends this ramp; an operator who '
    'survives displacement and reaches mid-pack should converge toward the $1,061 '
    'established-miner average. Survival, not registration, is the bottleneck: maintaining '
    'agent performance above the bottom decile is what converts a $38 burn into a '
    'recurring income line.'))

# ---- Chapter 5: CPU Contenders Ranked ----
story += h1_block(5, 'CPU Contenders Ranked',
    'Fourteen emitting subnets qualify as meritocratic CPU targets, meaning at least 20 '
    'distinct miners receive incentive and the top ten UIDs absorb no more than 75 percent '
    'of it. Ranking them by the reward flowing to an average earning miner produces the '
    'profile in Figure 2. The spread is wide: SN61 RedTeam pays roughly nine times what '
    'SN45 AlphaRidge pays a typical earner, while the middle of the table clusters between '
    '$300 and $850 per month. Every subnet in this table is full at 256 of 256 seats, so '
    'each entry assumes the displacement mechanic described in Chapter 3 rather than a '
    'plain registration.')
story += chart_block('cpu_picks.png',
    'Figure 2: Meritocratic CPU subnets ranked by reward per average earning miner, '
    'USD per month at TAO $281.68. SN61 RedTeam is highlighted.')
story += table_block('', make_table(
    ['SN', 'Subnet', 'Workload', 'Earn rate', 'Top-10', 'Avg $/mo', 'Burn TAO'],
    [
        ['61', 'RedTeam', 'Security-challenge agents (Innerworks)', '52%', '26%', '$2,206', '0.135'],
        ['41', 'Almanac', 'Prediction-market research', '42%', '64%', '$1,705', '0.100'],
        ['67', 'Harnyx', 'Deep-research pipelines', '46%', '72%', '$1,299', '0.020'],
        ['5', 'Hone', 'RLVR training environments', '95%', '11%', '$1,291', '0.958'],
        ['78', 'Umi', 'Motion-to-meaning indexing', '42%', '58%', '$814', '0.375'],
        ['83', 'CliqueAI', 'Maximum-clique solver', '94%', '26%', '$809', '0.100'],
        ['105', 'Beam', 'Bandwidth sharing', '82%', '45%', '$621', '0.022'],
        ['50', 'Synth', 'Financial prediction (Mode)', '95%', '32%', '$480', '0.800'],
        ['101', 'Tag101', 'Social-post tagging', '96%', '12%', '$372', '0.046'],
        ['33', 'ReadyAI', 'Consumer AI content', '95%', '14%', '$368', '0.059'],
        ['79', 'MVTRX', 'dTAO exchange infrastructure', '97%', '24%', '$309', '0.115'],
        ['45', 'AlphaRidge', 'Market intelligence feeds', '94%', '60%', '$251', '0.046'],
    ],
    [0.06, 0.14, 0.30, 0.11, 0.10, 0.14, 0.15], font=8.5),
    'Table 5: Meritocratic CPU subnets. Earn rate = share of registered miners '
    'receiving incentive; Avg $/mo = pool divided by rewarded miners.', keep=False)
story.append(body(
    'Two rows deserve special attention beyond the headline. SN5 Hone is the most '
    'meritocratic subnet on the entire network: 95 percent of its 256 miners earn and the '
    'top ten take only 11 percent, so once admitted its income is the most stable and '
    'fair in the table. Its obstacle is purely the entry ticket, 0.958 TAO or roughly '
    '$270, the price of a subnet whose seats rarely churn. At the opposite end, SN41 '
    'Almanac and SN67 Harnyx post attractive averages but concentrate 58 to 72 percent of '
    'incentive in ten UIDs; their averages describe elite operators far better than a '
    'newcomer, and both belong in the specialist pile rather than a starter portfolio.'))
story.append(body(
    'For the same machine, the pragmatic add-ons are the three cheapest admissions: '
    'SN101 Tag101 at 0.046 TAO, SN33 ReadyAI at 0.059 TAO and SN83 CliqueAI at 0.100 TAO. '
    'Their workloads are light enough to coexist with an SN61 agent environment on one '
    '64 GB box, and each carries an earn rate above 90 percent, so a seat, once taken, is '
    'likely to keep paying. SN105 Beam is the cheapest experiment on the list at 0.022 '
    'TAO, but its bandwidth-sharing profile suits a well-connected home server better '
    'than a data-center VM.'))

# ---- Chapter 6: Whale-Lottery Traps ----
story += h1_block(6, 'Whale-Lottery Traps to Avoid',
    'The most expensive mistake available to a new miner is treating an open seat as an '
    'invitation. All ten Tier B subnets have free capacity, and every one of them routes '
    'effectively the whole miner pool to between one and four rewarded operators. '
    'Registering into such a subnet converts a small burn into a zero-income seat that '
    'either displaces a real earner elsewhere or idles. The table below lists the six '
    'traps with the largest headline numbers, precisely because those headlines are what '
    'sucker unfamiliar miners in; the final column shows what the arithmetic actually '
    'describes.')
story += table_block('', make_table(
    ['SN', 'Subnet', 'Seats open', 'Rewarded', 'Headline $/mo', 'What the number really is'],
    [
        ['108', 'ChipForge', '100 of 256', '1 of 155', '$494.8k', 'One operator\'s take; newcomers earn zero'],
        ['90', 'KubeTEE', '100 of 256', '2 of 100', '$238.4k', 'Two-operator cartel pool'],
        ['122', 'CookingTAO', '174 of 256', '2 of 82', '$74.0k', 'Four-way split at best'],
        ['117', 'everyframe', '124 of 256', '1 of 132', '$69.2k', 'Single-winner CPU lottery'],
        ['35', 'SN35', '251 of 256', '1 of 5', '$43.9k', 'Single-winner subnet, see below'],
        ['47', 'GPUForge', '158 of 256', '1 of 158', '$43.1k', 'One H100 operator collects all'],
    ],
    [0.06, 0.15, 0.13, 0.12, 0.16, 0.38], font=8.5),
    'Table 6: Open-seat subnets whose headline yields are single-winner pools.', keep=False)
story += h2_block('6.1', 'Case study: SN35 and the NO-GO verdict', body(
    'SN35 illustrates the pattern perfectly because it was the subnet this audit was '
    'originally asked about. Its five registered miners share a pool of 5.2 TAO per day, '
    'and exactly one of them is rewarded: the median rewarded miner\'s incentive share is '
    '100 percent of the pool. The $8,552 gross monthly figure shown on the platform '
    'profitability card is therefore not a forecast of what a joining miner earns; it is '
    'the current income of the single incumbent. The platform\'s NO-GO verdict is '
    'correct for a standard operator: unless you have concrete reason to believe you can '
    'beat that one UID on its own evaluation metric, the honest expected value of '
    'registering is the burn cost times zero.'))
story.append(body(
    'The general detection rule is mechanical and worth memorising: when '
    '<b>rewardedMiners is four or fewer while top10IncentiveShare sits at or near 100 '
    'percent</b>, the subnet is a lottery, regardless of how large its pool appears in '
    'marketing threads or dashboards. Both numbers come straight from the chain snapshot, '
    'so the check takes seconds in the Infranex playbook view. As a class, Tier B is '
    'worth monitoring rather than mining: the moment a lottery subnet widens its reward '
    'distribution, for example after a mechanism change, it graduates toward Tier A, and '
    'its free seats become genuinely valuable. Chapter 8 returns to that watcher.'))

# ---- Chapter 7: Recommended Action Plan ----
story += h1_block(7, 'Recommended Action Plan',
    'The plan below turns the ranking into three concrete phases for one CPU machine. It '
    'assumes no existing hardware; if a capable box is already running, Phase 1 collapses '
    'to a software setup afternoon. All burns are treated as spendable marketing budget, '
    'not investments, because displacement entry can fail, and the portfolio is sized so '
    'that total worst-case loss across all three subnets is roughly the price of a '
    'restaurant dinner.')
story += table_block('', make_table(
    ['Component', 'Specification', 'Notes'],
    [
        ['CPU', 'AMD Ryzen 9 or EPYC, 16-32 cores', 'SN61 agents and SN83 solver both scale with cores'],
        ['Memory', '64-128 GB ECC', 'Isolated environments per subnet; 64 GB is the floor'],
        ['Storage', '1-2 TB NVMe', 'Chain sync plus container images'],
        ['Network', 'Stable 100 Mbps+', 'SN105 Beam becomes viable only with a good line'],
        ['Power', '150-200 W typical draw', 'About $12 per month at $0.10 per kWh'],
        ['Capex (used market)', 'About $1,500-2,500', 'Skip entirely if repurposing an existing server'],
    ],
    [0.20, 0.36, 0.44]),
    'Table 7: Recommended single-box specification for the CPU trio.')
story += table_block('', make_table(
    ['Target', 'Burn (TAO)', 'Burn (USD)', 'Role in portfolio'],
    [
        ['SN61 RedTeam', '0.135', '~$38', 'Primary income engine; longest immunity, largest pool'],
        ['SN101 Tag101', '0.046', '~$13', 'Light tagging worker; 96% earn rate keeps the seat paid'],
        ['SN83 CliqueAI', '0.100', '~$28', 'CPU solver; stable mid-pack income'],
        ['Total', '0.281', '~$79', 'All three on one machine'],
    ],
    [0.22, 0.16, 0.16, 0.46]),
    'Table 8: Entry budget. Burns are at-risk, one-time registration costs.')
story.append(body(
    'Phase 1, days one and two: provision the box, register into SN61 by displacing the '
    'weakest eligible UID, and ship a baseline agent so incentive starts flowing inside '
    'the 48-hour immunity window. Phase 2, weeks two and three: once SN61 is stable, '
    'take SN101 and SN83 seats on the same machine and automate seat-health checks so a '
    'dipping UID is repaired before it becomes a displacement target. Phase 3, weeks '
    'eight and nine: after the SN61 bond ramp matures, review per-subnet income against '
    'the table below and rebalance, either deepening SN61 tooling or rotating a '
    'losing seat into the next best entry from Chapter 5.'))
story += table_block('', make_table(
    ['Period', 'Expected net per month', 'Basis'],
    [
        ['Month 1', '$150-250', 'SN61 bond ramp plus SN101 and SN83 starting from zero'],
        ['Months 2-3', '$500-800', 'Ramp roughly half complete; all three seats earning'],
        ['Steady state', '$700-1,100', 'SN61 at $574-1,061, SN101 at $200-372, SN83 at $300-500'],
    ],
    [0.18, 0.28, 0.54]),
    'Table 9: Blended expectation for the trio, assuming seats are held.')

# ---- Chapter 8: Monitoring ----
story += h1_block(8, 'Monitoring and Re-Running the Analysis',
    'Chain conditions move daily: seats churn, pools rebalance after mechanism changes, '
    'and new fair-launch subnets appear with genuinely broad emissions. Every number in '
    'this report is reproducible on the platform host with the two analysis scripts '
    'persisted there, so the audit can be refreshed in under a minute at any time.')
story.append(Spacer(1, 4))
story.append(code_block([
    'cd /home/z/my-project',
    'INFRANEX_WORKERS=off bun --smol scripts/earn-chances.ts      # tier map refresh',
    'INFRANEX_WORKERS=off bun --smol scripts/best-subnets-now.ts  # picker verdicts',
]))
story.append(Spacer(1, 8))
story.append(body(
    'Three signals deserve standing attention. First, any Tier C subnet shedding multiple '
    'seats at once is the cheapest entry the market ever offers, because weak incumbents '
    'are leaving and displacement risk collapses. Second, a Tier B lottery subnet that '
    'widens its rewarded set, visible as rewardedMiners jumping from single digits into '
    'double digits, graduates toward Tier A and converts its free seats into real income '
    'slots. Third, SN61\'s own incentive trend after the bond ramp confirms or revises '
    'the $574 new-entrant expectation used throughout this report. Wiring these three '
    'checks into the platform\'s watcher so that seat openings and reward-breadth shifts '
    'raise an alert is the recommended follow-up, and it turns this one-time audit into '
    'a standing edge.'))

# ------------------------------------------------------------------
# Build body PDF
# ------------------------------------------------------------------
doc = TocDocTemplate(
    BODY_PDF, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=MARGIN, bottomMargin=MARGIN,
    title='Bittensor Subnet Earning Chances - CPU Mining Report',
    author='Z.ai', creator='Z.ai',
    subject='Earning-chances audit of Bittensor subnets and best CPU mining targets, October 2026')
doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)
print('body built:', BODY_PDF)

# ------------------------------------------------------------------
# Merge cover (page 0) -> final deliverable
# ------------------------------------------------------------------
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89
FINAL = '/home/z/my-project/download/Bittensor_Earning_Chances_Report_Oct2026.pdf'
os.makedirs(os.path.dirname(FINAL), exist_ok=True)


def normalize(page):
    w, h = float(page.mediabox.width), float(page.mediabox.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page


writer = PdfWriter()
writer.add_page(normalize(PdfReader(os.path.join(ASSETS, 'cover.pdf')).pages[0]))
for p in PdfReader(BODY_PDF).pages:
    writer.add_page(normalize(p))
writer.add_metadata({
    '/Title': 'Bittensor Subnet Earning Chances - CPU Mining Report',
    '/Author': 'Z.ai', '/Creator': 'Z.ai',
    '/Subject': 'Earning-chances audit of Bittensor subnets and best CPU mining targets, October 2026',
})
with open(FINAL, 'wb') as f:
    writer.write(f)
print('final:', FINAL)
