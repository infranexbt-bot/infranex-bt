import { db } from "@/lib/db";
import { fetchLiveSnapshot } from "./chain";
import { mergeOpportunities } from "./live-merge";
import {
  sanitizeProfitabilityConfig,
  DEFAULT_PROFITABILITY_CONFIG,
  type ProfitabilityConfig,
} from "./profitability";
import { utcDay } from "./economics";

// ---------------------------------------------------------------------------
// TRUST-LOOP — "did we actually earn what we promised?"
//
// The Opportunity Score PROMISES a monthly number when a miner is deployed.
// EarningsDaily already samples REAL on-chain emission deltas per deployment.
// This module joins the two:
//
//   1. computeDeploymentProjection — at deploy time, snapshot the subnet's
//      per-EARNING-miner gross rate from the live chain (the same chain-
//      measured figure the Miner's Ledger and the Opportunity Score use) —
//      never a category template. Stored on the Deployment row.
//   2. evaluateTrust — pace the actuals into a monthly figure (calendar days
//      since the first on-chain earning sample) and band the ratio:
//        ≥ 0.85 on-track · 0.60–0.85 lagging · < 0.60 off-track
//      Miners younger than 3 earning days are "warming-up" (bonds build via
//      EMA, so early earnings are structurally low — judging them would be
//      dishonest). No projection (pre-trust rows, no live data) → the miner
//      gets no verdict rather than a fake one.
//   3. getTrustReport — the fleet read model: per-miner verdicts + portfolio
//      totals + a CALIBRATION figure (accuracy of our own projections over
//      miners with ≥7 earning days) which feeds back into the Opportunity
//      Score's confidence.
// ---------------------------------------------------------------------------

const R2 = (v: number) => Math.round(v * 100) / 100;
const R4 = (v: number) => Math.round(v * 1e4) / 1e4;

export type TrustVerdict =
  | "on-track"
  | "lagging"
  | "off-track"
  | "warming-up"
  | "no-baseline"
  | "no-data";

export const TRUST_BANDS = {
  /** Pace ≥ 85% of projection → on track. */
  ON_TRACK: 0.85,
  /** Pace ≥ 60% of projection → lagging (below → off-track). */
  LAGGING: 0.6,
  /** Earning days before which no verdict is issued (bond-EMA ramp). */
  WARMUP_DAYS: 3,
  /** Earning days before which the calibration sample is too thin. */
  CALIBRATION_MIN_DAYS: 7,
} as const;

// ---------------------------------------------------------------------------
// 1. Projection — the promise, captured at deploy time
// ---------------------------------------------------------------------------

export interface DeploymentProjection {
  /** Per-earning-miner gross emission, monthly TAO (chain-measured × 30). */
  projectedMonthlyTao: number;
  projectedGrossMonthlyUsd: number;
  /** Profitability engine's net (after GPU + infra + opex), when available. */
  projectedNetMonthlyUsd: number | null;
  rampWeeks: number | null;
  source: "live-chain";
  taoPriceUsd: number;
}

/** The team's stored profitability settings (defaults when absent/unreadable). */
export async function loadProfitabilityConfig(): Promise<ProfitabilityConfig> {
  try {
    const row = await db.profitabilitySettings.findUnique({ where: { id: 1 } });
    return row ? sanitizeProfitabilityConfig(row) : DEFAULT_PROFITABILITY_CONFIG;
  } catch {
    return DEFAULT_PROFITABILITY_CONFIG;
  }
}

/**
 * Snapshot the subnet's chain-measured earning rate for a NEW deployment.
 * Returns null honestly when no live chain data exists (the caller then
 * stores no projection — the miner simply gets no trust verdict).
 */
