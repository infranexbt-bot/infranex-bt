#!/usr/bin/env python3
"""INFRANEX GPU research — charts (4 PNGs) from rankings.json."""
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

DIR = "/home/z/my-project/scripts/gpu-research"
OUT = f"{DIR}/charts"
import os
os.makedirs(OUT, exist_ok=True)

r = json.load(open(f"{DIR}/rankings.json"))
viewA = r["viewA"]
viewB = r["viewB"]["classes"]
viewC = r["viewC"]

INK = "#1c1c1a"
MUTED = "#78766f"
GRID = "#e5e3df"
ACCENT = "#87702a"      # cascade XS accent (base hue family)
ACCENT_L = "#b89a4e"    # lightness variant, same hue
ACCENT2 = "#3a95b4"     # cascade accent_secondary (chart differentiation only)
HEADER_FILL = "#504933"
ICON = "#8c7e52"
BORDER = "#cfcab8"
ORANGE = ACCENT

plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["DejaVu Sans"],
    "axes.edgecolor": GRID,
    "axes.labelcolor": INK,
    "text.color": INK,
    "xtick.color": MUTED,
    "ytick.color": INK,
    "axes.titlesize": 13,
    "figure.dpi": 150,
})

def style(ax):
    for sp in ["top", "right"]:
        ax.spines[sp].set_visible(False)
    ax.grid(axis="x", color=GRID, lw=0.8, alpha=0.8)
    ax.set_axisbelow(True)

# ---------- Chart 1: verified GPU mentions (tiered) ----------
top = [v for v in viewA if v["anyCount"] >= 1][:10]
top.sort(key=lambda v: v["anyCount"])
labels = [v["gpu"].replace("NVIDIA ", "").replace(" family", " fam.") for v in top]
req = [v["reqCount"] for v in top]
sup_extra = [v["supportedCount"] - v["reqCount"] for v in top]
mention_extra = [v["anyCount"] - v["supportedCount"] for v in top]

fig, ax = plt.subplots(figsize=(9, 5.4), constrained_layout=True)
y = range(len(labels))
ax.barh(y, req, color=ACCENT, label="Explicit miner requirement (tier 1)", height=0.62)
ax.barh(y, sup_extra, left=req, color=ACCENT_L, alpha=0.85, label="Miner-side supported / declared (tier 2)", height=0.62)
ax.barh(y, mention_extra, left=[a + b for a, b in zip(req, sup_extra)], color=BORDER, label="Other mention incl. validator docs (tier 3)", height=0.62)
ax.set_yticks(list(y), labels)
ax.set_xlabel("Number of subnets")
ax.set_title("Which GPUs do Bittensor subnet repos actually name?", fontweight="bold", loc="left")
for i, v in enumerate(top):
    ax.text(v["anyCount"] + 0.12, i, str(v["anyCount"]), va="center", fontsize=10, color=MUTED)
ax.legend(loc="lower right", frameon=False, fontsize=8.5)
style(ax)
ax.set_axisbelow(True)
fig.savefig(f"{OUT}/chart1-gpu-mentions.png")
plt.close(fig)

# ---------- Chart 2: emission-weighted (miner-side TAO/day) ----------
top2 = sorted([v for v in viewA if v["reqTaoPerDay"] > 0], key=lambda v: v["reqTaoPerDay"])
labels2 = [v["gpu"].replace("NVIDIA ", "").replace(" family", " fam.") for v in top2]
vals2 = [v["reqTaoPerDay"] for v in top2]
fig, ax = plt.subplots(figsize=(9, 4.6), constrained_layout=True)
bars = ax.barh(labels2, vals2, color=[ACCENT2 if v == max(vals2) else ACCENT for v in vals2], height=0.6)
for i, (v, gpu) in enumerate(zip(vals2, top2)):
    ax.text(v + 2, i, f"{v:.0f} TAO/d  ≈ ${v * r['stats']['taoPriceUsd'] * 30:,.0f}/mo", va="center", fontsize=9, color=MUTED)
ax.set_xlabel("Miner-side emissions of subnets that require this GPU (TAO/day)")
ax.set_title("Where the reward money flows: emissions behind each GPU requirement", fontweight="bold", loc="left")
ax.set_xlim(0, max(vals2) * 1.42)
style(ax)
fig.savefig(f"{OUT}/chart2-emission-weighted.png")
plt.close(fig)

# ---------- Chart 3: VRAM class demand ----------
labels3 = [c["class"].split(" (")[0] for c in viewB]
full3 = [c["class"] for c in viewB]
subs3 = [c["subnets"] for c in viewB]
tao3 = [c["taoPerDay"] for c in viewB]
x = range(len(labels3))
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10.5, 4.4), constrained_layout=True)
colors3 = ["#d9d2bd", ACCENT_L, ACCENT, ICON, HEADER_FILL]
ax1.bar(x, subs3, color=colors3, width=0.62)
ax1.set_xticks(list(x), labels3, rotation=18, ha="right", fontsize=9)
ax1.set_ylabel("Subnets")
ax1.set_title("Subnets by minimum VRAM class", fontweight="bold", loc="left")
for i, v in enumerate(subs3):
    ax1.text(i, v + 0.5, str(v), ha="center", fontsize=10, color=MUTED)
for sp in ["top", "right"]:
    ax1.spines[sp].set_visible(False)
ax1.grid(axis="y", color=GRID, lw=0.8)
ax1.set_axisbelow(True)

ax2.bar(x, tao3, color=colors3, width=0.62)
ax2.set_xticks(list(x), labels3, rotation=18, ha="right", fontsize=9)
ax2.set_ylabel("Miner-side TAO/day")
ax2.set_title("Reward pool by minimum VRAM class", fontweight="bold", loc="left")
for i, v in enumerate(tao3):
    ax2.text(i, v + 6, f"{v:.0f}", ha="center", fontsize=10, color=MUTED)
for sp in ["top", "right"]:
    ax2.spines[sp].set_visible(False)
ax2.grid(axis="y", color=GRID, lw=0.8)
ax2.set_axisbelow(True)
fig.savefig(f"{OUT}/chart3-vram-classes.png")
plt.close(fig)

# ---------- Chart 4: app classifier cross-check ----------
top4 = [v for v in viewC if v["subnetCount"] >= 1][:8]
top4.sort(key=lambda v: v["subnetCount"])
labels4 = [v["gpu"] for v in top4]
vals4 = [v["subnetCount"] for v in top4]
tao4 = [v["taoPerDay"] for v in top4]
fig, ax = plt.subplots(figsize=(9, 4.4), constrained_layout=True)
bars = ax.barh(labels4, vals4, color=[ACCENT if "4090" in l else BORDER for l in labels4], height=0.6)
for i, (v, t) in enumerate(zip(vals4, tao4)):
    ax.text(v + 0.6, i, f"{v} subnets · {t:.0f} TAO/d", va="center", fontsize=9, color=MUTED)
ax.set_xlabel("Subnets classified by INFRANEX profiler (cross-check, classifier-derived)")
ax.set_title("INFRANEX classifier view: representative GPU per subnet", fontweight="bold", loc="left")
ax.set_xlim(0, max(vals4) * 1.5)
style(ax)
fig.savefig(f"{OUT}/chart4-app-classifier.png")
plt.close(fig)

print("charts written:", os.listdir(OUT))
