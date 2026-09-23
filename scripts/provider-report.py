#!/usr/bin/env python3
"""Infranex BT — GPU Provider Analysis (operator brief). ReportLab body.

Pipeline: body PDF (this script) -> merge with Template 07 cover -> final PDF.
Follows briefs/report.md: SimpleDocTemplate (no TOC), FreeSerif stack,
install_font_fallback, Template 07 fixed body palette, Paragraph-wrapped
table cells, safe_keep_together, CondPageBreak before H1, chart spacer rhythm.
"""
import os
import sys

sys.path.insert(0, "/home/z/my-project/skills/pdf/scripts")

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (CondPageBreak, HRFlowable, Image, KeepTogether,
                                Paragraph, SimpleDocTemplate, Spacer, Table,
                                TableStyle)
from PIL import Image as PILImage

# ---------------- fonts ----------------
FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("SarasaMonoSC", f"{FONT_DIR}/truetype/chinese/SarasaMonoSC-Regular.ttf"))
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

# ---------------- Template 07 Crystal Blue body palette (fixed) ----------------
PAGE_BG = colors.HexColor("#f5f8fc")
SECTION_BG = colors.HexColor("#edf2f9")
CARD_BG = colors.HexColor("#e4ecf5")
TABLE_STRIPE = colors.HexColor("#eef3fa")
HEADER_FILL = colors.HexColor("#1a4a7a")
BORDER = colors.HexColor("#c0d0e2")
ACCENT = colors.HexColor("#2d7ab3")
TEXT_PRIMARY = colors.HexColor("#142840")
TEXT_MUTED = colors.HexColor("#5a7a96")

OUT_DIR = "/home/z/my-project/tool-results"
BODY_PDF = f"{OUT_DIR}/provider-body.pdf"
CHARTS = OUT_DIR

# ---------------- page geometry ----------------
MARGIN = 1.0 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
H1_ORPHAN = AVAIL_H * 0.25

# ---------------- styles ----------------
body = ParagraphStyle("Body", fontName="FreeSerif", fontSize=10.5, leading=17,
                      alignment=TA_JUSTIFY, textColor=TEXT_PRIMARY, spaceAfter=10)
h1 = ParagraphStyle("H1", fontName="FreeSerif", fontSize=22, leading=27,
                    textColor=TEXT_PRIMARY, spaceBefore=18, spaceAfter=4)
h2 = ParagraphStyle("H2", fontName="FreeSerif", fontSize=15, leading=20,
                    textColor=HEADER_FILL, spaceBefore=14, spaceAfter=6)
caption = ParagraphStyle("Caption", fontName="FreeSerif", fontSize=8.5, leading=12,
                         alignment=TA_CENTER, textColor=TEXT_MUTED)
bullet = ParagraphStyle("Bullet", fontName="FreeSerif", fontSize=10.5, leading=16,
                        alignment=TA_LEFT, textColor=TEXT_PRIMARY, leftIndent=14,
                        bulletIndent=2, spaceAfter=6)
th = ParagraphStyle("TH", fontName="FreeSerif", fontSize=9, leading=12,
                    textColor=colors.white, alignment=TA_CENTER)
tc = ParagraphStyle("TC", fontName="FreeSerif", fontSize=8.8, leading=12,
                    textColor=TEXT_PRIMARY, alignment=TA_LEFT)
tcc = ParagraphStyle("TCC", parent=tc, alignment=TA_CENTER)
stat_big = ParagraphStyle("StatBig", fontName="FreeSerif", fontSize=19, leading=23,
                          textColor=ACCENT, alignment=TA_CENTER)
stat_label = ParagraphStyle("StatLabel", fontName="FreeSerif", fontSize=8, leading=11,
                            textColor=TEXT_MUTED, alignment=TA_CENTER)
src_style = ParagraphStyle("Src", fontName="FreeSerif", fontSize=8.5, leading=12.5,
                           alignment=TA_LEFT, textColor=TEXT_MUTED, leftIndent=12,
                           spaceAfter=3)


def add_h1(num, text):
    """H1 with accent underline rule; orphan-protected; kept with rule."""
    p = Paragraph(f"<b>{num}  {text}</b>", h1)
    rule = HRFlowable(width="100%", color=ACCENT, thickness=1.2,
                      spaceBefore=2, spaceAfter=10)
    return [CondPageBreak(H1_ORPHAN), KeepTogether([p, rule])]


