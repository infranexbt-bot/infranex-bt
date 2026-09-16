// ---------------------------------------------------------------------------
// Live merge engine (DATA-AUDIT-1).
//
// Extracted from use-network.ts so SERVER code (Optimization Engine, workers)
// and CLIENT views share one merge implementation. No "use client" here.
//
// Honesty contract — every number these functions emit is traceable to:
//   1. the live chain snapshot (authoritative),
//   2. a user override (SubnetOverride — explicit human input),
//   3. the work-type classifier run on LIVE name/description text, or
//   4. a curated GitHub URL seed (data.ts) used only as a scrape pointer.
// Nothing is invented when a source is missing: names fall back to
// "Subnet N", unknown numbers to zero/null, and an empty snapshot yields an
// EMPTY result — never a fabricated stand-in row.
// ---------------------------------------------------------------------------

import {
  classifySubnetHardware,
  scoreMinersLedger,
  totalScore,
  riskLevel,
  computeEarnChance,
} from "./miner-score";
import {
  computeProfitabilityReport,
  DEFAULT_PROFITABILITY_CONFIG,
  type ProfitabilityConfig,
} from "./profitability";
import { getMechanics } from "./mechanics";
import { curatedGithubUrl } from "./data";
import type { SubnetMechanics } from "./mechanics";
import type {
  LiveNetworkSnapshot,
  LiveSubnetMetrics,
  NeuronMetrics,
} from "./chain";
import type { Subnet, Opportunity, EmissionShare } from "./types";
import type { HostingRequirements } from "./github-scraper";

export type { LiveNetworkSnapshot, LiveSubnetMetrics, NeuronMetrics };

export interface LiveSubnet extends Subnet {
  live?: LiveSubnetMetrics;
  /** Which fields have live chain data (vs neutral defaults). */
  liveFields: Set<string>;
  /** Which fields have user overrides (vs derived). */
  overriddenFields: Set<string>;
}

export interface LiveOpportunity extends Opportunity {
  liveMiners?: number;
  liveStake?: number;
  livePrice?: number;
  /** GitHub-scraped GPU count (e.g. 8 for "8x H200"). */
  gpuCount?: number | null;
  /** Hosting constraints scraped from the subnet's repo README. */
  hosting?: HostingRequirements | null;
  /** Repo URL the requirements came from. */
  requirementsSource?: string | null;
  /** Curated official mechanics (mechanics.ts) — null when none verified. */
  mechanics?: SubnetMechanics | null;
  /** "bare-metal" when the subnet's docs reject container clouds. */
  costClass?: "container" | "bare-metal" | null;
}

/** Merge live chain metrics + user overrides into subnet rows.
 *  Includes EVERY subnet the chain scan returned; identity, metrics and
 *  hardware hints all come from the chain, overrides or the classifier. */
