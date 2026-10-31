import type { Opportunity } from "./types";
import {
  computeRentEarn,
  type CostBasis,
  type CostBasisMode,
  type RentEarnVerdict,
  type RentEarnBand,
  resolveCostBasis,
} from "./rent-earn";
import { computeDiligence, type DiligenceReport } from "./diligence";

// ---------------------------------------------------------------------------
// MINE-PICK ENGINE — "which subnet do I actually point my rig at?" (mode-aware:
// a rented rig on the rented basis, the user's own rig on the owned basis)
//
// The Dashboard's TAO Opportunity Score card pits one best mining subnet
// against staking; this engine widens the lens to EVERY net-positive subnet
// and combines the three independent signals the platform already computes:
//
//   1. RENT EARN (weight 40) — rent-earn.ts: can the rig legally run it
//      (hosting gate — rented-container gate on the rented basis, TEE-class
//      capability gate on the owned basis) + seat reality (rewarded ratio,
//      whale take) + new-entrant EV.
//   2. DILIGENCE PIPELINE (weight 35) — diligence.ts: the 14-stage
//      due-diligence checklist (activity, registration, hardware proof,
//      competition, liquidity, cost, downside…). Stages map to a 0–100
//      health; a hard "DO NOT PROVISION" verdict caps the conviction.
//   3. CONFIDENCE (weight 25) — the row's model confidence (Ledger composite
//      scaled 0–1) — how much verified data backs the projection.
//
// Output: 0–100 CONVICTION score + ONE verdict (RUN / WATCH / AVOID) per
// subnet, ranked — the single decision ranking surfaced by the Dashboard's
// "Start here" card and the Opportunities page's ranked list alike.
//
// WEIGHTS ARE MODE-AWARE (OWNED-RIG-1):
//   rented (40% rent-earn + 35% diligence + 25% confidence) — a rented
//     operator burns cash hourly, so the due-diligence pipeline anchors the
//     decision almost as hard as earning reality.
//   owned (55% earn-pick + 25% diligence + 20% confidence) — the rig is
//     already bought (sunk cost); what matters is whether a seat pays the
//     power bill. Diligence keeps its HARD GATE (any fail → DO NOT
//     PROVISION → capped) but loses a third of its score weight — its
//     warnings describe docs/uncertainty, not the seat's odds.
// ---------------------------------------------------------------------------

export type MinePickBand = "PRIME" | "READY" | "MARGINAL" | "NO-GO";

// VERDICT-UNIFY-1 — ONE decision vocabulary for the whole app. The picker's
// PRIME/READY/MARGINAL/NO-GO bands and the Ledger's RUN/WATCH/AVOID used to
// be two parallel answers to the same question; now every surface speaks
// RUN / WATCH / AVOID, derived from the conviction engine (the only one that
// weighs rig gate × seat reality × diligence × confidence × min-profit).
export type UnifiedVerdict = "RUN" | "WATCH" | "AVOID";

export const VERDICT_STYLE: Record<
  UnifiedVerdict,
  { label: UnifiedVerdict; color: string; bg: string }
> = {
  RUN: { label: "RUN", color: "text-success", bg: "bg-success/10" },
  WATCH: { label: "WATCH", color: "text-warning", bg: "bg-warning/10" },
  AVOID: { label: "AVOID", color: "text-destructive", bg: "bg-destructive/10" },
};

/** Band → verdict: PRIME/READY earn the rig, MARGINAL is watch-and-read,
 *  anything gated or below 35 conviction is a no-go. */
export function bandToVerdict(band: MinePickBand): UnifiedVerdict {
  if (band === "PRIME" || band === "READY") return "RUN";
  if (band === "MARGINAL") return "WATCH";
  return "AVOID";
}