def para(text, style=body):
    return Paragraph(text, style)


def embed_image(path, max_width=AVAIL_W, max_height=A4[1] * 0.35):
    pil = PILImage.open(path)
    ow, oh = pil.size
    ratio = min(max_width / ow if ow > max_width else 1.0,
                max_height / oh if oh > max_height else 1.0)
    return Image(path, width=ow * ratio, height=oh * ratio)


def chart_block(path, caption_text, max_width=AVAIL_W * 0.96):
    img = embed_image(path, max_width=max_width)
    cap = Paragraph(caption_text, caption)
    return [Spacer(1, 16), KeepTogether([img, Spacer(1, 8), cap]), Spacer(1, 16)]


def stat_row(stats):
    """Three stat callouts side by side."""
    cell_w = (AVAIL_W - 24) / 3.0
    cells = []
    for big, label in stats:
        inner = Table([[Paragraph(f"<b>{big}</b>", stat_big)],
                       [Paragraph(label, stat_label)]], colWidths=[cell_w])
        inner.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
            ("BOX", (0, 0), (-1, -1), 1, ACCENT),
            ("TOPPADDING", (0, 0), (-1, 0), 9),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 9),
            ("TOPPADDING", (0, 1), (-1, 1), 2),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        cells.append(inner)
    outer = Table([cells], colWidths=[cell_w + 8] * 3, hAlign="CENTER")
    outer.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return outer


def make_table(header, rows, ratios, stripe=True):
    assert abs(sum(ratios) - 1.0) < 0.001
    col_w = [r * AVAIL_W for r in ratios]
    assert sum(col_w) <= AVAIL_W + 0.5
    data = [[Paragraph(f"<b>{c}</b>", th) for c in header]]
    for row in rows:
        data.append([c if isinstance(c, Paragraph) else Paragraph(str(c), tc) for c in row])
    t = Table(data, colWidths=col_w, hAlign="CENTER", repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_FILL),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if stripe:
        for i in range(1, len(data)):
            style.append(("BACKGROUND", (0, i), (-1, i),
                          TABLE_STRIPE if i % 2 == 0 else colors.white))
    t.setStyle(TableStyle(style))
    return t


def table_block(title_text, tbl, cap_text):
    tt = ParagraphStyle("TT", parent=body, fontSize=9.5, textColor=HEADER_FILL,
                        spaceAfter=5, alignment=TA_LEFT)
    return [Spacer(1, 14),
            KeepTogether([para(f"<b>{title_text}</b>", tt), tbl, Spacer(1, 6),
                          Paragraph(cap_text, caption)]),
            Spacer(1, 14)]


# ---------------- page decorations ----------------
def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    # header
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.62 * inch, "INFRANEX BT  ·  GPU PROVIDER ANALYSIS")
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 0.70 * inch, PAGE_W - MARGIN, PAGE_H - 0.70 * inch)
    # footer
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 0.45 * inch, "Infranex BT — Operator Brief")
    canvas.drawRightString(PAGE_W - MARGIN, 0.45 * inch, str(doc.page))
    canvas.restoreState()


doc = SimpleDocTemplate(
    BODY_PDF, pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN,
    title="GPU Provider Analysis — Rented GPUs, Ranked by Runtime",
    author="Z.ai", creator="Z.ai",
    subject="Runtime-first comparison of GPU rental providers for Bittensor mining",
)

story = []

# ============ 1. EXECUTIVE VERDICT ============
story += add_h1("1", "Executive Verdict")
story.append(para(
    "For running rented GPUs on Bittensor, <b>runtime is the product</b>: a miner that reboots "
    "mid-epoch loses accumulated reward weight, and on full subnets a replaceable seat earns nothing "
    "while it is down. Ranked on that basis, <b>RunPod Secure Cloud is the best default</b> for "
    "long-running GPU miners. It runs in enterprise data centers, carries a 99% uptime service-level "
    "agreement (99.99% on enterprise agreements) and SOC 2 Type II certification, and its H100 PCIe "
    "price of $2.89 per GPU-hour costs roughly 45% more than Vast.ai's marketplace midpoint — cheap "
    "insurance when a month of uninterrupted runtime decides whether a seat earns."))
