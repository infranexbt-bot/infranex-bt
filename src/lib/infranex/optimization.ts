import { db } from "@/lib/db";
import { loadProfitabilityConfig } from "./trust";
import { fetchLiveSnapshot } from "./chain";
import { mergeOpportunities, type LiveOpportunity } from "./live-merge";
import { fetchAllLiveOffers } from "./providers";
import type { GPUOffer } from "./types";
import type { MonitoredDeployment, MonitoringOverview } from "./monitoring";

/**
 * Optimization Engine.
 *
 * Analyzes monitoring data for each started deployment and produces a
 * recommendation: KEEP, OPTIMIZE, or SWITCH.
 *
 *   KEEP     — miner is healthy and profitable; no action needed
 *   OPTIMIZE — miner is underperforming but the subnet is still viable;
 *              tune config (batch size, model weights, hotkey)
 *   SWITCH   — miner/subnet combo is no longer profitable; move to a
 *              better subnet (with specific alternatives suggested)
 *
 * Also produces portfolio-level recommendations.
 */

export type RecommendationType = "keep" | "optimize" | "switch" | "watch";

export interface OptimizationAction {
  type: "tune_config" | "update_weights" | "check_hotkey" | "switch_subnet" | "switch_gpu" | "terminate" | "none";
  label: string;
  description: string;
  priority: "low" | "medium" | "high";
}

export interface AlternativeSubnet {
  netuid: number;
  name: string;
  symbol: string;
  score: number;
  category: string;
  estimatedApy: number;
  reason: string;
}

export interface AlternativeGpu {
  model: string;
  provider: string;
  hourlyPrice: number;
  vramGb: number;
  savingsPerMonth: number;
  reason: string;
}

export interface DeploymentRecommendation {
  deploymentId: string;
  minerName: string;
  netuid: number;
  subnetName: string;
  type: RecommendationType;
  score: number; // 0-100, higher = healthier
  headline: string;
  reasoning: string[];
  actions: OptimizationAction[];
  alternatives: {
    subnets: AlternativeSubnet[];
    gpus: AlternativeGpu[];
  };
  projectedImprovement: {
    currentRoi: number | null;
    projectedRoi: number | null;
    monthlyGainUsd: number | null;
  };
}

export interface OptimizationOverview {
  recommendations: DeploymentRecommendation[];
  portfolio: {
    totalDeployments: number;
    keep: number;
    optimize: number;
    switch: number;
    watch: number;
    projectedMonthlyGainUsd: number;
    worstPerformer: string | null;
    bestPerformer: string | null;
  };
  fetchedAt: string;
}

// --- Scoring logic ---

function computeHealthScore(
  dep: MonitoredDeployment
): number {
  let score = 50; // baseline
  const { monitoring: m } = dep;

  // Pod health
  if (m.pod.exists && m.pod.desiredStatus === "RUNNING") score += 20;
  else if (!m.pod.exists && dep.mode === "mock") score += 5; // mock is ok
  else score -= 30;

  // On-chain incentive
  if (m.chain.incentive !== null) {
    if (m.chain.incentive > 0.1) score += 25;
    else if (m.chain.incentive > 0.05) score += 15;
    else if (m.chain.incentive > 0.01) score += 0; // warmup
    else score -= 10;
  }

  // Trust
  if (m.chain.trust !== null) {
    if (m.chain.trust > 0.05) score += 10;
    else if (m.chain.trust < 0.01) score -= 5;
  }

  // ROI
  if (m.rewards.roiPercent !== null) {
    if (m.rewards.roiPercent > 50) score += 15;
    else if (m.rewards.roiPercent > 0) score += 5;
    else if (m.rewards.roiPercent > -20) score -= 10;
    else score -= 25;
  }

  // Alerts
  const criticalCount = m.alerts.filter((a) => a.level === "critical").length;
  const warningCount = m.alerts.filter((a) => a.level === "warning").length;
  score -= criticalCount * 15;
  score -= warningCount * 5;

  return Math.max(0, Math.min(100, score));
}