export async function computeDeploymentProjection(
  netuid: number,
  profConfig?: ProfitabilityConfig
): Promise<DeploymentProjection | null> {
  try {
    const snap = await fetchLiveSnapshot();
    if (!snap || snap.source !== "live") return null;
    const config = profConfig ?? (await loadProfitabilityConfig());
    const row = mergeOpportunities(snap, config).find(
      (o) => o.netuid === netuid
    );
    if (!row) return null;

    const taoPriceUsd = snap.taoPriceUsd || 0;
    const projectedMonthlyTao = R4((row.estimatedDailyReward ?? 0) * 30);
    // No emission data on this subnet → nothing to promise, nothing to judge.
    if (projectedMonthlyTao <= 0) return null;
    const projectedGrossMonthlyUsd = Math.round(
      row.grossMonthlyUsd ?? projectedMonthlyTao * taoPriceUsd
    );
    const projectedNetMonthlyUsd =
      row.netMonthlyUsd != null ? Math.round(row.netMonthlyUsd) : null;

    return {
      projectedMonthlyTao,
      projectedGrossMonthlyUsd,
      projectedNetMonthlyUsd,
      rampWeeks: row.rampWeeks ?? null,
      source: "live-chain",
      taoPriceUsd,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. Verdict — the reality check
// ---------------------------------------------------------------------------

export interface TrustEvaluation {
  verdict: TrustVerdict;
  /** actualMonthlyPace ÷ projectedMonthlyTao (null when not judgeable). */
  ratio: number | null;
  /** Calendar-paced monthly TAO since the first earning sample. */
  actualMonthlyTao: number | null;
  note: string;
}

export function evaluateTrust(p: {
  projectedMonthlyTao: number | null | undefined;
  earnedTaoTotal: number;
  /** UTC days (inclusive) since the first earning sample. */
  activeDays: number;
}): TrustEvaluation {
  const { projectedMonthlyTao, earnedTaoTotal, activeDays } = p;

  if (!projectedMonthlyTao || projectedMonthlyTao <= 0) {
    return {
      verdict: earnedTaoTotal > 0 ? "no-baseline" : "no-data",
      ratio: null,
      actualMonthlyTao: null,
      note: projectedMonthlyTao == null
        ? "Deployed before projection capture — no baseline to judge against."
        : "No chain-measured emission on this subnet at deploy time.",
    };
  }

  if (earnedTaoTotal <= 0) {
    return {
      verdict: "no-data",
      ratio: null,
      actualMonthlyTao: null,
      note: "No on-chain earnings booked yet — emission sampling starts once the hotkey is registered.",
    };
  }

  if (activeDays < TRUST_BANDS.WARMUP_DAYS) {
    const pace = (earnedTaoTotal / Math.max(activeDays, 1)) * 30;
    return {
      verdict: "warming-up",
      ratio: null,
      actualMonthlyTao: R4(pace),
      note: `Only ${activeDays} earning day${activeDays === 1 ? "" : "s"} — bonds build via EMA, so early earnings are structurally low. Verdict starts at day ${TRUST_BANDS.WARMUP_DAYS}.`,
    };
  }

  const actualMonthlyTao = (earnedTaoTotal / activeDays) * 30;
  const ratio = actualMonthlyTao / projectedMonthlyTao;

  if (ratio >= TRUST_BANDS.ON_TRACK) {
    return {
      verdict: "on-track",
      ratio: R2(ratio),
      actualMonthlyTao: R4(actualMonthlyTao),
      note: `Earning ${Math.round(ratio * 100)}% of the chain-measured projection — the number we promised is real.`,
    };
  }
  if (ratio >= TRUST_BANDS.LAGGING) {
    return {
      verdict: "lagging",
      ratio: R2(ratio),
      actualMonthlyTao: R4(actualMonthlyTao),
      note: `Earning ${Math.round(ratio * 100)}% of projection — typical causes: mid-pack seat, bond ramp not finished, or intermittent deregistrations.`,
    };
  }
  return {
    verdict: "off-track",
    ratio: R2(ratio),
    actualMonthlyTao: R4(actualMonthlyTao),
    note: `Earning only ${Math.round(ratio * 100)}% of projection — check the miner's logs and Judge Lab before this rental burns more budget.`,
  };
}

// ---------------------------------------------------------------------------
// 3. Fleet report + calibration
// ---------------------------------------------------------------------------

export interface TrustRow {
  deploymentId: string;
  minerName: string;
  netuid: number;
  subnetName: string;
  status: string;
  projectedMonthlyTao: number | null;
  projectedGrossMonthlyUsd: number | null;
  projectedNetMonthlyUsd: number | null;
  projectionSource: string | null;
  earnedTaoTotal: number;
  earnedUsdTotal: number;
  spendUsdTotal: number;
  activeDays: number;
  actualMonthlyTao: number | null;
  ratio: number | null;
  verdict: TrustVerdict;
  note: string;
}

export interface TrustCalibration {
  /** Total earning days behind the accuracy figure (0 = no sample). */
  minerDays: number;
  /** Weighted mean ratio across miners with ≥ CALIBRATION_MIN_DAYS days. */
  accuracyRatio: number | null;
  note: string;
}

export interface TrustReport {
  rows: TrustRow[];
  portfolio: {
    projectedMonthlyTao: number;
    actualMonthlyTao: number;
    projectedUsd: number;
    actualUsd: number;
    netUsd: number;
    counts: Record<TrustVerdict, number>;
  };
  calibration: TrustCalibration;
}

export async function getTrustReport(): Promise<TrustReport> {
  const [deps, earnByDep, spendByDep] = await Promise.all([
    db.deployment.findMany({ orderBy: { createdAt: "desc" } }),
    db.earningsDaily.groupBy({
      by: ["deploymentId"],
      _sum: { earnedTao: true, earnedUsd: true },
      _min: { day: true },
      _count: { day: true },
    }),
    db.spendLedger.groupBy({
      by: ["deploymentId"],
      _sum: { costUsd: true },
    }),
  ]);

  const today = utcDay();
  const counts: Record<TrustVerdict, number> = {
    "on-track": 0,
    lagging: 0,
    "off-track": 0,
    "warming-up": 0,
    "no-baseline": 0,
    "no-data": 0,
  };

  const rows: TrustRow[] = deps.map((d) => {
    const earn = earnByDep.find((e) => e.deploymentId === d.id);
    const spend = spendByDep.find((s) => s.deploymentId === d.id);
    const earnedTaoTotal = earn?._sum.earnedTao ?? 0;
    const earnedUsdTotal = earn?._sum.earnedUsd ?? 0;
    const spendUsdTotal = spend?._sum.costUsd ?? 0;

    let activeDays = 0;
    if (earn?._min.day) {
      activeDays = Math.max(
        1,
        Math.round(
          (Date.parse(`${today}T00:00:00Z`) -
            Date.parse(`${earn._min.day}T00:00:00Z`)) /
            86_400_000
        ) + 1
      );
    }

    const ev = evaluateTrust({
      projectedMonthlyTao: d.projectedMonthlyTao,
      earnedTaoTotal,
      activeDays,
    });
    counts[ev.verdict] += 1;

    return {
      deploymentId: d.id,
      minerName: d.minerName,
      netuid: d.netuid,
      subnetName: d.subnetName,
      status: d.status,
      projectedMonthlyTao: d.projectedMonthlyTao,
      projectedGrossMonthlyUsd: d.projectedGrossMonthlyUsd,
      projectedNetMonthlyUsd: d.projectedNetMonthlyUsd,
      projectionSource: d.projectionSource,
      earnedTaoTotal: R4(earnedTaoTotal),
      earnedUsdTotal: R2(earnedUsdTotal),
      spendUsdTotal: R2(spendUsdTotal),
      activeDays,
      actualMonthlyTao: ev.actualMonthlyTao,
      ratio: ev.ratio,
      verdict: ev.verdict,
      note: ev.note,
    };
  });

  // Portfolio totals: only rows with a real baseline count against the
  // projection; actuals are summed from every miner that booked earnings.
  const judged = rows.filter((r) => r.projectionSource === "live-chain" && r.projectedMonthlyTao);
  const projectedMonthlyTao = R4(judged.reduce((a, r) => a + (r.projectedMonthlyTao ?? 0), 0));
  const actualMonthlyTao = R4(rows.reduce((a, r) => a + (r.actualMonthlyTao ?? 0), 0));
  const projectedUsd = R2(judged.reduce((a, r) => a + (r.projectedGrossMonthlyUsd ?? 0), 0));
  const actualUsd = R2(rows.reduce((a, r) => a + (r.earnedUsdTotal / Math.max(r.activeDays, 1)) * 30 * (r.actualMonthlyTao != null ? 1 : 0), 0));
  // AUDIT-MED-3 — pace spend by each miner's real activeDays, exactly like
  // the earnings side; the flat /30 assumed a month of history for everyone
  // (a 5-day-old miner's rent showed as ~1/6 of its real monthly pace).
  const netUsd = R2(
    actualUsd -
      rows.reduce((a, r) => a + (r.spendUsdTotal / Math.max(r.activeDays, 1)) * 30, 0)
  );

  // Calibration — how accurate have OUR projections been, fleet-wide?
  const calibratable = judged.filter(
    (r) => r.activeDays >= TRUST_BANDS.CALIBRATION_MIN_DAYS && r.ratio != null
  );
  const minerDays = calibratable.reduce((a, r) => a + r.activeDays, 0);
  const accuracyRatio =
    minerDays > 0
      ? R2(
          calibratable.reduce(
            (a, r) => a + (r.ratio ?? 0) * r.activeDays,
            0
          ) / minerDays
        )
      : null;

  const calibration: TrustCalibration = {
    minerDays,
    accuracyRatio,
    note:
      accuracyRatio == null
        ? "Calibration starts once a miner has 7+ earning days against its projection."
        : `Across ${minerDays} miner-days, projections have run at ${Math.round(accuracyRatio * 100)}% of promised earnings.`,
  };

  return {
    rows,
    portfolio: {
      projectedMonthlyTao,
      actualMonthlyTao,
      projectedUsd,
      actualUsd,
      netUsd,
      counts,
    },
    calibration,
  };
}

/**
 * Calibration shaped for the Opportunity Score — blends the OBSERVED accuracy
 * of our own projections into the model's confidence. Only kicks in with a
 * real sample (≥ 7 miner-days); otherwise the model confidence stands alone.
 */
