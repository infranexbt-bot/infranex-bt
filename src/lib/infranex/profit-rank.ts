// ---------------------------------------------------------------------------
// PROFIT RANK — per-subnet ranking of "what the chain pays miners" vs
// "what a rented rig costs", ranked by net profit.
//
//   EMISSION side   subnet miner emission (TAO/day, chain) ÷ rewarded UIDs
//                   → per-earning-miner revenue at the live TAO price
//   RENTAL side     hosting-aware GPU rental: container rate (Vast/RunPod
//                   class) for cloud-OK subnets, dedicated bare-metal rate
//                   for subnets whose docs reject container clouds
//   NET             revenue − GPU rent − storage/infra/opex (Profitability
//                   Engine config, shared with the Opportunities Ledger)
//
// This module is a pure reshaping of data the live-merge engine already
// computes (mergeOpportunities → P&L). No new numbers are invented here —
// it sorts, derives ratios and attaches honesty flags so the Subnets view
// can answer one question at a glance: "which subnet pays its miners the
// most AFTER the rig is paid for?"
//
// Honesty contract (same as live-merge): nulls stay nulls, zero-emission
// subnets rank last by construction, and whale-mean/knife-fight rows are
// flagged instead of silently surfacing an inflated mean.
// ---------------------------------------------------------------------------

import type { LiveOpportunity, LiveSubnet } from "./live-merge";
import type { CompatTier, SubnetCompat } from "./compat";
import type { ProfitVerdict } from "./profitability";

export interface ProfitRankRow {
  netuid: number;
  name: string;
  symbol: string;
  status: string;

  // --- Emission side (chain-measured) ---
  /** Whole subnet miner-side emission, TAO/day (live chain vec). */
  minerEmissionTaoPerDay: number | null;
  /** Per-EARNING-miner daily TAO (emission ÷ rewarded UIDs). */
  emissionPerMinerTaoPerDay: number;
  /** True when the per-miner figure used the conservative fallback
   *  (no reward vec → 0.6 × mean-over-registered estimate). */
  estimatedPerMiner: boolean;
  /** Gross revenue per earning miner, monthly USD. */
  revenueMonthlyUsd: number;
  revenueDailyUsd: number;

  // --- Rental side (hosting-aware) ---
  /** GPU class the profitability engine priced (e.g. "H100 80GB", "CPU VPS"). */
  gpuClass: string;
  /** Whole-fleet GPU count priced (e.g. 8 for 8x H200 subnets). */
  gpuCount: number;
  /** GPU rental line, monthly USD (fleet total, hosting-aware rate). */
  rentalMonthlyUsd: number;
  /** "bare-metal" when the rate used is the dedicated-server tier. */
  costClass: "container" | "bare-metal" | null;
  /** Infra/storage/opex lines, monthly USD (engine-reported). */
  infraMonthlyUsd: number;

  // --- Bottom line ---
  netMonthlyUsd: number;
  netDailyUsd: number;
  /** net / revenue × 100 — null when revenue is 0. */
  marginPct: number | null;
  /** revenue ÷ GPU rent — "rent coverage". Null when rent is 0. */
  rentCoverageX: number | null;

  verdict: ProfitVerdict | null;
  score: number;

  // --- Honesty flags ---
  compat: SubnetCompat | null;
  /** rewardedRatio < 15% — mean inflated by few earners. */
  whaleMean: boolean;
  /** rewardedRatio < 10% AND top10 ≥ 85% — winner-take-all seat. */
  knifeFight: boolean;
  rewardedRatioPct: number | null;
  minersCount: number;
  /** GPU-relevant row (excludes CPU-only / parked tiers). */
  isGpu: boolean;
}

/** GPU-relevant compat tiers — everything a rented or dedicated GPU rig targets. */
const GPU_TIERS: ReadonlySet<CompatTier> = new Set([
  "bare-metal-only",
  "tee-required",
  "provider-friendly",
  "gpu-flexible",
]);

