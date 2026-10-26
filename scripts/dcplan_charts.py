#!/usr/bin/env python3
"""Charts for the Mini GPU Datacenter Investment Plan (Template 07 Crystal Blue family).
Rules applied (typesetting/charts.md + system rules): top/right spines deleted,
dashed grid 20% opacity (deleted when values are labeled), horizontal bars for long
labels, legend without border, constrained_layout=True (never tight_layout),
English labels matching user language, blue-family palette from the cover system.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.font_manager as fm
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
import matplotlib.pyplot as plt

plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# Crystal Blue family (Template 07 body palette)
ACCENT = '#2d7ab3'
DEEP = '#1a4a7a'
MUTED = '#7a9bb8'
LIGHT = '#c0d0e2'
TEXT = '#142840'
BULL = '#3a8a6d'   # muted semantic green (allowed exception)
BEAR = '#b0616a'   # muted semantic red

ASSETS = '/home/z/my-project/scripts/assets'
import os
os.makedirs(ASSETS, exist_ok=True)

# ------------------------------------------------------------------
# Chart 1 — measured 30d hosting earnings per GPU card (horizontal bars)
# ------------------------------------------------------------------
cards = ['RTX 5090', 'RTX 6000 Ada', 'A100 80GB', 'RTX PRO 6000 WS',
         'RTX PRO 6000 Server', 'H100 80GB', 'H200 141GB', 'B300']
monthly = [464, 599, 778, 942, 1092, 1388, 3118, 6238]

fig, ax = plt.subplots(figsize=(7.6, 4.2), constrained_layout=True)
colors = [LIGHT, LIGHT, LIGHT, LIGHT, MUTED, ACCENT, DEEP, LIGHT]
bars = ax.barh(cards, monthly, color=colors, height=0.62, edgecolor='none')
for b, v in zip(bars, monthly):
    ax.text(v + 90, b.get_y() + b.get_height() / 2, f'${v:,}',
            va='center', ha='left', fontsize=10, color=TEXT)
ax.set_xlim(0, 7100)
for s in ['top', 'right', 'left']:
    ax.spines[s].set_visible(False)
ax.spines['bottom'].set_color(LIGHT)
ax.tick_params(axis='y', length=0, labelsize=10, colors=TEXT)
ax.tick_params(axis='x', labelsize=9, colors=MUTED)
ax.set_xlabel('Measured provider earnings, USD per GPU-month (trailing 30d, Oct 2026)',
              fontsize=9, color=MUTED)
ax.grid(False)
fig.savefig(f'{ASSETS}/dcplan_hosting_yield.png', dpi=200, facecolor='white')
plt.close(fig)

# ------------------------------------------------------------------
# Chart 2 — cumulative net cashflow vs months (bear / base / bull)
# ------------------------------------------------------------------
import numpy as np
months = np.arange(0, 25)
CAPEX = 38.0  # $k hardware capex
base = -CAPEX + 2.645 * months
bear = -CAPEX + 1.270 * months
bull = -CAPEX + 3.180 * months

fig, ax = plt.subplots(figsize=(7.6, 4.0), constrained_layout=True)
ax.axhline(0, color=MUTED, linewidth=0.8, linestyle='--', alpha=0.5)
for series, color, label in ((bull, BULL, 'Bull (90% occ, market-ask $2.50/hr)'),
                             (base, ACCENT, 'Base (87% occ, realized $1.92/hr)'),
                             (bear, BEAR, 'Bear (measured earnings -50%)')):
    ax.plot(months, series, color=color, linewidth=2.4, label=label, solid_capstyle='round')
    ax.fill_between(months, series, -CAPEX, color=color, alpha=0.06)

def be_m(rate):
    return CAPEX / (rate * 12.0 / 12.0) if rate else 0

offsets = {BULL: (8, 12), ACCENT: (8, -18), BEAR: (8, -16)}  # staggered to avoid label collision
for rate, color in ((3.180, BULL), (2.645, ACCENT), (1.270, BEAR)):
    m = CAPEX / rate
    y = 0.0
    ax.plot([m], [0], marker='o', markersize=5, color=color, zorder=5)
    dx, dy = offsets[color]
    ax.annotate(f'breakeven {m:.0f} mo', (m, 0), textcoords='offset points',
                xytext=(dx, dy), fontsize=8.5, color=color)

ax.set_xlim(0, 24)
ax.set_ylim(-42, 45)
ax.set_xticks(range(0, 25, 4))
ax.set_xlabel('Months from first hosting revenue', fontsize=9.5, color=TEXT)
ax.set_ylabel('Cumulative net cashflow ($k)', fontsize=9.5, color=TEXT)
for s in ['top', 'right']:
    ax.spines[s].set_visible(False)
for s in ['left', 'bottom']:
    ax.spines[s].set_color(LIGHT)
ax.tick_params(labelsize=9, colors=MUTED)
ax.grid(True, linestyle='--', alpha=0.2, linewidth=0.5)
leg = ax.legend(loc='upper left', bbox_to_anchor=(0, 1.02), frameon=False,
                fontsize=8.6, handlelength=1.6)
fig.savefig(f'{ASSETS}/dcplan_payback.png', dpi=200, facecolor='white')
plt.close(fig)

print('charts written to', ASSETS)