story.append(para(
    "<b>Vast.ai wins on raw price</b> (H100 SXM around $1.49–2.21/hr, the deepest odd-lot inventory, "
    "per-second billing) and is the right tool for interruptible-tolerant work — but it offers no "
    "per-instance SLA, host quality varies widely, and interruptible instances are killed the moment "
    "they are outbid. <b>Akash Network</b> is the platform-native price-discovery layer — its live bid "
    "medians already power the infranex-bt GPU Catalog — with genuine depth (417 listed GPUs, 157 "
    "available at snapshot time), though SemiAnalysis' ClusterMAX 2.0 rating still marks the network "
    "Underperforming and reliability is per-provider. <b>Lambda</b> is the simple premium lane: 99.9% "
    "SLA, fixed on-demand pricing, H100 SXM at $3.44/hr."))
story.append(Spacer(1, 8))
story.append(stat_row([
    ("$2.89/hr", "RunPod Secure H100 — the runtime-first default"),
    ("45/100", "Vast.ai interruptible — Runtime Reliability Index"),
    ("+40%", "H100 1-yr rental index move, Oct 2025 to Mar 2026"),
]))
story.append(Spacer(1, 14))

# ============ 2. DATA SOURCES AND METHOD ============
story += add_h1("2", "Data Sources and Method")
story.append(para(
    "The analysis stands on two legs. The <b>platform leg</b> is a live snapshot pulled from "
    "infranex-bt's own catalog pipeline (<font size=9>/api/gpu-offers</font>) on September 21, 2026, with the "
    "chain at block 9,117,160, TAO at $289.75 and 129 subnets tracked. Akash pricing is public "
    "bid-aggregation and therefore flows into the platform with no API key; RunPod, Vast.ai and Lambda "
    "adapters deliver live offers and — for RunPod and Vast — real one-click rentals once their keys are "
    "configured (they are not configured yet, so those lanes are sourced from market data). The "
    "<b>market leg</b> draws on provider documentation, the SemiAnalysis ClusterMAX 2.0 GPU-cloud rating "
    "system (November 2025), independent pricing trackers and published outage reviews, all current to "
    "September 2026."))
story.append(para(
    "Because no deployment telemetry has accumulated since the platform database was re-seeded, provider "
    "runtime quality is scored with a transparent <b>Runtime Reliability Index (RRI)</b> rather than "
    "observed uptime. RRI scores each rental lane out of 100 across four equally weighted dimensions: "
    "<b>SLA and guarantees</b> (formal, contractual), <b>tenancy control</b> (enterprise data center vs "
    "peer-hosted hardware), <b>interrupt exposure</b> (can the instance be taken away mid-job, and by "
    "whom), and <b>operational maturity</b> (independent ratings, outage track record, tooling). A score "
    "of 70 is treated as the minimum for conviction-subnet mining, where a restart costs real reward "
    "weight; below 70, use the lane only for checkpointable or batch work."))

# ============ 3. PROVIDER RUNTIME ANALYSIS ============
story += add_h1("3", "Provider Runtime Analysis")
story.append(para(
    "<b>RunPod</b> operates two distinct environments. <b>Secure Cloud</b> runs in enterprise data "
    "centers with redundant power and networking, and is the lane the 99% SLA actually protects; "
    "<b>Community Cloud</b> brokers peer-level hardware that is cheaper but, as independent reviews put "
    "it, delivers inconsistent performance and occasional interruptions. One caution keeps the ranking "
    "honest: a 2026 independent review tracked 227+ outages across RunPod over nine months, including "
    "pods that crash mid-job while still billing. That does not demote Secure Cloud from first place, "
    "but it does argue for multi-provider routing and the platform's daemon health checks rather than "
    "blind trust in any single vendor."))
story.append(para(
    "<b>Lambda</b> is the most conservative lane: a 99.9% SLA, a small fixed catalog and on-demand H100 "
    "SXM at $3.44/hr. You pay a premium of roughly 19% over RunPod Secure for contractual certainty and "
    "simplicity — sensible for a small fleet of long-running seats. <b>Akash Network</b> is a "
    "decentralized marketplace of independent providers: leases are bid-priced, hardware depth is real "
    "(the platform snapshot shows 417 listed GPUs across 24 types), and utilization is high — an Akash "
    "provider-incentives paper reported 91% of A100s fully utilized. But ClusterMAX 2.0 rates the "
    "network Underperforming, and reliability is per-provider: an individual lease is only as good as "
    "the operator behind it, so verify the provider tier before committing a miner."))
