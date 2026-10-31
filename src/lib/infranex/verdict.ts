import type { OpportunityClassification } from "./opportunity-class";
import { classifyOpportunityMap } from "./opportunity-class";
import { computeOpportunityScoreMap } from "./subnet-opportunity";
import { computeNetEarningsMap } from "./net-earnings";
import { computeEntryDifficultyMap } from "./entry-difficulty";
import type { LiveOpportunity } from "./live-merge";
import type { ProfitabilityConfig } from "./profitability";

// ---------------------------------------------------------------------------
// VERDICT-UNIFY-2 — ONE verdict, derived from the evidence engine.
//
// THE BUG THIS KILLS: after OPPORTUNITY-SCORE-2 (the 7-factor evidence score)
// and OPPORTUNITY-CLASS-1 (SCALE/TEST/WATCHLIST/AVOID) shipped, the app still
// displayed RUN/WATCH/AVOID from the LEGACY conviction engine (mine-pick.ts:
// 40% rent-earn + 35% diligence + 25% confidence). The two engines disagreed
// on the same rows: the evidence engine classified 21 rows SCALE/TEST (worth
// acting on), while the legacy verdict showed RUN=4 · WATCH=0 · AVOID=124.
// WATCH=0 was structural, not informational: any diligence DO-NOT-PROVISION
// caps conviction at 30 — BELOW the WATCH band floor (35) — so the middle of
// the distribution collapsed straight into AVOID and the dashboard read as
// "nothing exists except 4 magic rows".
//
// THE FIX: the unified verdict is now DERIVED from the evidence pipeline —
// the same score the table ranks by and the same classification it shows:
//
//   AVOID   classification AVOID (negative net, below user's own minimum,
//           hardware-incompatible, or loss-making worst case). Hard refusal
//           tier — identical to the classification, no re-derivation.
//   RUN     classification SCALE (evidence tier), OR classification TEST
//           with effectiveScore ≥ 50 (the score's own VIABLE band) AND
//           dataConfidence ≥ 0.5. A TEST row is an honest "run a small
//           controlled validation deployment" — that IS running it; the
//           classification chip carries the size nuance, the verdict answers
//           act / don't act.
//   WATCH   everything else (WATCHLIST rows, weak-TEST rows, unclassifiable
//           rows) — interesting, not yet actionable.
//
// HARD RULES PRESERVED (inherited from the score's gates, not re-implemented):
//   · negative net TAO → NET_NEGATIVE gate → classification AVOID → verdict
//     AVOID. A negative-economics row can NEVER read RUN, at any score.
//   · PAYOUT_UNVERIFIED caps effectiveScore at 49 < 50, so a payout-unverified
//     row can NEVER read RUN (it is WATCHLIST-classified anyway).
//   · HARDWARE_INCOMPATIBLE caps at 44 and classifies AVOID on the rented
//     basis — never RUN.
//   · Missing data lowers dataConfidence and the classification tier — it
//     can never lift a row into RUN.
//
// The legacy conviction number stays meaningful as a SORT lens (seat quality)
// and inside the detail dialog's gate explanation — but it no longer decides
// what the word RUN means anywhere in the app.
// ---------------------------------------------------------------------------

export type UnifiedVerdict = "RUN" | "WATCH" | "AVOID";

/** RUN bar for TEST rows = the score's own VIABLE band floor (bandOf: ≥50). */
export const VERDICT_RUN_MIN_SCORE = 50;
/** RUN bar for TEST rows = at least half the data behind the number. */
export const VERDICT_MIN_CONFIDENCE = 0.5;

/** Derive the unified verdict from the evidence classification + score.
 *  Pure — safe on client and server. An unclassified row (engine threw on a
 *  malformed row) stays WATCH: never AVOID by fiat, never RUN without proof. */
export function unifiedVerdict(
  cls: OpportunityClassification | undefined,
  opts: { effectiveScore?: number | null; dataConfidence?: number | null } = {}
): UnifiedVerdict {
  if (!cls) return "WATCH";
  switch (cls.action) {
    case "AVOID":
      return "AVOID";
    case "SCALE":
      return "RUN";
    case "TEST": {
      const s = opts.effectiveScore ?? 0;
      const c = opts.dataConfidence ?? 0;
      return s >= VERDICT_RUN_MIN_SCORE && c >= VERDICT_MIN_CONFIDENCE ? "RUN" : "WATCH";
    }
    case "WATCHLIST":
      return "WATCH";
  }
}

/** Single-pass verdict map over merged opportunity rows. Builds the SAME
 *  score + classification maps the table ranks by (same ctx parameters, so
 *  the verdict can never disagree with the row's own score column), then
 *  derives the verdict per row. Keyed by row id. */
export function computeVerdictMapFor(
  rows: LiveOpportunity[],
  profConfig?: ProfitabilityConfig | null
): Map<string, UnifiedVerdict> {
  const scoreMap = computeOpportunityScoreMap(rows as never[], {
    hardwareMode: profConfig?.hardwareMode === "owned" ? "owned" : "rented",
    minNetTargetUsd: profConfig?.minNetProfitTargetUsd,
    weights: profConfig?.opportunityWeights,
  });
  const estContext = {
    minNetTargetUsd: profConfig?.minNetProfitTargetUsd,
    hardwareMode: profConfig?.hardwareMode,
  };
  const estMap = computeNetEarningsMap(rows as never[], estContext);
  const diffMap = computeEntryDifficultyMap(rows as never[]);
  const clsMap = classifyOpportunityMap(rows as never, (o) => ({
    score: scoreMap.get(o.id),
    est: estMap.get(o.id) ?? null,
    difficulty: diffMap.get(o.id) as never,
  }));
  const out = new Map<string, UnifiedVerdict>();
  for (const r of rows) {
    if (!r?.id) continue;
    const s = scoreMap.get(r.id);
    out.set(
      r.id,
      unifiedVerdict(clsMap.get(r.id), {
        effectiveScore: s?.effectiveScore,
        dataConfidence: s?.dataConfidence,
      })
    );
  }
  return out;
}
