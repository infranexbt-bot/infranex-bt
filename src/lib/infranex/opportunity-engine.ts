/**
 * OPPORTUNITY-ENGINE-1 — "A, B, C → RUN" — the action verdict.
 *
 * Blends the two signals the Subnets table already shows into ONE answer:
 *
 *   entry score (entry-score.ts, 0-100, grade A-F)
 *     — breadth of paid seats, pot outside the top-10% cohort, median-earner
 *       fairness, TAO/day per earning seat. What a FRESH seat can earn.
 *   seat safety (win-odds.ts tier)
 *     — Open field → Fightable → Knife fight → Don't enter. How hard the
 *       war for those seats is.
 *
 * Opportunity score = 70% entry score + 30% seat points (Open field 100 /
 * Fightable 65 / Knife fight 25 / Don't enter 0). Missing seat data leaves
 * the entry score untouched — the module never invents data. Score is null
 * when the entry score is null (no reward-spread measurement yet).
 *
 * Verdict — the blunt action list, evaluated first-match-wins:
 *   AVOID  seat tier DONT_ENTER (winner-take-all: a fresh seat earns ≈$0 and
 *          the registration burn still applies) OR entry grade D/F (the odds
 *          don't justify the burn even before the seat war).
 *   WATCH  grade C on a knife-fight field (marginal odds AND contested seats
 *          — wait for the spread to widen) OR no entry-score data yet.
 *   RUN    grade A, B or C (score ≥ 50) on anything better than a
 *          knife-fight field — the user-facing rule: "A, B, C → RUN".
 *          Grade A/B on a knife-fight field stays RUN (mathematically near-
 *          unreachable: 35 of the 100 entry points punish concentration, so
 *          a ≥65 grade cannot coexist with ≥85% whale take in real data)
 *          but carries a caution reason.
 *
 * Ranked opportunities: RUN first, then opportunity score desc — the strip
 * is the "where do I register RIGHT NOW" list.
 *
 * Client-safe pure module: no db, no server imports.
 */

import type { EntryScore, EntryScoreInput } from "./entry-score";
import { rankEntryScores } from "./entry-score";
import type { WinTier } from "./win-odds";
import { computeRawWinTier } from "./win-odds";

export type RunVerdict = "RUN" | "WATCH" | "AVOID";

export interface OpportunityVerdict {
  netuid: number;
  /** 0-100 = 70% entry score + 30% seat points; null when unmeasured. */
  score: number | null;
  verdict: RunVerdict;
  grade: EntryScore["grade"];
  tier: WinTier | null;
  /** The entry score this verdict was computed from (tooltip depth). */
  entry: EntryScore;
  /** Data-cited verdict reasons, worst first. */
  reasons: string[];
}

export const RUN_VERDICT_STYLES: Record<
  RunVerdict,
  { label: string; chipClass: string; dotClass: string; headline: string }
> = {
  RUN: {
    label: "Run",
    chipClass: "border-success/40 bg-success/10 text-success",
    dotClass: "bg-success",
    headline: "Grade A/B/C — the numbers support registering now",
  },
  WATCH: {
    label: "Watch",
    chipClass: "border-warning/40 bg-warning/10 text-warning",
    dotClass: "bg-warning",
    headline: "Marginal — re-check when the next 30s snapshot lands",
  },
  AVOID: {
    label: "Avoid",
    chipClass: "border-destructive/40 bg-destructive/10 text-destructive",
    dotClass: "bg-destructive",
    headline: "A fresh seat here is expected to earn ≈ $0",
  },
};

/** Lower = more urgent (RUN sorts first in the ranked strip). */
export const RUN_VERDICT_RANK: Record<RunVerdict, number> = {
  RUN: 0,
  WATCH: 1,
  AVOID: 2,
};

/** Seat-safety tier → 0-100 points for the blend (UNKNOWN/null → no seat
 *  leg; the entry score carries the whole score instead of a guess). */
const SEAT_PTS: Record<WinTier, number | null> = {
  OPEN_FIELD: 100,
  FIGHTABLE: 65,
  KNIFE_FIGHT: 25,
  DONT_ENTER: 0,
  UNKNOWN: null,
};