story.append(para(
    "<b>Vast.ai</b> is a host marketplace with the widest inventory and the lowest headline prices — "
    "H100 SXM around $1.49–2.21/hr — but it explicitly cannot offer uptime guarantees for individual "
    "instances because host behavior is out of its control; reliability is host-specific, not "
    "platform-wide. Its interruptible (spot) tier runs indefinitely only if not outbid, and being "
    "outbid stops the instance and kills running processes. For a Bittensor miner that is the worst "
    "failure mode: registration burn is spent, the seat sits unworked, and reward weight decays. "
    "Vast remains excellent for experiments and burst capacity; it is not where a conviction seat "
    "should live."))
story += chart_block(f"{CHARTS}/chart-rri.png",
    "Figure 1 — Runtime Reliability Index (RRI) by rental lane. Equal weights: SLA 25%, tenancy control 25%, "
    "interrupt exposure 25%, operational maturity 25%. The 70-line marks the minimum for conviction-subnet mining.")

story += table_block(
    "Provider comparison matrix",
    make_table(
        ["Provider / lane", "Tenancy model", "Uptime SLA", "H100 $/hr", "RRI", "Platform role and verdict"],
        [
            ["RunPod — Secure", "Enterprise DCs", "99% (99.99% ent.)", "$2.89", Paragraph("<b>84</b>", tcc),
             "Best default for long-running miners; real rental adapter wired in the deploy wizard"],
            ["Lambda", "Own DCs, on-demand", "99.9%", "$3.44", Paragraph("<b>82</b>", tcc),
             "Premium certainty lane; offers only — rent via RunPod adapter today"],
            ["RunPod — Community", "Peer-hosted GPUs", "99% platform", "$1.99", Paragraph("<b>68</b>", tcc),
             "Cheap middle ground; acceptable for short experiments, not conviction seats"],
            ["Akash Network", "Decentralized providers", "None (per provider)", "$2.55 live median", Paragraph("<b>66</b>", tcc),
             "Platform-native price discovery and overflow capacity; verify provider per lease"],
            ["Vast.ai — on-demand", "Host marketplace", "None", "$1.49–2.21", Paragraph("<b>62</b>", tcc),
             "Cheapest honest on-demand; host quality varies, so screen each host before committing"],
            ["Vast.ai — interruptible", "Host marketplace, spot", "None; killed when outbid", "40–60% less", Paragraph("<b>45</b>", tcc),
             "Checkpointable and batch work only; never a registered, earning seat"],
        ],
        [0.145, 0.14, 0.12, 0.115, 0.08, 0.40]),
    "Table 1 — Rental lanes ranked by RRI. Prices: provider docs and market trackers, September 2026; "
    "Akash H100 is the platform's live bid median. H100 SXM/PCIe mix noted per source.")

# ============ 4. TOP GPU PERFORMERS ============
story += add_h1("4", "Top GPU Performers")
story.append(para(
    "Ranking GPUs for Bittensor mining is a fit problem before it is a price problem: each subnet "
    "publishes a VRAM and hardware floor, and the platform's chooser already nets GPU cost out of its "
    "conviction score. At the top, the <b>H200 141GB</b> is the ticket to the premium H200-class "
    "subnets — the platform's own top mining pick (SN5 Hone) is H200-class — and the live Akash book "
    "shows 40 listed at a $4.45/hr median with 15 available. The <b>H100 80GB</b> remains the "
    "price-performance workhorse with the broadest subnet support; it is also the only model with "
    "sourced pricing on all five major lanes, charted below. The <b>A100 80GB</b> is the depth play — "
    "222 listed and 64 available on Akash at $1.84/hr — ideal when a subnet's floor is 80GB and you "
    "want instant availability at scale."))