export function buildProfitRank(
  opportunities: LiveOpportunity[],
  subnets: LiveSubnet[],
  compatByNetuid: Map<number, SubnetCompat>
): ProfitRankRow[] {
  const subnetByNetuid = new Map(subnets.map((s) => [s.netuid, s]));

  const rows: ProfitRankRow[] = opportunities.map((o) => {
    const sn = subnetByNetuid.get(o.netuid);
    const compat = compatByNetuid.get(o.netuid) ?? null;

    const perMinerTao = o.perEarningMeanDailyTao ?? 0;
    const revenueMonthly = o.grossMonthlyUsd ?? Math.round(perMinerTao * 30);
    const rentalMonthly = o.gpuCostMonthlyUsd ?? 0;
    const infraMonthly = o.infraCostMonthlyUsd ?? 0;
    const netMonthly =
      o.netMonthlyUsd ?? Math.round(revenueMonthly - rentalMonthly - infraMonthly);

    // Conservative-fallback detection: live-merge divides by rewarded UIDs
    // when the reward vec exists; otherwise estimates 0.6 × mean-over-
    // registered. Rewarded ratio missing + emission present ⇒ estimated.
    const estimatedPerMiner = o.rewardedRatio == null && perMinerTao > 0;

    const rew = o.rewardedRatio ?? null;
    const top10 = o.top10IncentiveShare ?? null;

    const gpuClass = o.recommendedGpu || sn?.recommendedGpu || "—";
    const gpuCount = o.gpuCount ?? 1;
    // GPU-relevant = compat tier says GPU work AND the priced hardware is
    // not a CPU box (e.g. a gpu-flexible subnet whose Ledger row still
    // classifies as CPU work stays out of the GPU ranking).
    const cpuClass = /cpu|vcpu/i.test(gpuClass);
    const isGpu = compat ? GPU_TIERS.has(compat.tier) && !cpuClass : !cpuClass;

    return {
      netuid: o.netuid,
      name: o.subnetName,
      symbol: o.subnetSymbol || `α${o.netuid}`,
      status: o.status,

      minerEmissionTaoPerDay: sn?.live?.minerEmissionTaoPerDay ?? null,
      emissionPerMinerTaoPerDay: perMinerTao,
      estimatedPerMiner,
      revenueMonthlyUsd: revenueMonthly,
      revenueDailyUsd: Math.round(revenueMonthly / 30),

      gpuClass,
      gpuCount,
      rentalMonthlyUsd: Math.round(rentalMonthly),
      costClass: o.costClass ?? null,
      infraMonthlyUsd: Math.round(infraMonthly),

      netMonthlyUsd: Math.round(netMonthly),
      netDailyUsd: Math.round(netMonthly / 30),
      marginPct:
        revenueMonthly > 0
          ? Math.round((netMonthly / revenueMonthly) * 100)
          : null,
      rentCoverageX:
        rentalMonthly > 0
          ? Math.round((revenueMonthly / rentalMonthly) * 10) / 10
          : null,

      verdict: o.verdict ?? null,
      score: o.score,

      compat,
      whaleMean: rew != null && rew < 0.15,
      knifeFight: rew != null && top10 != null && rew < 0.1 && top10 >= 0.85,
      rewardedRatioPct: rew != null ? Math.round(rew * 1000) / 10 : null,
      minersCount: o.liveMiners ?? sn?.minersCount ?? 0,
      isGpu,
    };
  });

  // Rank by NET profit desc — emission the subnet pays miners vs what the
  // rig costs, after every cost line. Ties break on Ledger score, then
  // raw emission so unpriced rows still order sensibly.
  rows.sort(
    (a, b) =>
      b.netMonthlyUsd - a.netMonthlyUsd ||
      b.score - a.score ||
      b.emissionPerMinerTaoPerDay - a.emissionPerMinerTaoPerDay
  );
  return rows;
}

export const PROFIT_VERDICT_STYLE: Record<
  ProfitVerdict | "NONE",
  { label: string; cls: string }
> = {
  PROFITABLE: { label: "✓ Profitable", cls: "bg-success/10 text-success" },
  MARGINAL: { label: "≈ Marginal", cls: "bg-warning/10 text-warning" },
  AVOID: { label: "✗ Below target", cls: "bg-destructive/10 text-destructive" },
  NONE: { label: "—", cls: "bg-muted/40 text-muted-foreground" },
};
