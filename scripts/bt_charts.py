#!/usr/bin/env python3
"""Charts for the Bittensor Complete Guide (Infranex BT).
Palette: Template 07 Crystal Blue body subset (one 215-deg hue family).
All text English (matches document language)."""
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

OUT = '/home/z/my-project/scripts/assets'
os.makedirs(OUT, exist_ok=True)

# Template 07 body palette
ACCENT = '#2d7ab3'
HEADER = '#1a4a7a'
MUTED = '#5a7a96'
BORDER = '#c0d0e2'
TEXT = '#142840'
LIGHT = '#7fa8c9'
PAGE = '#ffffff'

plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False
plt.rcParams['text.color'] = TEXT
plt.rcParams['axes.labelcolor'] = MUTED
plt.rcParams['xtick.color'] = MUTED
plt.rcParams['ytick.color'] = MUTED


def style_axes(ax):
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color(BORDER)
    ax.spines['bottom'].set_color(BORDER)
    ax.grid(True, linestyle='--', linewidth=0.5, alpha=0.2, color=HEADER)
    ax.set_axisbelow(True)


# ------------------------------------------------------------------
# Chart 1: TAO cumulative supply trajectory (historical + projected)
# ------------------------------------------------------------------
# Historical anchors (approximate, public dashboards):
#   genesis 2021.0 = 0; early 2023 = 2.8M; Apr 2025 = 8.0M;
#   Dec 2025 = 10.5M (first halving); Oct 2026 = 11.35M
# Post-halving projection: +3,600 TAO/day = +1.314M/yr; 15.75M ~ mid-2030.
hist_x = [2021.0, 2022.0, 2023.0, 2023.3, 2024.0, 2025.0, 2025.25, 2025.45, 2025.92]
hist_y = [0.0, 0.55, 2.2, 2.8, 4.9, 7.5, 8.0, 8.7, 10.5]
proj_x = [2025.92, 2026.0, 2026.83, 2027.5, 2028.5, 2029.5, 2030.45]
proj_y = [10.5, 10.63, 11.35, 12.33, 13.64, 14.96, 15.75]

fig, ax = plt.subplots(figsize=(7.4, 3.5), dpi=200, constrained_layout=True)
ax.plot(hist_x, hist_y, color=ACCENT, linewidth=2.4, solid_capstyle='round',
        label='Issued (historical)')
ax.plot(proj_x, proj_y, color=ACCENT, linewidth=2.2, linestyle='--',
        label='Projected at 3,600 TAO/day')

# Key-point markers only (first / halving / current / next-halving)
key_pts = [
    (2021.0, 0.0, 'Genesis\nJan 2021', (8, 8)),
    (2025.92, 10.5, 'First halving\nDec 2025', (-4, 14)),
    (2026.83, 11.35, '\u224811.3M\nOct 2026', (-14, -34)),
    (2030.45, 15.75, 'Second halving\n\u2248 2030 (15.75M)', (-116, -8)),
]
for x, y, label, (dx, dy) in key_pts:
    ax.scatter([x], [y], s=26, color=HEADER, zorder=5)
    ax.annotate(label, (x, y), textcoords='offset points', xytext=(dx, dy),
                fontsize=8.5, color=TEXT, linespacing=1.25)

ax.axvline(2025.92, color=BORDER, linewidth=0.9, linestyle=':', alpha=0.9)
ax.set_xlim(2020.7, 2031.0)
ax.set_ylim(0, 17.5)
ax.set_xticks([2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030])
ax.set_xlabel('Year', fontsize=9)
ax.set_ylabel('Cumulative TAO issued (millions)', fontsize=9)
ax.tick_params(labelsize=8.5)
style_axes(ax)
leg = ax.legend(loc='lower right', bbox_to_anchor=(1.0, 0.02), frameon=False,
                fontsize=8.5, handlelength=2.2)
fig.savefig(f'{OUT}/bt_supply.png', facecolor=PAGE)
plt.close(fig)

# ------------------------------------------------------------------
# Chart 2: Donut — intra-subnet alpha emission split (41/41/18)
# ------------------------------------------------------------------
labels = ['Miners  41%', 'Validators  41%', 'Subnet owner  18%']
sizes = [41, 41, 18]
cols = [HEADER, ACCENT, LIGHT]

fig, ax = plt.subplots(figsize=(7.0, 3.0), dpi=200, constrained_layout=True)
wedges, _ = ax.pie(
    sizes, colors=cols, startangle=90, counterclock=False,
    wedgeprops=dict(width=0.35, edgecolor='white', linewidth=2))
ax.set(aspect='equal')
ax.text(0, 0.06, 'Alpha', ha='center', va='center', fontsize=13,
        fontweight='bold', color=TEXT)
ax.text(0, -0.16, 'per epoch', ha='center', va='center', fontsize=9.5,
        color=MUTED)
legend = ax.legend(wedges, labels, loc='center left', bbox_to_anchor=(1.06, 0.5),
                   frameon=False, fontsize=10.5, handlelength=1.1,
                   handleheight=1.1, labelspacing=1.0)
fig.savefig(f'{OUT}/bt_donut.png', facecolor=PAGE)
plt.close(fig)

print('charts written:', os.listdir(OUT))