/** Load the SubnetOverride table as the merge map (same shape the client builds). */
async function loadOverrides(): Promise<Map<number, Record<string, unknown>>> {
  const map = new Map<number, Record<string, unknown>>();
  try {
    const rows = await db.subnetOverride.findMany();
    for (const o of rows) {
      const entry: Record<string, unknown> = {};
      if (o.name) entry.name = o.name;
      if (o.description) entry.description = o.description;
      if (o.category) entry.category = o.category;
      if (o.minVramGb != null) entry.minVramGb = o.minVramGb;
      if (o.recommendedGpu) entry.recommendedGpu = o.recommendedGpu;
      if (o.gpuCount != null) entry.gpuCount = o.gpuCount;
      if (o.hostingRequirements) {
        try {
          entry.hosting = JSON.parse(o.hostingRequirements);
        } catch {
          // corrupt JSON — ignore, classifier fallback applies
        }
      }
      if (o.mechanicsJson) {
        try {
          entry.mechanics = JSON.parse(o.mechanicsJson);
        } catch {
          // corrupt JSON — ignore, scoring falls back to the heuristic
        }
      }
      if (o.requirementsSource) entry.requirementsSource = o.requirementsSource;
      if (o.githubUrl) entry.githubUrl = o.githubUrl;
      if (o.website) entry.website = o.website;
      map.set(o.netuid, entry);
    }
  } catch {
    // DB hiccup — merge proceeds without overrides (chain data only)
  }
  return map;
}

// DATA-AUDIT-1 — subnet alternatives come ONLY from the LIVE chain snapshot,
// scored by the same Miner's Ledger engine the Opportunities view uses. With
// no live snapshot there is nothing honest to recommend, so alternatives are
// empty (the old fabricated-catalog pool is gone).
async function computeLiveOpportunities(): Promise<LiveOpportunity[]> {
  try {
    const [snap, overrides, profConfig] = await Promise.all([
      fetchLiveSnapshot(),
      loadOverrides(),
      loadProfitabilityConfig(),
    ]);
    if (!snap || snap.source === "error" || snap.subnets.length === 0) return [];
    return mergeOpportunities(snap, profConfig, overrides);
  } catch {
    return [];
  }
}

