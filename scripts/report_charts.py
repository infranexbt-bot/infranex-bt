#!/usr/bin/env python3
"""Charts for the Bittensor earning-chances report (English labels).
Follows typesetting/charts.md: no top/right spines, no gridlines when values
are labeled, donut hole 65%, legend outside without frame, palette colors only.
"""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.font_manager as fm

fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')

import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# Cascade palette (from palette.cascade, seed 42)
ACCENT    = '#92761f'
ACCENT_2  = '#3aa0c2'
HEADER    = '#4e4732'
ICON      = '#a48e4b'
BORDER    = '#c5bfac'
TEXT      = '#151513'
MUTED     = '#7e7c74'
CARD      = '#ebeae8'

OUT = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(OUT, 'report_assets')
os.makedirs(ASSETS, exist_ok=True)

# ------------------------------------------------------------------
# Chart 1: CPU contenders - average miner monthly USD (horizontal bar)
# ------------------------------------------------------------------
rows = [
    ('SN61 RedTeam', 2206), ('SN41 Almanac', 1705), ('SN67 Harnyx', 1299),
    ('SN5 Hone', 1291), ('SN78 Umi', 814), ('SN83 CliqueAI', 809),
    ('SN105 Beam', 621), ('SN50 Synth', 480), ('SN101 Tag101', 372),
    ('SN33 ReadyAI', 368), ('SN79 MVTRX', 309), ('SN45 AlphaRidge', 251),
]
rows = rows[::-1]  # smallest at bottom -> largest on top
labels = [r[0] for r in rows]
vals = [r[1] for r in rows]
colors_bar = [ACCENT if l == 'SN61 RedTeam' else ICON for l in labels]
alpha = [1.0 if l == 'SN61 RedTeam' else 0.55 for l in labels]

fig, ax = plt.subplots(figsize=(7.4, 4.4), constrained_layout=True)
bars = ax.barh(labels, vals, color=colors_bar, edgecolor='none', height=0.62)
for b, a in zip(bars, alpha):
    b.set_alpha(a)
for b, v in zip(bars, vals):
    ax.text(b.get_width() + 28, b.get_y() + b.get_height() / 2,
            f'${v:,}', va='center', ha='left', fontsize=10, color=TEXT)
ax.set_xlim(0, 2600)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_visible(False)
ax.spines['bottom'].set_color(BORDER)
ax.tick_params(axis='y', length=0, labelsize=10, colors=TEXT)
ax.tick_params(axis='x', labelsize=9, colors=MUTED)
ax.xaxis.grid(False)  # values labeled directly -> no gridlines
ax.set_xlabel('Reward per average earning miner (USD/month)', fontsize=10, color=MUTED)
fig.savefig(os.path.join(ASSETS, 'cpu_picks.png'), dpi=200, facecolor='white')
plt.close(fig)

# ------------------------------------------------------------------
# Chart 2: Donut - 124 emitting subnets by earning-chances tier
# ------------------------------------------------------------------
tier_labels = [
    'Tier B - Open seats, whale lottery (10)',
    'Tier C - Full but meritocratic (16)',
    'Tier D - Whale-dominated or full (98)',
]
tier_vals = [10, 16, 98]
tier_cols = [ACCENT_2, ACCENT, BORDER]

fig, ax = plt.subplots(figsize=(7.4, 3.6), constrained_layout=True)
wedges, _ = ax.pie(
    tier_vals, colors=tier_cols, startangle=90, counterclock=False,
    wedgeprops=dict(width=0.35, edgecolor='white', linewidth=1.5))
ax.text(0, 0.06, '124', ha='center', va='center', fontsize=22,
        fontweight='bold', color=TEXT)
ax.text(0, -0.24, 'emitting\nsubnets', ha='center', va='center',
        fontsize=9, color=MUTED, linespacing=1.2)
ax.set(aspect='equal')
# Rich legend to the right (Strategy C: zero text on the chart body)
leg = fig.legend(wedges, tier_labels, loc='outside center right',
                 frameon=False, fontsize=10, handlelength=1.0,
                 handleheight=1.0, labelspacing=1.1)
for t in leg.get_texts():
    t.set_color(TEXT)
fig.savefig(os.path.join(ASSETS, 'tier_donut.png'), dpi=200, facecolor='white')
plt.close(fig)

print('charts written to', ASSETS)