export interface MinePick {
  /** Net-positive opportunity row (netuid > 0). */
  o: Opportunity;
  rent: RentEarnVerdict;
  diligence: DiligenceReport;
  /** 14-stage pipeline health, 0–100 (pass=100, info=75, warn=50, fail=0). */
  diligenceHealth: number;
  /** Model confidence 0–100. */
  confidencePct: number;
  /** Combined conviction 0–100. Mode-aware weights (OWNED-RIG-1): rented =
   *  40% rent-earn + 35% diligence + 25% confidence · owned = 55% earn-pick
   *  + 25% diligence + 20% confidence. */
  conviction: number;
  band: MinePickBand;
  /** THE verdict — RUN / WATCH / AVOID (see VERDICT-UNIFY-1 above). */
  verdict: UnifiedVerdict;
  /** CPU-only work (no VRAM) vs GPU rig. */
  hardware: "CPU" | "GPU";
  /** One-line drivers behind the band. */
  reasons: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Mirror of rent-earn's isCpuWork — kept local so the engine stays decoupled. */
function isCpuWork(o: Opportunity): boolean {
  return (
    o.minVramGb <= 0 ||
    (o.workType ?? "").toLowerCase().includes("cpu") ||
    /cpu/i.test(o.recommendedGpu ?? "")
  );
}

/** 14-stage diligence → single 0–100 health number. Info stages (rare,
 *  purely explanatory) count 75 so they neither reward nor punish. */
function diligenceHealth(d: DiligenceReport): number {
  if (d.stages.length === 0) return 50;
  const pts = d.stages.reduce(
    (s, st) =>
      s +
      (st.status === "pass"
        ? 100
        : st.status === "info"
          ? 75
          : st.status === "warn"
            ? 50
            : 0),
    0
  );
  return Math.round(pts / d.stages.length);
}

/** One gate line each — the reasons array reads top-down like a checklist. */
function gateReasons(pick: {
  rent: RentEarnVerdict;
  diligence: DiligenceReport;
  diligenceHealth: number;
  confidencePct: number;
  o: Opportunity;
}): string[] {
  const { rent, diligence, confidencePct, o } = pick;
  const reasons: string[] = [];
  if (!rent.rentable) reasons.push(rent.rentBlock ?? "Blocked by the hosting gate");
  if (diligence.verdict === "DO NOT PROVISION")
    reasons.push(
      `${diligence.failCount} diligence stage${diligence.failCount === 1 ? "" : "s"} failed — ${diligence.verdict.toLowerCase()}`
    );
  else if (diligence.verdict === "CONDITIONAL")
    reasons.push(`${diligence.warnCount} diligence warnings — read them before the burn`);
  if (rent.knifeFight) reasons.push("Knife-fight seat — top UIDs take nearly all rewards");
  else if (rent.whaleMean) reasons.push("Whale-mean economics — few seats earn");
  if (rent.entry === "free-slot") reasons.push("Free seats open right now");
  if (rent.expectedNetMonthlyUsd != null)
    reasons.push(`New-entrant EV ≈ $${rent.expectedNetMonthlyUsd.toLocaleString()}/mo net`);
  if (confidencePct < 40) reasons.push("Low model confidence — thin verified data");
  if (o.earnChance?.pct != null)
    reasons.push(`${o.earnChance.pct}% month-1 earn chance`);
  return reasons;
}

/** Compute the MINE-PICK verdict for one net-positive row. Pure — safe on
 *  client and server; reuses computeRentEarn + computeDiligence so the
 *  Dashboard picker agrees with the Opportunities page by construction.
 *  `basis` follows the active cost basis (+ owned-rig profile, OWNED-RIG-1)
 *  so the picker's gate + reasons read owned-rig language when the basis is
 *  Owned — and weights shift to 55/25/20 (earn/diligence/confidence). */
export function computeMinePick(
  o: Opportunity,
  basis: CostBasisMode | CostBasis = "rent"
): MinePick {
  const b = resolveCostBasis(basis);
  const owned = b.mode === "owned";
  const rent = computeRentEarn(o, b);
  const diligence = computeDiligence(o);
  const health = diligenceHealth(diligence);
  const confidencePct = clamp(Math.round((o.confidence ?? 0.5) * 100), 0, 100);

  // Combined conviction — mode-aware weights (OWNED-RIG-1): on an OWNED rig
  // the seat's earning reality dominates (55%) and diligence drops to 25%
  // (still hard-gating); a rented rig keeps the pipeline-heavy 40/35/25.
  // Rent earn leads either way because a rig that can't run the work (or a
  // seat that never earns) invalidates the other two.
  const w = owned
    ? { earn: 0.55, dilig: 0.25, conf: 0.2 }
    : { earn: 0.4, dilig: 0.35, conf: 0.25 };
  let conviction = Math.round(
    rent.score * w.earn + health * w.dilig + confidencePct * w.conf
  );

  // Hard gates — no band above NO-GO can survive them:
  //   not rentable (rent-earn already forces ≤24), a failed diligence stage
  //   (the pipeline's own DO-NOT-PROVISION), or the minimum-profit rule.
  if (!rent.rentable) conviction = Math.min(conviction, 24);
  if (diligence.verdict === "DO NOT PROVISION") conviction = Math.min(conviction, 30);
  if (o.meetsMinimum === false) conviction = Math.min(conviction, 20);

  const gated = !rent.rentable || diligence.verdict === "DO NOT PROVISION" || o.meetsMinimum === false;
  const band: MinePickBand = gated
    ? "NO-GO"
    : conviction >= 65
      ? "PRIME"
      : conviction >= 50
        ? "READY"
        : conviction >= 35
          ? "MARGINAL"
          : "NO-GO";

  return {
    o,
    rent,
    diligence,
    diligenceHealth: health,
    confidencePct,
    conviction: clamp(conviction, 0, 100),
    band,
    verdict: bandToVerdict(band),
    hardware: isCpuWork(o) ? "CPU" : "GPU",
    reasons: gateReasons({ rent, diligence, diligenceHealth: health, confidencePct, o }),
  };
}

/** One-pass conviction verdicts for EVERY row (the Opportunities table also
 *  scores net-negative rows — their gates force AVOID). Keyed by row id.
 *  `basis` = active cost basis (+ owned-rig profile, OWNED-RIG-1). */
export function computeMinePickMap(
  rows: Opportunity[],
  basis: CostBasisMode | CostBasis = "rent"
): Map<string, MinePick> {
  return new Map(rows.map((o) => [o.id, computeMinePick(o, basis)]));
}

/** Rank every net-positive mining subnet (netuid > 0) by conviction.
 *  Rows below the minimum-profit rule are EXCLUDED — this picker answers
 *  "where do I point a rig", and AVOID rows are not candidates.
 *  `basis` follows the active cost basis (+ owned-rig profile) — see
 *  computeMinePick. */
export function rankMinePicks(
  rows: Opportunity[],
  basis: CostBasisMode | CostBasis = "rent"
): MinePick[] {
  return rows
    .filter((o) => {
      if (o.netuid === 0) return false;
      if (o.meetsMinimum === false) return false;
      const net = o.netMonthlyUsd ?? o.estimatedMonthlyRewardUsd ?? 0;
      return net > 0;
    })
    .map((o) => computeMinePick(o, basis))
    .sort(
      (a, b) =>
        b.conviction - a.conviction ||
        (b.rent.expectedNetMonthlyUsd ?? 0) - (a.rent.expectedNetMonthlyUsd ?? 0)
    );
}

/** Re-export so the UI can band-style rent badges from one import. */
export type { RentEarnBand, RentEarnVerdict };
