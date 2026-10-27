import type { LiveOpportunity } from "./live-merge";
import type { SubnetOpportunityScore } from "./subnet-opportunity";
import type { NetEarningsEstimate } from "./net-earnings";
import type { EntryDifficultyVerdict } from "./entry-difficulty";

// ---------------------------------------------------------------------------
// OPPORTUNITY-CLASS-1 — the four-way action classification.
//
//   SCALE     demonstrated competitive performance + reliable data + positive
//             net TAO economics. NEVER granted on theoretical returns alone:
//             the reward vector must show a real share of seats earning (or a
//             trust-loop calibration from our own deployments must exist).
//   TEST      attractive economics with incomplete evidence — a small,
//             controlled validation deployment is the honest next step.
//   WATCHLIST interesting but under-researched (payout unverified, no P&L,
//             data too thin to size even a test).
//   AVOID     negative economics, incompatible hardware, below the user's own
//             minimum, or loss-making worst case. A net-negative row can
//             NEVER be classified anything else — enforced here and by the
//             score gate (cap 15) and the deployment API (refusal).
//
// Evaluated AVOID → SCALE → TEST → WATCHLIST, first match wins. Every
// classification carries its reasons AND the upgrade path (what evidence
// would move the row up) — a WATCHLIST row without a path is just noise.
// ---------------------------------------------------------------------------

export type OpportunityAction = "SCALE" | "TEST" | "WATCHLIST" | "AVOID";

export interface OpportunityClassification {
  id: string;
  netuid: number;
  action: OpportunityAction;
  /** One-sentence rationale. */
  headline: string;
  /** Evidence bullets behind the call. */
  reasons: string[];
  /** What would move this row up a tier — null for AVOID/SCALE. */
  upgradePath: string | null;
}

export const ACTION_META: Record<
  OpportunityAction,
  { label: string; className: string; detail: string }
> = {
  SCALE: {
    label: "Scale",
    className: "text-success border-success/40 bg-success/10",
    detail: "Demonstrated competitive performance, reliable data, positive net TAO — sized deployment justified.",
  },
  TEST: {
    label: "Test",
    className: "text-primary border-primary/40 bg-primary/10",
    detail: "Attractive economics, incomplete evidence — run a small controlled validation deployment first.",
  },
  WATCHLIST: {
    label: "Watchlist",
    className: "text-warning border-warning/40 bg-warning/10",
    detail: "Interesting but under-researched — needs better evidence before spending anything.",
  },
  AVOID: {
    label: "Avoid",
    className: "text-destructive border-destructive/40 bg-destructive/10",
    detail: "Negative economics, incompatible hardware, or below your own minimum — do not deploy.",
  },
};

export interface OpportunityClassDeps {
  score?: SubnetOpportunityScore;
  est?: NetEarningsEstimate | null;
  difficulty?: EntryDifficultyVerdict;
  /** Trust-loop calibration: mean actual÷projected across our own miners
   *  with ≥ 7 miner-days of history (null = no observed sample yet). */
  calibrationAccuracy?: number | null;
}