function findAlternativeSubnets(
  liveOpps: LiveOpportunity[],
  currentNetuid: number,
  currentScore: number
): AlternativeSubnet[] {
  return liveOpps
    .filter((o) => o.netuid !== currentNetuid && o.score > currentScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((o) => ({
      netuid: o.netuid,
      name: o.subnetName,
      symbol: o.subnetSymbol,
      score: o.score,
      category: o.category,
      estimatedApy: o.estimatedApy,
      reason: `Score ${o.score.toFixed(1)} (vs current ${currentScore.toFixed(1)}), APY ${o.estimatedApy.toFixed(1)}%, ${o.riskLevel} risk`,
    }));
}

function findAlternativeGpus(
  currentModel: string,
  currentHourlyPrice: number | null,
  minVramGb: number,
  offers: GPUOffer[]
): AlternativeGpu[] {
  const currentPrice = currentHourlyPrice ?? 0;
  // MOCK-PURGE-2 — alternatives come from the LIVE provider catalog only;
  // with no configured key there are simply no GPU alternatives to suggest.
  return offers
    .filter(
      (o) =>
        o.model !== currentModel &&
        o.vramGb >= minVramGb &&
        o.hourlyPrice < currentPrice
    )
    .sort((a, b) => a.hourlyPrice - b.hourlyPrice)
    .slice(0, 3)
    .map((o) => ({
      model: o.model,
      provider: o.provider,
      hourlyPrice: o.hourlyPrice,
      vramGb: o.vramGb,
      savingsPerMonth: Math.round((currentPrice - o.hourlyPrice) * 730),
      reason: `${o.vramGb}GB VRAM, $${o.hourlyPrice.toFixed(2)}/hr saves $${Math.round((currentPrice - o.hourlyPrice) * 730)}/mo`,
    }));
}

function buildRecommendation(
  dep: MonitoredDeployment,
  liveOffers: GPUOffer[],
  liveOpps: LiveOpportunity[]
): DeploymentRecommendation {
  const score = computeHealthScore(dep);
  // DATA-AUDIT-1: subnet score comes from the live Miner's Ledger row (when
  // the snapshot is present); without one we stay neutral instead of
  // inventing a baseline.
  const currentOpp = liveOpps.find((o) => o.netuid === dep.netuid);
  const subnetScore = currentOpp?.score ?? 50;
  const minVramForGpuSwitch = currentOpp?.minVramGb ?? 24;

  let type: RecommendationType;
  let headline: string;
  const reasoning: string[] = [];
  const actions: OptimizationAction[] = [];

  // Determine recommendation type
  if (score >= 70) {
    type = "keep";
    headline = "Performing well — keep running";
    if (dep.monitoring.chain.incentive !== null && dep.monitoring.chain.incentive > 0.1) {
      reasoning.push(`Healthy incentive at ${(dep.monitoring.chain.incentive * 100).toFixed(1)}%`);
    }
    if (dep.monitoring.rewards.roiPercent !== null && dep.monitoring.rewards.roiPercent > 0) {
      reasoning.push(`Profitable with ${dep.monitoring.rewards.roiPercent}% ROI`);
    }
    if (dep.monitoring.pod.exists && dep.monitoring.pod.desiredStatus === "RUNNING") {
      reasoning.push("Pod is running normally");
    }
    actions.push({ type: "none", label: "No action needed", description: "Continue monitoring", priority: "low" });
  } else if (score >= 40) {
    type = "optimize";
    headline = "Underperforming — optimize config";
    if (dep.monitoring.chain.incentive !== null && dep.monitoring.chain.incentive < 0.05) {
      reasoning.push(`Low incentive (${(dep.monitoring.chain.incentive * 100).toFixed(2)}%) — may still be in warmup`);
      actions.push({
        type: "update_weights",
        label: "Update model weights",
        description: "Trigger a weights update to improve inference quality",
        priority: "medium",
      });
    }
    if (dep.monitoring.rewards.roiPercent !== null && dep.monitoring.rewards.roiPercent < 0) {
      reasoning.push(`Negative ROI at ${dep.monitoring.rewards.roiPercent}% — costs exceed rewards`);
      actions.push({
        type: "tune_config",
        label: "Tune miner config",
        description: "Adjust batch size, thread count, or model precision to improve throughput",
        priority: "high",
      });
    }
    if (!dep.monitoring.chain.found) {
      reasoning.push("Hotkey not found on chain — may not be registered");
      actions.push({
        type: "check_hotkey",
        label: "Verify hotkey registration",
        description: "Ensure the hotkey is registered on the subnet and has a valid UID",
        priority: "high",
      });
    }
    actions.push({
      type: "tune_config",
      label: "Increase batch size",
      description: "Higher batch size can improve GPU utilization and inference throughput",
      priority: "medium",
    });
  } else if (score >= 20) {
    type = "switch";
    headline = "Poor performance — consider switching subnet";
    reasoning.push(`Health score ${score}/100 — significantly underperforming`);
    if (dep.monitoring.rewards.roiPercent !== null && dep.monitoring.rewards.roiPercent < -20) {
      reasoning.push(`Deeply negative ROI at ${dep.monitoring.rewards.roiPercent}%`);
    }
    if (subnetScore < 50) {
      reasoning.push(`Subnet score dropped to ${subnetScore.toFixed(1)} (WATCH band)`);
    }
    if (!dep.monitoring.pod.exists && dep.mode !== "mock") {
      reasoning.push("Pod is missing from RunPod — may have been terminated");
    }
    actions.push({
      type: "switch_subnet",
      label: "Switch to a better subnet",
      description: "Move this miner to a higher-scoring subnet (see alternatives below)",
      priority: "high",
    });
    actions.push({
      type: "switch_gpu",
      label: "Switch to a cheaper GPU",
      description: "Reduce costs by switching to a cheaper GPU that still meets VRAM requirements",
      priority: "medium",
    });
  } else {
    type = "switch";
    headline = "Critical — terminate or switch immediately";
    reasoning.push(`Health score ${score}/100 — critically underperforming`);
    reasoning.push("Continuing to run this miner is likely losing money");
    actions.push({
      type: "terminate",
      label: "Terminate deployment",
      description: "Stop the bleeding — terminate this deployment and redeploy elsewhere",
      priority: "high",
    });
    actions.push({
      type: "switch_subnet",
      label: "Switch subnet",
      description: "Redeploy on a higher-scoring subnet (see alternatives below)",
      priority: "high",
    });
  }

  // Add watch status for newly started deployments
  if (dep.status === "started" && score >= 40 && score < 70 && dep.monitoring.chain.incentive === null) {
    type = "watch";
    headline = "Recently started — monitoring warmup";
    reasoning.push("Miner is in warmup period — incentive data not yet available");
    reasoning.push("Re-evaluate after 24-48 hours of runtime");
  }

  // Find alternatives for switch recommendations
  const alternatives = type === "switch" || type === "optimize"
    ? {
        subnets: findAlternativeSubnets(liveOpps, dep.netuid, subnetScore),
        gpus: findAlternativeGpus(
          dep.gpuModel,
          dep.monitoring.pod.costPerHr,
          minVramForGpuSwitch,
          liveOffers
        ),
      }
    : { subnets: [], gpus: [] };

  // Projected improvement
  const currentRoi = dep.monitoring.rewards.roiPercent;
  let projectedRoi: number | null = null;
  if (type === "switch" && alternatives.subnets.length > 0) {
    const bestAlt = alternatives.subnets[0];
    projectedRoi = Math.round(bestAlt.estimatedApy / 2); // conservative estimate
  } else if (type === "optimize") {
    projectedRoi = currentRoi !== null ? currentRoi + 15 : null;
  }
  const monthlyGainUsd = projectedRoi !== null && dep.monitoring.rewards.costPerMonthUsd !== null
    ? Math.round(((projectedRoi - (currentRoi ?? 0)) / 100) * dep.monitoring.rewards.costPerMonthUsd)
    : null;

  return {
    deploymentId: dep.id,
    minerName: dep.minerName,
    netuid: dep.netuid,
    subnetName: dep.subnetName,
    type,
    score,
    headline,
    reasoning,
    actions,
    alternatives,
    projectedImprovement: {
      currentRoi,
      projectedRoi,
      monthlyGainUsd,
    },
  };
}

export async function computeOptimizations(
  overview: MonitoringOverview
): Promise<OptimizationOverview> {
  const startedDeps = overview.deployments.filter(
    (d) => d.status === "started"
  );

  // MOCK-PURGE-2 — GPU alternatives come from the live provider catalog
  // (single fetch per pass). No key configured → empty alternatives.
  let liveOffers: GPUOffer[] = [];
  try {
    const snap = await fetchAllLiveOffers();
    liveOffers = snap.offers;
  } catch {
    liveOffers = [];
  }

  // DATA-AUDIT-1 — subnet alternatives come from the live snapshot only.
  const liveOpps = await computeLiveOpportunities();

  const recommendations = startedDeps.map((d) => buildRecommendation(d, liveOffers, liveOpps));

  const keep = recommendations.filter((r) => r.type === "keep").length;
  const optimize = recommendations.filter((r) => r.type === "optimize").length;
  const switchCount = recommendations.filter((r) => r.type === "switch").length;
  const watch = recommendations.filter((r) => r.type === "watch").length;

  const projectedMonthlyGainUsd = recommendations.reduce(
    (sum, r) => sum + (r.projectedImprovement.monthlyGainUsd ?? 0),
    0
  );

  const scored = recommendations.filter((r) => r.score > 0);
  const worst = scored.length > 0
    ? scored.reduce((min, r) => (r.score < min.score ? r : min))
    : null;
  const best = scored.length > 0
    ? scored.reduce((max, r) => (r.score > max.score ? r : max))
    : null;

  return {
    recommendations,
    portfolio: {
      totalDeployments: startedDeps.length,
      keep,
      optimize,
      switch: switchCount,
      watch,
      projectedMonthlyGainUsd,
      worstPerformer: worst?.minerName ?? null,
      bestPerformer: best?.minerName ?? null,
    },
    fetchedAt: new Date().toISOString(),
  };
}
