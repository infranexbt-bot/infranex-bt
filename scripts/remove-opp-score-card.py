#!/usr/bin/env python3
"""Remove the TAO Opportunity Score card (mine vs stake) from dashboard-view.tsx.

Deletes, bottom-up-safe via marker anchoring:
1. The <OpportunityScoreCard /> render block + its JSX comment
2. The exclusive helper block: CAPITAL_KEY, formatINR, riskBadgeClass,
   scoreColor, ScoreRing, clampScore, StrategyRow (comment banner through
   the blank line before TRUST_VERDICT_ORDER)
3. The OpportunityScoreCard component (function start through EOF)
4. Orphaned imports: react hooks line, 4 lucide icons, Input ui import,
   opportunity-score import, formatBurnTao import
"""
import re

PATH = "/home/z/my-project/src/components/views/dashboard-view.tsx"

with open(PATH) as f:
    lines = f.readlines()

# --- 1. Component through EOF --------------------------------------------
comp_idx = next(i for i, l in enumerate(lines) if l.startswith("function OpportunityScoreCard("))
del lines[comp_idx:]
# strip trailing blank lines
while lines and lines[-1].strip() == "":
    lines.pop()
lines.append("\n")

# --- 2. Helper block: banner comment -> TRUST_VERDICT_ORDER ---------------
banner_idx = None
for i, l in enumerate(lines):
    if l.strip() == "// ---------------------------------------------------------------------------" \
       and i + 1 < len(lines) and lines[i + 1].startswith("// TAO Opportunity Score"):
        banner_idx = i
        break
assert banner_idx is not None, "helper banner not found"
trust_idx = next(i for i, l in enumerate(lines) if l.startswith("const TRUST_VERDICT_ORDER"))
assert trust_idx > banner_idx, "unexpected order"
del lines[banner_idx:trust_idx]

# --- 3. Render block -------------------------------------------------------
content = "".join(lines)
render_block = (
    "\n      {/* TAO Opportunity Score — mine vs stake, in numbers */}\n"
    "      <OpportunityScoreCard\n"
    "        onNavigate={onNavigate}\n"
    "        onStartMining={onStartMining}\n"
    "        onSelectOpportunity={onSelectOpportunity}\n"
    "      />\n"
)
assert render_block in content, "render block not found"
content = content.replace(render_block, "\n")

# --- 4. Orphaned imports ---------------------------------------------------
removals = [
    'import { useEffect, useMemo, useState } from "react";\n',
    'import { formatBurnTao } from "@/lib/infranex/miner-score";\n',
    'import { Input } from "@/components/ui/input";import { computeOpportunityScore, type OpportunityScoreResult, type ScoredStrategy } from "@/lib/infranex/opportunity-score";\n',
]
for r in removals:
    assert r in content, f"import not found: {r[:60]}"
    content = content.replace(r, "")

old_icons = 'import { RefreshCw, Network, TrendingUp, Coins, Activity, ArrowRight, Pickaxe, Landmark, ShieldQuestion, BadgeCheck, Armchair } from "lucide-react";'
new_icons = 'import { RefreshCw, Network, TrendingUp, Coins, Activity, ArrowRight, BadgeCheck } from "lucide-react";'
assert old_icons in content, "icons import not found"
content = content.replace(old_icons, new_icons)

with open(PATH, "w") as f:
    f.write(content)

n = len(content.splitlines())
print(f"OK — dashboard-view.tsx now {n} lines")

# sanity: no residual references
for pat in ["OpportunityScoreCard", "ScoreRing", "StrategyRow", "formatINR",
            "riskBadgeClass", "scoreColor", "clampScore", "CAPITAL_KEY",
            "computeOpportunityScore", "formatBurnTao", "Armchair", "ShieldQuestion"]:
    hits = [i + 1 for i, l in enumerate(content.splitlines()) if pat in l]
    if hits:
        print(f"RESIDUAL {pat}: lines {hits}")
print("sanity check done")
