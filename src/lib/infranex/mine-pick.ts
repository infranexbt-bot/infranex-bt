import type { Opportunity } from "./types";
import { computeRentEarn, type RentEarnVerdict, type RentEarnBand } from "./rent-earn";
import { computeDiligence, type DiligenceReport } from "./diligence";

// ---------------------------------------------------------------------------
// MINE-PICK ENGINE — "which subnet do I actually point a rented CPU/GPU at?"
//
// The Dashboard's TAO Opportunity Score card pits one best mining subnet
// against staking; this engine widens the lens to EVERY net-positive subnet
// and combines the three independent signals the platform already computes:
//
//   1. RENT EARN (weight 40) — rent-earn.ts: can a rented rig legally run
//      it (rentability gate) + seat reality (rewarded ratio, whale take)
//      + new-entrant EV.
//   2. DILIGENCE PIPELINE (weight 35) — diligence.ts: the 14-stage
//      due-diligence checklist (activity, registration, hardware proof,
//      competition, liquidity, cost, downside…). Stages map to a 0–100
//      health; a hard "DO NOT PROVISION" verdict caps the conviction.
//   3. CONFIDENCE (weight 25) — the row's model confidence (Ledger composite
//      scaled 0–1) — how much verified data backs the projection.
//
// Output: 0–100 CONVICTION score + PRIME/READY/MARGINAL/NO-GO band per
// subnet, ranked, split by CPU vs GPU hardware class — rendered as the
// "Choose your subnet" picker on the Dashboard.
// ---------------------------------------------------------------------------

export type MinePickBand = "PRIME" | "READY" | "MARGINAL" | "NO-GO";

export interface MinePick {
  /** Net-positive opportunity row (netuid > 0). */
  o: Opportunity;
  rent: RentEarnVerdict;
  diligence: DiligenceReport;
  /** 14-stage pipeline health, 0–100 (pass=100, info=75, warn=50, fail=0). */
  diligenceHealth: number;
  /** Model confidence 0–100. */
  confidencePct: number;
  /** Combined conviction 0–100 = 40% rent-earn + 35% diligence + 25% confidence. */
  conviction: number;
  band: MinePickBand;
  /** CPU-only work (no VRAM) vs GPU rig. */
  hardware: "CPU" | "GPU";
  /** One-line drivers behind the band. */
  reasons: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const MINE_PICK_BAND_STYLE: Record<
  MinePickBand,
  { label: string; color: string; bg: string }
> = {
  PRIME: { label: "PRIME", color: "text-success", bg: "bg-success/10" },
  READY: { label: "READY", color: "text-primary", bg: "bg-primary/10" },
  MARGINAL: { label: "MARGINAL", color: "text-warning", bg: "bg-warning/10" },
  "NO-GO": { label: "NO-GO", color: "text-destructive", bg: "bg-destructive/10" },
};

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
  const { rent, diligence, diligenceHealth, confidencePct, o } = pick;
  const reasons: string[] = [];
  if (!rent.rentable) reasons.push(rent.rentBlock ?? "Not rentable on a rented rig");
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
 *  Dashboard picker agrees with the Opportunities page by construction. */
export function computeMinePick(o: Opportunity): MinePick {
  const rent = computeRentEarn(o);
  const diligence = computeDiligence(o);
  const health = diligenceHealth(diligence);
  const confidencePct = clamp(Math.round((o.confidence ?? 0.5) * 100), 0, 100);

  // Combined conviction — the three signals the operator cross-checks by
  // eye today, blended once. Rent earn leads because a rig that can't run
  // the work (or a seat that never earns) invalidates the other two.
  let conviction = Math.round(rent.score * 0.4 + health * 0.35 + confidencePct * 0.25);

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
    hardware: isCpuWork(o) ? "CPU" : "GPU",
    reasons: gateReasons({ rent, diligence, diligenceHealth: health, confidencePct, o }),
  };
}

/** Rank every net-positive mining subnet (netuid > 0) by conviction.
 *  Rows below the minimum-profit rule are EXCLUDED — this picker answers
 *  "where do I point a rig", and AVOID rows are not candidates. */
export function rankMinePicks(rows: Opportunity[]): MinePick[] {
  return rows
    .filter((o) => {
      if (o.netuid === 0) return false;
      if (o.meetsMinimum === false) return false;
      const net = o.netMonthlyUsd ?? o.estimatedMonthlyRewardUsd ?? 0;
      return net > 0;
    })
    .map(computeMinePick)
    .sort(
      (a, b) =>
        b.conviction - a.conviction ||
        (b.rent.expectedNetMonthlyUsd ?? 0) - (a.rent.expectedNetMonthlyUsd ?? 0)
    );
}

/** Re-export so the UI can band-style rent badges from one import. */
export type { RentEarnBand, RentEarnVerdict };
