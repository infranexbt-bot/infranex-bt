#!/usr/bin/env python3
"""Charts for the GPU provider analysis report — Template 07 Crystal Blue family.

All colors from the fixed Template 07 body palette (same ~215 deg hue family):
  HEADER_FILL #1a4a7a (M) | ACCENT #2d7ab3 (XS) | BORDER #c0d0e2 (S) | MUTED #5a7a96
Charts follow typesetting/charts.md: no top/right spines, no internal titles
(captions live in ReportLab), values labeled -> no grid, legend borderless.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.font_manager as fm
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

ACCENT = "#2d7ab3"
DARK = "#1a4a7a"
MID = "#7fb3d5"
LIGHT = "#c0d0e2"
TEXT = "#142840"
MUTED = "#5a7a96"
OUT = "/home/z/my-project/tool-results"

def style_ax(ax):
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_visible(False)
    ax.spines['bottom'].set_color(LIGHT)
    ax.tick_params(colors=MUTED, labelsize=10)
    for lbl in ax.get_yticklabels():
        lbl.set_color(TEXT)

# ---------------- Chart 1: H100 on-demand $/GPU-hr by provider lane ----------
lanes = [
    ("Vast.ai  (marketplace mid)", 1.85, MID),
    ("RunPod  Community Cloud", 1.99, MID),
    ("Akash Network  (platform live)", 2.55, ACCENT),
    ("RunPod  Secure Cloud", 2.89, DARK),
    ("Lambda  (on-demand)", 3.44, DARK),
]
lanes = lanes[::-1]  # cheapest on top after invert
fig, ax = plt.subplots(figsize=(6.4, 2.9), dpi=200, constrained_layout=True)
fig.patch.set_facecolor("white")
ax.set_facecolor("white")
names = [l[0] for l in lanes]
vals = [l[1] for l in lanes]
cols = [l[2] for l in lanes]
bars = ax.barh(names, vals, color=cols, height=0.62, edgecolor='none')
for b, v in zip(bars, vals):
    ax.text(v + 0.06, b.get_y() + b.get_height() / 2, f"${v:.2f}",
            va='center', ha='left', fontsize=10.5, color=TEXT, fontweight='bold')
ax.set_xlim(0, 4.15)
ax.set_xticks([])
ax.set_xlabel("")
style_ax(ax)
ax.spines['bottom'].set_visible(False)
fig.savefig(f"{OUT}/chart-h100-price.png", facecolor="white")
plt.close(fig)

# ---------------- Chart 2: Runtime Reliability Index (RRI) -------------------
rri = [
    ("RunPod — Secure Cloud", 84),
    ("Lambda (on-demand)", 82),
    ("RunPod — Community Cloud", 68),
    ("Akash Network (leased)", 66),
    ("Vast.ai — on-demand", 62),
    ("Vast.ai — interruptible", 45),
]
rri = rri[::-1]
fig, ax = plt.subplots(figsize=(6.4, 3.1), dpi=200, constrained_layout=True)
fig.patch.set_facecolor("white")
ax.set_facecolor("white")
names = [r[0] for r in rri]
vals = [r[1] for r in rri]
def shade(v):
    if v >= 80: return DARK
    if v >= 65: return ACCENT
    if v >= 55: return MID
    return LIGHT
cols = [shade(v) for v in vals]
bars = ax.barh(names, vals, color=cols, height=0.6, edgecolor='none')
for b, v in zip(bars, vals):
    ax.text(v + 1.2, b.get_y() + b.get_height() / 2, str(v),
            va='center', ha='left', fontsize=10.5, color=TEXT, fontweight='bold')
ax.axvline(70, color=MUTED, linewidth=0.8, linestyle='--', alpha=0.5)
ax.text(70, len(vals) - 0.28, " mining-safe threshold 70", fontsize=8.5,
        color=MUTED, ha='left', va='bottom')
ax.set_xlim(0, 100)
ax.set_xticks([])
style_ax(ax)
ax.spines['bottom'].set_visible(False)
fig.savefig(f"{OUT}/chart-rri.png", facecolor="white")
plt.close(fig)

# ---------------- Chart 3: Akash live capacity depth (platform snapshot) -----
models = ["A100 80GB", "H100 80GB", "H200 141GB", "PRO6000SE 96GB",
          "RTX 3090 24GB", "RTX 5090 32GB", "RTX 4090 24GB"]
total = [222, 69, 40, 24, 13, 9, 5]
avail = [64, 20, 15, 24, 10, 3, 2]
models_r = models[::-1]
total_r = total[::-1]
avail_r = avail[::-1]
import numpy as np
y = np.arange(len(models_r))
h = 0.38
fig, ax = plt.subplots(figsize=(6.4, 3.6), dpi=200, constrained_layout=True)
fig.patch.set_facecolor("white")
ax.set_facecolor("white")
b1 = ax.barh(y + h/2 + 0.02, total_r, height=h, color=LIGHT, edgecolor='none', label="Listed GPUs")
b2 = ax.barh(y - h/2 - 0.02, avail_r, height=h, color=ACCENT, edgecolor='none', label="Available now")
for yy, v in zip(y + h/2 + 0.02, total_r):
    ax.text(v + 2.5, yy, str(v), va='center', fontsize=9.5, color=MUTED)
for yy, v in zip(y - h/2 - 0.02, avail_r):
    ax.text(v + 2.5, yy, str(v), va='center', fontsize=9.5, color=TEXT, fontweight='bold')
ax.set_yticks(y)
ax.set_yticklabels(models_r, fontsize=10)
ax.set_xlim(0, 245)
ax.set_xticks([])
leg = ax.legend(loc='lower right', frameon=False, fontsize=9.5,
                handlelength=1.2, handleheight=0.9, borderaxespad=0.4)
style_ax(ax)
ax.spines['bottom'].set_visible(False)
fig.savefig(f"{OUT}/chart-akash-depth.png", facecolor="white")
plt.close(fig)

print("charts done")
