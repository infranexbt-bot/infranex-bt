# PDF-CHARTS — matplotlib charts for the Infranex BT investor brief.
# Style: charts.md rules (donut 65% hole, no top/right spines, dashed grid
# 20% alpha or none when values labeled, legend outside, palette colors only).
# English-only labels (document language = English).

import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# ── Cascade palette (design_engine.py palette-cascade --intent cold --mode minimal) ──
ACCENT   = "#2784b3"   # XS series 1
ACCENT2  = "#b44053"   # XS series 2
HEADER   = "#37454c"   # M structural
ICON     = "#3e6274"   # S
BORDER   = "#b7c3c9"
TEXT     = "#202224"
MUTED    = "#6e7477"
SUCCESS  = "#519166"
WARNING  = "#91753c"
ERROR    = "#97554f"

OUT = "/home/z/my-project/scripts/pdf-assets"
os.makedirs(OUT, exist_ok=True)

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["DejaVu Sans"],
    "axes.edgecolor": BORDER,
    "axes.labelcolor": TEXT,
    "text.color": TEXT,
    "xtick.color": MUTED,
    "ytick.color": MUTED,
    "svg.fonttype": "none",
})


def strip_axes(ax, keep_x=True):
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_visible(False)
    if keep_x:
        ax.spines["bottom"].set_color(BORDER)
        ax.spines["bottom"].set_linewidth(0.8)
    else:
        ax.spines["bottom"].set_visible(False)


# ── 1. Within-subnet emission split (donut, rich legend right) ──────────────
fig, (ax, lax) = plt.subplots(
    1, 2, figsize=(8.0, 3.1), constrained_layout=True,
    gridspec_kw={"width_ratios": [1.0, 1.15]},
)
vals = [41, 41, 18]
labels = ["Miners", "Validators + stakers", "Subnet owner"]
colors = [ACCENT, ICON, BORDER]
wedges, _ = ax.pie(
    vals, colors=colors, startangle=90, counterclock=False,
    wedgeprops=dict(width=0.35, edgecolor="white", linewidth=2),
)
ax.text(0, 0.06, "0.5 TAO", ha="center", va="center", fontsize=15, fontweight="bold", color=TEXT)
ax.text(0, -0.18, "per block", ha="center", va="center", fontsize=9, color=MUTED)
ax.set_aspect("equal")
lax.axis("off")
rows = [
    ("41%", "Miners", "paid on consensus-clipped quality scores", ACCENT),
    ("41%", "Validators + stakers", "baseline slice flows to root TAO stakers", ICON),
    ("18%", "Subnet owner", "fixed owner slot, set at subnet creation", BORDER),
]
y = 0.82
for pctv, name, note, c in rows:
    lax.scatter([0.03], [y], s=90, color=c, marker="o", clip_on=False)
    lax.text(0.09, y + 0.07, pctv + "   " + name, fontsize=12.5, fontweight="bold",
             color=TEXT, va="center")
    lax.text(0.09, y - 0.09, note, fontsize=9.5, color=MUTED, va="center")
    y -= 0.34
lax.set_xlim(0, 1)
lax.set_ylim(0, 1)
fig.savefig(f"{OUT}/ch-emission-split.png", dpi=200)
plt.close(fig)

# ── 2. Conviction engine weights (donut) ────────────────────────────────────
fig, (ax, lax) = plt.subplots(
    1, 2, figsize=(8.0, 3.1), constrained_layout=True,
    gridspec_kw={"width_ratios": [1.0, 1.15]},
)
vals = [55, 25, 20]
labels = ["Earning reality", "Diligence", "Model confidence"]
colors = [ACCENT, HEADER, BORDER]
wedges, _ = ax.pie(
    vals, colors=colors, startangle=90, counterclock=False,
    wedgeprops=dict(width=0.35, edgecolor="white", linewidth=2),
)
ax.text(0, 0.05, "conviction", ha="center", va="center", fontsize=13, fontweight="bold", color=TEXT)
ax.text(0, -0.19, "0 - 100", ha="center", va="center", fontsize=9.5, color=MUTED)
ax.set_aspect("equal")
lax.axis("off")
rows = [
    ("55%", "Earning reality", "rent-earn gate: hardware fit, seat odds, net $/mo", ACCENT),
    ("25%", "Diligence", "14-stage pipeline health, hard DO-NOT-PROVISION gate", HEADER),
    ("20%", "Model confidence", "how much verified chain data backs the score", BORDER),
]
y = 0.82
for pctv, name, note, c in rows:
    lax.scatter([0.03], [y], s=90, color=c, marker="o", clip_on=False)
    lax.text(0.09, y + 0.07, pctv + "   " + name, fontsize=12.5, fontweight="bold",
             color=TEXT, va="center")
    lax.text(0.09, y - 0.09, note, fontsize=9.5, color=MUTED, va="center")
    y -= 0.34
lax.set_xlim(0, 1)
lax.set_ylim(0, 1)
fig.savefig(f"{OUT}/ch-conviction.png", dpi=200)
plt.close(fig)