export function computeOpportunityVerdict(
  entry: EntryScore,
  tier: WinTier | null,
): OpportunityVerdict {
  const seatPts = tier != null ? SEAT_PTS[tier] : null;
  const score =
    entry.score == null
      ? null
      : seatPts == null
        ? entry.score
        : Math.round(entry.score * 0.7 + seatPts * 0.3);

  const reasons: string[] = [];
  let verdict: RunVerdict;

  if (tier === "DONT_ENTER") {
    verdict = "AVOID";
    reasons.push(
      "winner-take-all — a fresh seat earns ≈$0 while the registration burn still applies",
    );
  } else if (entry.grade === "D" || entry.grade === "F") {
    verdict = "AVOID";
    reasons.push(
      `new-entrant score ${entry.score ?? "?"}/100 (grade ${entry.grade}) — below the entry bar`,
    );
  } else if (entry.grade === "C" && tier === "KNIFE_FIGHT") {
    verdict = "WATCH";
    reasons.push(
      `grade C (${entry.score}/100) but pro farms take most of the pot — wait for the spread to widen`,
    );
  } else if (entry.grade === "A" || entry.grade === "B" || entry.grade === "C") {
    verdict = "RUN";
    reasons.push(
      `grade ${entry.grade} entry score ${entry.score}/100 — breadth and pot spread support a fresh seat`,
    );
    if (tier === "KNIFE_FIGHT") {
      reasons.push("knife-fight seats — expect scraps despite the grade");
    }
  } else {
    verdict = "WATCH";
    reasons.push(
      "no entry-score data yet — the verdict appears once the scan measures reward spread",
    );
  }

  if (verdict !== "AVOID" && tier === "OPEN_FIELD") {
    reasons.push("open-field seats — new registrations actually earn here");
  }
  if (entry.displacement) {
    reasons.push("subnet full — you must displace an incumbent");
  }

  return {
    netuid: entry.netuid,
    score,
    verdict,
    grade: entry.grade,
    tier,
    entry,
    reasons,
  };
}

/**
 * Rank a whole network of verdicts: RUN before WATCH before AVOID, then by
 * opportunity score (nulls last), then by the entry score's month-1 odds,
 * then netuid. This ordering IS the "Ranked opportunities" strip.
 */
export function rankOpportunityVerdicts(
  items: OpportunityVerdict[],
): OpportunityVerdict[] {
  return [...items].sort(
    (a, b) =>
      RUN_VERDICT_RANK[a.verdict] - RUN_VERDICT_RANK[b.verdict] ||
      (b.score ?? -1) - (a.score ?? -1) ||
      (b.entry.newcomerOddsPct ?? -1) - (a.entry.newcomerOddsPct ?? -1) ||
      a.netuid - b.netuid,
  );
}

/**
 * ONE snapshot pass → entry scores + seat tiers + verdicts, ranked. Single
 * code path shared by the Subnets leaderboard and the Opportunities page so
 * the two surfaces can never disagree on what RUN means.
 */
export function rankOpportunitiesFromSubnets(
  subs: EntryScoreInput[],
): { byNetuid: Map<number, OpportunityVerdict>; ranked: OpportunityVerdict[] } {
  const { byNetuid: entries } = rankEntryScores(subs);
  const items: OpportunityVerdict[] = [];
  for (const s of subs) {
    const entry = entries.get(s.netuid);
    if (!entry) continue;
    items.push(computeOpportunityVerdict(entry, computeRawWinTier(s)));
  }
  return {
    byNetuid: new Map(items.map((o) => [o.netuid, o])),
    ranked: rankOpportunityVerdicts(items),
  };
}

/** Tooltip body for an engine chip — verdict, blended score, month-1 odds
 *  and the reasons. Shared by the Subnets strip and the Opportunities strip. */
export function opportunityTooltip(o: OpportunityVerdict): string {
  const lines: string[] = [];
  lines.push(
    `${o.verdict} — opportunity score ${o.score ?? "?"}/100` +
      (o.entry.newcomerOddsPct != null
        ? ` · est. month-1 odds for a fresh seat ${o.entry.newcomerOddsPct}%`
        : ""),
  );
  lines.push(...o.reasons);
  lines.push(
    "score = entry score 70% + seat safety 30% (open 100 · fightable 65 · knife 25 · no-go 0) · verdict: grade A/B/C → RUN, knife-fight C or no data → WATCH, D/F or winner-take-all → AVOID",
  );
  return lines.join("\n");
}