story.append(para(
    "Two value lanes complete the list. <b>RTX PRO 6000 SE 96GB</b> is fresh capacity — 24 listed and "
    "all 24 available at $2.04/hr — and its 96GB VRAM for roughly half an H200's price makes it the "
    "best VRAM-per-dollar card for memory-hungry subnets that do not demand Hopper-class compute. "
    "The <b>RTX 4090 / 3090</b> tier ($0.34 and $0.16/hr on Akash) covers budget GPU subnets and "
    "checkpointable side work; inventory is thin (5 and 13 listed respectively) but hourly cost is "
    "almost negligible, which is why these two still dominate CPU-Guide-style starter setups."))
story += chart_block(f"{CHARTS}/chart-h100-price.png",
    "Figure 2 — H100 on-demand $/GPU-hr across the five major lanes. Vast is the sourced range midpoint "
    "($1.49–2.21); Akash is the platform's live bid median; others are provider-quoted, September 2026.")

story += table_block(
    "Top GPU performers for Bittensor mining",
    make_table(
        ["#", "GPU", "VRAM", "Best market $/hr", "Akash live $/hr", "Depth (list/avail)", "Mining fit"],
        [
            [Paragraph("1", tcc), "H200", "141GB", "≈$2.50–3.14 (GMI / NF)", "$4.45", "40 / 15",
             "Premium H200-class subnets (SN5-class); highest gross TAO"],
            [Paragraph("2", tcc), "H100", "80GB", "$1.49–2.21 (Vast)", "$2.55", "69 / 20",
             "Price-performance workhorse; broadest subnet support"],
            [Paragraph("3", tcc), "A100", "80GB", "$1.09–1.76 (market)", "$1.84", "222 / 64",
             "Deepest inventory; instant scale on 80GB-floor subnets"],
            [Paragraph("4", tcc), "PRO 6000 SE", "96GB", "$2.04 (Akash)", "$2.04", "24 / 24",
             "Best VRAM-per-dollar; fresh capacity, fully available"],
            [Paragraph("5", tcc), "RTX 4090", "24GB", "$0.34 (Akash)", "$0.34", "5 / 2",
             "Budget GPU subnets; thin inventory, negligible hourly cost"],
            [Paragraph("6", tcc), "RTX 3090", "24GB", "$0.16 (Akash)", "$0.16", "13 / 10",
             "Starter and side work; checkpoint-friendly economics"],
        ],
        [0.045, 0.11, 0.095, 0.20, 0.125, 0.125, 0.30]),
    "Table 2 — Ranked by mining fit: subnet VRAM floors, price-performance and availability. Market prices from "
    "provider quotes and trackers; Akash column is the platform's live bid median at snapshot time.")

story += chart_block(f"{CHARTS}/chart-akash-depth.png",
    "Figure 3 — Akash live capacity depth from the platform snapshot: listed vs available GPUs per model "
    "(September 21, 2026). High utilization means availability, not listings, is the real supply signal.")

# ============ 5. COST-EFFICIENCY AND BREAKEVEN ============
story += add_h1("5", "Cost-Efficiency and Breakeven")
story.append(para(
    "At 730 hours per month, the rental bill spans an order of magnitude across the catalog: an "
    "<b>H200 at Akash's $4.45/hr costs $3,249/month</b>, an H100 runs $1,350 (Vast midpoint) to "
    "$2,893 (Lambda), the A100 sits at $1,343 and an RTX 3090 at just $117. Against the platform's own "
    "projections — the SubnetChooser currently shows SN5 Hone, an H200-class pick, at roughly "
    "$3,030/month net per miner slot, and CPU lanes like SN41 Almanac running on VPS-class boxes — the "
    "rule that falls out is simple: <b>a rented GPU only pays where the subnet's net clears the rental "
    "bill plus registration burn</b>. At TAO $289.75, an H200 seat needs a subnet netting north of "
    "$3,400 before burn to be safely positive at Akash pricing; the same seat on cheaper H200 capacity "
    "materially widens that margin."))
story.append(para(
    "Spot economics deserve explicit arithmetic because the discount is seductive: Vast interruptible "
    "typically runs 40–60% under on-demand, but one outbid event can erase a day or more of accumulated "
    "reward weight, and on a full subnet your seat is replaceable the moment you go dark. For a lane "
    "with a 45/100 RRI, a 50% hourly discount does not compensate the expected loss on conviction "
    "subnets — the correct use is checkpointable batch jobs, benchmarking and idle-capacity top-ups. "
    "The platform's deploy wizard already restricts Vast rentals to on-demand bundles for exactly this "
    "reason."))