export function computeOpportunityClass(
  o: LiveOpportunity,
  deps: OpportunityClassDeps = {}
): OpportunityClassification {
  const { score, est, difficulty, calibrationAccuracy } = deps;
  const net = o.netMonthlyUsd;
  const gates = score?.gates ?? [];
  const gateOf = (kind: string) => gates.some((g) => g.kind === kind);

  // --- AVOID — hard refusal tier ------------------------------------------
  const avoidReasons: string[] = [];
  if (net != null && net < 0)
    avoidReasons.push(`Net −$${Math.abs(Math.round(net)).toLocaleString()}/mo — every epoch worked loses money; deployment is refused regardless of score.`);
  if (gateOf("NET_NEGATIVE") && net == null)
    avoidReasons.push("The profitability gate flagged negative economics under the active cost basis.");
  if (gateOf("HARDWARE_INCOMPATIBLE"))
    avoidReasons.push(gates.find((g) => g.kind === "HARDWARE_INCOMPATIBLE")!.detail);
  if (gateOf("NET_BELOW_TARGET"))
    avoidReasons.push("Below your own minimum net-profit target — you set this floor in settings; honoring it means not deploying.");
  if (est?.conservativeVerdict === "LOSS_MAKING")
    avoidReasons.push("Loss-making worst case: even the base month is negative.");
  if (avoidReasons.length) {
    return {
      id: o.id,
      netuid: o.netuid,
      action: "AVOID",
      headline: "Do not deploy — the refusal reasons below are hard, not stylistic.",
      reasons: avoidReasons,
      upgradePath: null,
    };
  }

  // --- positive-economics tiers need a positive base net -------------------
  if (net == null || net <= 0 || !est) {
    return {
      id: o.id,
      netuid: o.netuid,
      action: "WATCHLIST",
      headline:
        net == null || !est
          ? "No P&L for this subnet yet — nothing to size a deployment against."
          : "Economics are break-even at best under the active cost basis.",
      reasons:
        net == null || !est
          ? ["The profitability engine has no estimate for this row — missing cost or revenue data.", "Watch until the P&L exists; do not fund a guess."]
          : [`Base net $${Math.round(net).toLocaleString()}/mo — rewards do not meaningfully clear costs.`],
      upgradePath: "A P&L with positive net under the current settings moves this to TEST.",
    };
  }

  const conf = score?.dataConfidence ?? 0;
  const ratio = o.rewardedRatio;
  const measuredPerformance =
    (ratio != null && ratio >= 0.25) ||
    (calibrationAccuracy != null && calibrationAccuracy >= 0.7);
  const payoutVerified = Boolean(o.mechanics || o.requirementsSource);
  const conservativePositive = est.conservative.netMonthlyUsd >= 0;
  const diff = difficulty?.difficulty;
  const reasonBits: string[] = [];

  // --- SCALE — the evidence tier -------------------------------------------
  const scaleBlockers: string[] = [];
  if (!payoutVerified) scaleBlockers.push("payout mechanism unverified");
  if (!measuredPerformance)
    scaleBlockers.push(
      ratio == null
        ? "no reward-vector measurement that comparable miners earn"
        : `only ${Math.round(ratio * 100)}% of seats earned last epoch (want ≥ 25%)`
    );
  if (conf < 0.5) scaleBlockers.push(`data confidence ${Math.round(conf * 100)}% (want ≥ 50%)`);
  if (!conservativePositive) scaleBlockers.push("the conservative (worst) month is negative");
  if (diff === "DIFFICULT" || diff === "UNKNOWN") scaleBlockers.push(`entry difficulty is ${diff ?? "unclassified"}`);
  if (scaleBlockers.length === 0) {
    reasonBits.push(`Base net $${Math.round(net).toLocaleString()}/mo; worst month still ≥ 0 (${est.conservative.netMonthlyUsd >= 0 ? `$${est.conservative.netMonthlyUsd.toLocaleString()}` : "—"}).`);
    if (ratio != null) reasonBits.push(`${Math.round(ratio * 100)}% of registered seats earned last epoch — performance is measured, not modeled.`);
    if (calibrationAccuracy != null) reasonBits.push(`Trust-loop: our own miners realized ${Math.round(calibrationAccuracy * 100)}% of projections.`);
    reasonBits.push(`Data confidence ${Math.round(conf * 100)}%; entry difficulty ${diff ?? "n/a"}.`);
    return {
      id: o.id,
      netuid: o.netuid,
      action: "SCALE",
      headline: "Evidence-backed: positive net economics + measured miner performance + reliable data.",
      reasons: reasonBits,
      upgradePath: null,
    };
  }

  // --- TEST — promising economics, incomplete evidence ---------------------
  const testReasons: string[] = [
    `Base net $${Math.round(net).toLocaleString()}/mo clears the cost stack — the economics are attractive.`,
    ...scaleBlockers.map((b) => `Not SCALE yet: ${b}.`),
  ];
  if (est.conservativeVerdict === "RAMP_LOSS")
    testReasons.push(`First months run at −$${Math.abs(est.conservative.netMonthlyUsd).toLocaleString()}/mo before ramping — a small deployment bounds that bleed.`);
  return {
    id: o.id,
    netuid: o.netuid,
    action: "TEST",
    headline: "Attractive economics, incomplete evidence — validate small before scaling.",
    reasons: testReasons,
    upgradePath:
      "Collect deployment actuals (trust-loop) or wait for a reward-vector measurement showing ≥ 25% of seats earning.",
  };

  // WATCHLIST rows (payout unverified / thin data with positive net) are
  // produced by the caller via classifyWithWatchlist below — kept out of the
  // hot path because the PAYOUT_UNVERIFIED gate already caps those rows at
  // score ≤ 49, and the gate list is the single source of truth.
}

/** Full classification pass: computeOpportunityClass + the WATCHLIST tier the
 *  pure function above deliberately leaves unhandled (payout-unverified or
 *  data-thin rows that still clear AVOID/TEST logic must not read as TEST —
 *  spending money on an unverified payout is exactly what the spec forbids). */
export function classifyOpportunity(
  o: LiveOpportunity,
  deps: OpportunityClassDeps = {}
): OpportunityClassification {
  const cls = computeOpportunityClass(o, deps);
  if (cls.action !== "TEST") return cls;
  const payoutVerified = Boolean(o.mechanics || o.requirementsSource);
  const conf = deps.score?.dataConfidence ?? 0;
  if (!payoutVerified) {
    return {
      ...cls,
      action: "WATCHLIST",
      headline: "Interesting economics, but nobody has verified how miners get paid here.",
      reasons: [
        ...cls.reasons.filter((r) => !r.startsWith("Not SCALE")),
        "No curated mechanics and no repo source confirm the payout mechanism — research before any spend.",
      ],
      upgradePath: "Verify the payout mechanism (official docs/repo) — then this re-classifies as TEST.",
    };
  }
  if (conf < 0.3) {
    return {
      ...cls,
      action: "WATCHLIST",
      headline: "Positive net on paper, but the data behind it is too thin to size even a test.",
      reasons: [
        ...cls.reasons.filter((r) => !r.startsWith("Not SCALE")),
        `Data confidence ${Math.round(conf * 100)}% — below the 30% floor for a validation deployment.`,
      ],
      upgradePath: "More verified signals (reward vector, demand composite, repo requirements) re-classify this as TEST.",
    };
  }
  return cls;
}

export function classifyOpportunityMap(
  rows: LiveOpportunity[],
  deps: (o: LiveOpportunity) => OpportunityClassDeps
): Map<string, OpportunityClassification> {
  const m = new Map<string, OpportunityClassification>();
  for (const r of rows) {
    if (!r?.id) continue;
    try {
      m.set(r.id, classifyOpportunity(r, deps(r)));
    } catch {
      // An unclassifiable row stays unclassified — never breaks the table.
    }
  }
  return m;
}