# ── 3. Win-tier census (horizontal bars, values labeled, no grid) ───────────
tiers = ["Don't enter", "Knife fight", "Fightable", "Open field"]
counts = [104, 5, 18, 1]
share = [c / 128 * 100 for c in counts]
tcolors = [ERROR, WARNING, ACCENT, SUCCESS]
fig, ax = plt.subplots(figsize=(8.0, 2.9), constrained_layout=True)
bars = ax.barh(tiers, counts, color=tcolors, height=0.62, edgecolor="none")
for b, c, s in zip(bars, counts, share):
    ax.text(b.get_width() + 1.6, b.get_y() + b.get_height() / 2,
            f"{c}  ({s:.0f}%)", va="center", fontsize=11.5, color=TEXT, fontweight="bold")
ax.set_xlim(0, 128)
ax.set_xlabel("subnets of 128", fontsize=10, color=MUTED)
ax.tick_params(axis="y", labelsize=11.5, length=0)
ax.tick_params(axis="x", labelsize=9.5)
ax.grid(False)
strip_axes(ax)
fig.savefig(f"{OUT}/ch-census.png", dpi=200)
plt.close(fig)

# ── 4. Top-10% incentive share, case rows (whale dominance) ─────────────────
rows = [
    ("Bitcast SN82", 12, SUCCESS),
    ("Numinous SN05", 12, SUCCESS),
    ("Cathedral SN83", 26, SUCCESS),
    ("Beam SN92", 60, WARNING),
    ("ItsAI SN30", 99, ERROR),
    ("Chutes SN64", 100, ERROR),
]
names = [r[0] for r in rows][::-1]
vals = [r[1] for r in rows][::-1]
cols = [r[2] for r in rows][::-1]
fig, ax = plt.subplots(figsize=(8.0, 3.3), constrained_layout=True)
bars = ax.barh(names, vals, color=cols, height=0.6, edgecolor="none")
for b, v in zip(bars, vals):
    ax.text(b.get_width() + 1.6, b.get_y() + b.get_height() / 2, f"{v}%",
            va="center", fontsize=11.5, color=TEXT, fontweight="bold")
ax.axvline(85, color=ERROR, linestyle="--", linewidth=1.0, alpha=0.55)
ax.text(85, len(rows) - 0.28, " 85% = winner-take-all line", fontsize=9,
        color=ERROR, va="bottom", ha="left", alpha=0.9)
ax.set_xlim(0, 112)
ax.set_xlabel("share of the subnet's incentive taken by its 10 best-paid UIDs",
              fontsize=10, color=MUTED)
ax.tick_params(axis="y", labelsize=11.5, length=0)
ax.tick_params(axis="x", labelsize=9.5)
ax.grid(False)
strip_axes(ax)
fig.savefig(f"{OUT}/ch-whale-share.png", dpi=200)
plt.close(fig)

# ── 5. The real menu for the owned 96 GB rig (net $/mo + month-1 odds) ──────
rows = [
    ("Numinous SN05   RUN", 881, "66%", SUCCESS),
    ("Cathedral SN83  RUN", 334, "67%", SUCCESS),
    ("Chutes SN64  AVOID", 330, "3%", ERROR),
    ("Beam SN92  RUN", 329, "61%", SUCCESS),
    ("ItsAI SN30  AVOID", -3, "60%", ERROR),
]
names = [r[0] for r in rows][::-1]
vals = [r[1] for r in rows][::-1]
odds = [r[2] for r in rows][::-1]
cols = [r[3] for r in rows][::-1]
fig, ax = plt.subplots(figsize=(8.0, 3.3), constrained_layout=True)
bars = ax.barh(names, vals, color=cols, height=0.6, edgecolor="none")
for b, v, o in zip(bars, vals, odds):
    if v >= 0:
        ax.text(b.get_width() + 14, b.get_y() + b.get_height() / 2,
                f"${v:,}/mo  ·  {o} mo-1", va="center", fontsize=10.5,
                color=TEXT, fontweight="bold")
    else:
        ax.text(14, b.get_y() + b.get_height() / 2,
                f"-${abs(v)}/mo  ·  {o} mo-1", va="center", fontsize=10.5,
                color=ERROR, fontweight="bold")
ax.axvline(0, color=BORDER, linewidth=0.8)
ax.set_xlim(-90, 1240)
ax.set_xlabel("modeled net $/month for one seat on the owned rig (power at $0.12/kWh)",
              fontsize=10, color=MUTED)
ax.tick_params(axis="y", labelsize=11, length=0)
ax.tick_params(axis="x", labelsize=9.5)
ax.grid(False)
strip_axes(ax)
fig.savefig(f"{OUT}/ch-ev.png", dpi=200)
plt.close(fig)

print("charts written to", OUT)
for f in sorted(os.listdir(OUT)):
    print("  ", f, os.path.getsize(os.path.join(OUT, f)), "bytes")