export function mergeSubnets(
  snap: LiveNetworkSnapshot | undefined,
  overrides?: Map<number, Record<string, unknown>>
): LiveSubnet[] {
  const result: LiveSubnet[] = [];

  for (const live of snap?.subnets ?? []) {
    const override = overrides?.get(live.netuid);
    const liveFields = new Set<string>([
      "minersCount", "taoInReserve", "price", "tempo", "status",
      "emission", "validatorsCount",
    ]);
    const overriddenFields = new Set<string>();

    const rewarded = Math.max(live.rewardedMiners ?? 0, 0);
    const minerEm = live.minerEmissionTaoPerDay ?? 0;
    const perEarningDailyTao =
      rewarded > 0 && minerEm > 0
        ? minerEm / rewarded
        : minerEm > 0
          ? (minerEm / Math.max(live.minersCount, 1)) * 0.6
          : 0;
    const fallbackMonthly = perEarningDailyTao * 30 * (snap?.taoPriceUsd || 0);
    const hw = classifySubnetHardware(live.name, live.identityDescription, {
      fallbackMonthlyUsd: fallbackMonthly,
    });
    const regBlock = live.registeredAt;
    const createdAt =
      regBlock && snap && snap.blockNumber > regBlock
        ? new Date(Date.now() - (snap.blockNumber - regBlock) * 12_000).toISOString()
        : "";

    const merged: Subnet = {
      netuid: live.netuid,
      name:
        (override?.name as string) ??
        live.name ??
        `Subnet ${live.netuid}`,
      symbol: `α${live.netuid}`,
      description:
        (override?.description as string) ??
        live.identityDescription ??
        (live.name
          ? "On-chain registered subnet — live chain data."
          : "Untracked subnet — live chain data only."),
      category:
        (override?.category as string) ??
        (hw.classified ? hw.category : live.name ? "Registered subnet" : "Untracked"),
      owner: live.owner ?? "",
      tempo: live.tempo || 0,
      emission: live.emission ?? 0,
      taoInReserve: Math.round(live.subnetTao),
      price: live.movingPrice,
      marketCap: snap?.taoPriceUsd ? Math.round(live.subnetTao * snap.taoPriceUsd) : 0,
      // No chain source for volume/registration — kept neutral instead of
      // fabricating a value (DATA-AUDIT-1).
      volume24h: 0,
      change24h: 0,
      minersCount: live.minersCount,
      validatorsCount: live.validatorsCount ?? 0,
      maxNeurons: live.maxUids ?? 4096,
      status: live.emissionEnabled ? "active" : "inactive",
      registrationOpen: false,
      createdAt,
      tags: [],
      minVramGb: (override?.minVramGb as number) ?? hw.minVramGb,
      recommendedGpu: (override?.recommendedGpu as string) ?? hw.recommendedGpu,
      githubUrl:
        (override?.githubUrl as string | null) ??
        live.identityGithub ??
        curatedGithubUrl(live.netuid),
      website: (override?.website as string | null) ?? null,
      burnCostTao: live.burnCostTao ?? null,
      immunityBlocks: live.immunityBlocks ?? null,
      maxUids: live.maxUids ?? null,
      rewardedMiners: live.rewardedMiners ?? null,
    };

    if (override) {
      for (const [key, value] of Object.entries(override)) {
        if (value != null && value !== "" && !(key in merged)) {
          (merged as unknown as Record<string, unknown>)[key] = value;
          overriddenFields.add(key);
        }
      }
    }

    result.push({ ...merged, live, liveFields, overriddenFields });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Opportunity ranking — Miner's Ledger v2. Every subnet the chain scan
// returned runs through the SAME 5-pillar engine in miner-score.ts:
// per-EARNING-miner revenue → net of GPU/infra cost → seat safety →
// alpha economics → fit. No curated data participates anywhere.
// ---------------------------------------------------------------------------

export function mergeOpportunities(
  snap: LiveNetworkSnapshot | undefined,
  profConfig?: ProfitabilityConfig,
  overrides?: Map<number, Record<string, unknown>>
): LiveOpportunity[] {
  // DATA-AUDIT-1: an empty/failed snapshot yields an honest EMPTY ranking —
  // the fabricated offline fallback ranking that used to live here is gone.
  if (!snap || snap.subnets.length === 0) return [];

  const usd = snap.taoPriceUsd || 0;
  const config = profConfig ?? DEFAULT_PROFITABILITY_CONFIG;
  const updatedAt = new Date().toISOString();
  const rows: LiveOpportunity[] = [];

  for (const live of snap.subnets) {
    // Root (SN0) is a staking pool, not a mining target — miners cannot
    // register a miner there, so it does not belong in mining opportunities.
    if (live.netuid === 0) continue;

    // --- Top line: per-EARNING-miner revenue (chain-measured) ---
    const rewarded = Math.max(live.rewardedMiners ?? 0, 0);
    const minerEm = live.minerEmissionTaoPerDay ?? 0;
    const perEarningDailyTao =
      rewarded > 0 && minerEm > 0
        ? minerEm / rewarded
        : minerEm > 0
          ? (minerEm / Math.max(live.minersCount, 1)) * 0.6 // conservative when the reward vec is unavailable
          : 0;
    const grossMonthlyUsd = Math.round(perEarningDailyTao * 30 * usd);

    // --- Hardware: work type → GPU requirement + cost ---
    const name =
      (overrides?.get(live.netuid)?.name as string | undefined) ??
      live.name ??
      `Subnet ${live.netuid}`;
    // GitHub-scraped requirements (SubnetOverride) are GROUND TRUTH — when a
    // repo README documents the GPU/hosting rules, they beat the classifier.
    const ovr = overrides?.get(live.netuid);
    // MECHANICS-ALL: curated mechanics win; derived (README-extracted) is the
    // fallback tier. Both feed ramp math, ops rules and cost classification.
    const mechanics =
      getMechanics(live.netuid) ??
      ((ovr?.mechanics as SubnetMechanics | undefined) ?? null);
    const scraped =
      ovr && (ovr.recommendedGpu || ovr.hosting)
        ? {
            recommendedGpu: (ovr.recommendedGpu as string | null) ?? null,
            gpuCount: (ovr.gpuCount as number | null) ?? null,
            minVramGb: (ovr.minVramGb as number | null) ?? null,
            hosting: (ovr.hosting as HostingRequirements | null) ?? null,
            requirementsSource: (ovr.requirementsSource as string | null) ?? null,
          }
        : null;
    const hardware = classifySubnetHardware(name, live.identityDescription, {
      fallbackMonthlyUsd: grossMonthlyUsd,
      scraped,
      mechanics,
    });
    // MECHANICS-1: hosting-aware per-GPU rent (dedicated rate for
    // bare-metal-only subnets) — used by the Profitability Engine P&L.
    const unitRent =
      hardware.unitRentUsd ??
      (hardware.hosting?.bareMetalOnly
        ? hardware.tier.bareMetalMonthlyUsd
        : hardware.tier.monthlyRentUsd);

    const liveAgeBlocks =
      live.registeredAt != null && snap.blockNumber > live.registeredAt
        ? snap.blockNumber - live.registeredAt
        : null;

    const { components, factors, diag } = scoreMinersLedger({
      live,
      taoUsd: usd,
      hardware,
      liveAgeBlocks,
      mechanics,
      costs: {
        hardwareMode: config.hardwareMode,
        electricityUsdPerKwh: config.electricityUsdPerKwh,
        storageMonthlyUsd: config.storageMonthlyUsd,
        infraMonthlyUsd: config.infraMonthlyUsd,
        otherOpexMonthlyUsd: config.otherOpexMonthlyUsd,
        includeBurnAmortization: config.includeRegistrationBurn,
        amortizeBurnMonths: config.amortizeBurnMonths,
      },
    });
    const score = totalScore(components);

    // --- Profitability Engine: full P&L + minimum entry rule ---------------
    // MECHANICS-1: the engine's GPU line is the WHOLE fleet (unit rent ×
    // count) — for 8x-H200-class subnets the bare-metal dedicated rate × 8
    // lands on the GPU line, infra stays its own honest line.
    const gpuCountForCost =
      hardware.gpuCount && hardware.gpuCount > 1 ? hardware.gpuCount : 1;
    const gpuTotalMonthlyUsd = unitRent * gpuCountForCost;
    const profitability = computeProfitabilityReport({
      grossMonthlyUsd: diag.grossMonthlyUsd,
      gpuRentMonthlyUsd: gpuTotalMonthlyUsd,
      gpuPowerWatts: diag.gpuPowerWatts,
      autoInfraMonthlyUsd: Math.max(
        hardware.monthlyCostUsd - gpuTotalMonthlyUsd,
        0
      ),
      burnCostTao: live.burnCostTao,
      rampWeeks: diag.rampWeeks,
      bullGrossMonthlyUsd:
        diag.perEarningDailyTao > 0
          ? diag.perEarningDailyTao * 30 * usd
          : undefined,
      taoUsd: usd,
      score: components,
      config,
    });

    // Utilization: share of registered slots that actually earned reward
    // last epoch — the reward-concentration signal from the chain vecs.
    const util =
      diag.rewardedRatio != null
        ? diag.rewardedRatio
        : live.maxUids
          ? Math.min(0.99, live.minersCount / live.maxUids)
          : Math.min(0.99, live.minersCount / 4096);

    const reqStake =
      Math.round(
        (live.subnetTao / Math.max(live.minersCount, 1)) * 10
      ) / 10;

    const base: LiveOpportunity = {
      id: `opp-live-${live.netuid}`,
      netuid: live.netuid,
      subnetName: name,
      subnetSymbol: `α${live.netuid}`,
      category: hardware.category,
      type: "mining",
      minVramGb: hardware.minVramGb,
      recommendedGpu: hardware.recommendedGpu,
    } as LiveOpportunity;

    rows.push({
      ...base,
      category: diag.hardwareClassified ? diag.category : base.category,
      score,
      rank: 0,
      estimatedDailyReward: diag.expectedDailyTao,
      estimatedMonthlyRewardUsd: diag.grossMonthlyUsd,
      estimatedApy:
        reqStake > 0
          ? Math.round(((diag.expectedDailyTao * 365) / reqStake) * 1000) / 10
          : 0,
      requiredStake: reqStake,
      utilization: util,
      riskLevel: riskLevel(score),
      confidence: Math.round(score) / 100,
      factors,
      status: live.emissionEnabled ? "active" : "pending",
      updatedAt,
      minVramGb: diag.minVramGb,
      recommendedGpu: diag.recommendedGpu,
      gpuCount: diag.gpuCount ?? null,
      hosting: diag.hosting ?? null,
      requirementsSource: diag.requirementsSource ?? null,
      hardwareClassified: diag.hardwareClassified,
      mechanics,
      costClass: diag.costClass ?? null,
      workType: diag.category,
      grossMonthlyUsd: diag.grossMonthlyUsd,
      netMonthlyUsd: profitability.netMonthlyUsd,
      gpuCostMonthlyUsd: diag.gpuCostMonthlyUsd,
      infraCostMonthlyUsd: diag.infraCostMonthlyUsd,
      netDailyTao: diag.netDailyTao,
      profitability,
      verdict: profitability.verdict,
      meetsMinimum: profitability.meetsMinimum,
      alphaPriceUsd: diag.alphaPriceUsd,
      alphaChange24h: diag.alphaChange24h,
      liquidityTao: diag.liquidityTao,
      slippagePct: diag.slippagePct,
      burnCostTao: diag.burnCostTao,
      top10IncentiveShare: diag.top10IncentiveShare,
      rewardMedianShare: diag.rewardMedianShare,
      perEarningMeanDailyTao: diag.perEarningDailyTao,
      rewardedRatio: diag.rewardedRatio,
      rampWeeks: diag.rampWeeks,
      freeSlots: diag.freeSlots,
      totalSlots: diag.totalSlots,
      immunityBlocks: diag.immunityBlocks,
      earnChance: computeEarnChance({
        rewardedRatio: diag.rewardedRatio,
        freeSlots: diag.freeSlots,
        top10IncentiveShare: diag.top10IncentiveShare,
        rampWeeks: diag.rampWeeks,
      }),
      liveMiners: live.minersCount,
      liveStake: Math.round(live.subnetTao),
      livePrice: live.movingPrice,
    });
  }

  rows.sort((a, b) => b.score - a.score);
  rows.forEach((o, i) => (o.rank = i + 1));
  return rows;
}

/** Aggregated dashboard metrics using live values only. */
export function getLiveDashboardMetrics(
  snap: LiveNetworkSnapshot | undefined,
  profConfig?: ProfitabilityConfig,
  overrides?: Map<number, Record<string, unknown>>
) {
  const liveSubnets = mergeSubnets(snap, overrides);
  const liveOpps = mergeOpportunities(snap, profConfig, overrides);
  const activeSubnets = liveSubnets.filter((s) => s.status === "active").length;
  const totalMiners = liveSubnets.reduce((a, s) => a + s.minersCount, 0);
  const totalMarketCap = snap?.taoMarketCapUsd
    ? snap.taoMarketCapUsd
    : liveSubnets.reduce((a, s) => a + s.marketCap, 0);
  const avgScore =
    liveOpps.length > 0
      ? liveOpps.reduce((a, o) => a + o.score, 0) / liveOpps.length
      : 0;
  const runCount = liveOpps.filter((o) => o.score >= 60 && o.meetsMinimum !== false).length;
  const watchCount = liveOpps.filter(
    (o) => o.score >= 40 && o.score < 60 && o.meetsMinimum !== false
  ).length;
  // AVOID = weak score OR below the minimum net-profit target.
  const avoidCount = liveOpps.filter(
    (o) => o.score < 40 || o.meetsMinimum === false
  ).length;

  return {
    trackedSubnets: liveSubnets.length,
    activeSubnets,
    totalMiners,
    totalValidators: 0,
    totalMarketCap,
    totalEmission: liveSubnets.reduce((a, s) => a + s.emission, 0),
    avgScore: Math.round(avgScore * 10) / 10,
    runCount,
    watchCount,
    avoidCount,
    portfolioEarnings: 0,
    portfolioDailyEmission: 0,
    activeMiners: 0,
    taoUsd: snap?.taoPriceUsd ?? 0,
    taoChange24h: snap?.taoChange24h ?? 0,
    taoMarketCap: snap?.taoMarketCapUsd ?? 0,
    blockNumber: snap?.blockNumber ?? 0,
    totalSubnets: snap?.totalSubnets ?? 0,
    scannedSubnets: snap?.subnets.length ?? 0,
    neuronCount: snap?.neurons.length ?? 0,
    isLive: snap?.source === "live",
    lastFetched: snap?.fetchedAt,
  };
}

const EMISSION_COLORS = [
  "hsl(84 90% 60%)",
  "hsl(142 70% 50%)",
  "hsl(45 93% 60%)",
  "hsl(200 80% 60%)",
  "hsl(280 70% 65%)",
  "hsl(15 85% 60%)",
  "hsl(170 70% 50%)",
  "hsl(330 75% 62%)",
];

/**
 * MOCK-PURGE-2 — emission distribution is derived from the LIVE chain
 * snapshot (top 8 subnets by emission). With no snapshot the caller shows
 * an honest empty state.
 */
export function buildEmissionShares(subnets: Subnet[]): EmissionShare[] {
  return [...subnets]
    .filter((s) => s.emission > 0)
    .sort((a, b) => b.emission - a.emission)
    .slice(0, 8)
    .map((s, i) => ({
      name: s.name,
      symbol: s.symbol,
      netuid: s.netuid,
      emission: s.emission,
      color: EMISSION_COLORS[i % EMISSION_COLORS.length],
    }));
}