story += table_block(
    "Monthly rental cost per GPU (730 hours)",
    make_table(
        ["GPU", "Provider lane", "$/hr", "$/month", "Interruptible", "Runtime note"],
        [
            ["H200 141GB", "Akash (platform live)", "$4.45", "$3,249", "No",
             "Premium subnets; verify provider tier per lease"],
            ["H100 80GB", "Vast (market mid)", "$1.85", "$1,351", "Optional",
             "Cheapest honest on-demand; host screening required"],
            ["H100 80GB", "RunPod Secure", "$2.89", "$2,110", "No",
             "Default for long-running conviction seats"],
            ["H100 80GB", "Lambda", "$3.44", "$2,511", "No",
             "99.9% SLA premium lane"],
            ["A100 80GB", "Akash (platform live)", "$1.84", "$1,343", "No",
             "Deepest inventory; instant availability"],
            ["RTX 3090 24GB", "Akash (platform live)", "$0.16", "$117", "No",
             "Budget tier; negligible hourly cost"],
        ],
        [0.13, 0.24, 0.09, 0.11, 0.13, 0.30]),
    "Table 3 — Monthly cost basis at 730 hours. Platform lane prices are live Akash bid medians; "
    "RunPod/Vast/Lambda from provider quotes and trackers, September 2026.")

# ============ 6. ACTION CHECKLIST ============
story += add_h1("6", "Action Checklist")
story.append(para(
    "The platform is already wired for every lane in this report; the actions below convert the "
    "analysis into routing rules. Numbered by expected impact on fleet uptime per dollar:"))
for i, act in enumerate([
    "<b>Configure RunPod and Vast.ai API keys</b> (Settings → provider keys). Both adapters ship live "
    "offers and real rentals in the deploy wizard, but neither key is set today — until then the GPU "
    "Catalog only sees Akash's public book.",
    "<b>Route long-running H100/H200 conviction seats to RunPod Secure</b> by default; use Lambda when "
    "a fixed monthly budget matters more than the ~19% premium over RunPod Secure.",
    "<b>Keep Vast.ai interruptible away from registered miners.</b> Allow it only for checkpointable "
    "experiments, benchmarks and burst capacity; keep Vast on-demand for screened, short-lived work.",
    "<b>Treat Akash as price discovery plus overflow.</b> Its live bid medians anchor the catalog's "
    "price columns, and its depth absorbs overflow demand — but confirm the individual provider's tier "
    "before parking a miner on a lease.",
    "<b>Re-run this analysis monthly.</b> The H100 one-year rental index moved +40% between October "
    "2025 and March 2026 ($1.70 to $2.35/GPU-hr); provider pricing is a moving target and routing "
    "rules should follow it.",
], start=1):
    story.append(Paragraph(f"{i}.  {act}", bullet))
story.append(Spacer(1, 6))
story.append(para(
    "The SubnetChooser card at the top of the dashboard already nets GPU cost out of its conviction "
    "score; this brief decides <b>where to rent the GPU</b> that the picker sends you to deploy. Keep "
    "the two in the same loop: when the picker's top conviction changes hardware class, re-check the "
    "routing rules above before hitting Mine."))
story.append(Spacer(1, 10))
story.append(HRFlowable(width="100%", color=BORDER, thickness=0.5, spaceBefore=4, spaceAfter=8))
story.append(Paragraph("<b>Sources.</b> Platform-native: infranex-bt live catalog snapshot "
    "(/api/gpu-offers, Akash public bid aggregation), provider registry and deploy-wizard adapters; chain "
    "context block 9,117,160, TAO $289.75 (September 21, 2026). Market: provider documentation and SLA pages "
    "(RunPod, Lambda, Vast.ai, Akash); SemiAnalysis ClusterMAX 2.0 GPU-cloud ratings (November 2025) and H100 "
    "1-year rental price index (October 2025 to March 2026); independent pricing and reliability trackers "
    "(Tech Insider, Spheron, Northflank, GMI Cloud, Thunder Compute, 2026); published outage reviews. "
    "RRI is this report's own composite and is not a provider metric.", src_style))

doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
print("body built:", BODY_PDF)
