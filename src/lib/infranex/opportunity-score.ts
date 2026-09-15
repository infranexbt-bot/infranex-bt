import type { LiveNetworkSnapshot } from "./chain";
import { computeStakingStrategies, type StakingStrategy, STAKING_MODEL } from "./staking";
import type { ProfitabilityConfig } from "./profitability";
import { mergeOpportunities, type LiveOpportunity } from "./use-network";

// ---------------------------------------------------------------------------
// TAO Opportunity Score — the home-screen verdict.
//
// Answers ONE question with numbers: "with TAO in hand, what earns more —
// mining the best-fit subnet, or staking passively?"
//
// Comparison basis: MONTHLY NET ROI %.
//   mining  → profitability report's roiMonthlyPct (net of GPU + infra)
//   staking → net APY / 12 (after validator take + pool fees)
// The score itself measures the EDGE of the recommendation (tanh-mapped
// 0–100), and confidence reflects how much live data backs both sides.
// ---------------------------------------------------------------------------

export interface ScoredStrategy {
  strategy: "mine" | "stake";
  /** Subnet name (mine) or strategy name (stake). */
  title: string;
  netuid: number | null;
  /** Monthly net ROI % — the comparison metric. */
  roiMonthlyPct: number;
  /** Absolute monthly net, USD + INR (mining: per miner slot; staking: on capitalTao). */
  netMonthlyUsd: number;
  netMonthlyInr: number;
  /** TAO accumulation per month (mining: gross emission share; staking: TAO-equivalent). */
  taoPerMonth: number;
  riskLevel: "low" | "medium" | "high";
  confidence: number;
  /** Mining only — the GPU the subnet needs. */
  requiredGpu?: string;
  minVramGb?: number;
  /** Staking only — where the yield comes from. */
  detail?: string;
}

export interface OpportunityScoreResult {
  asOf: string;
  taoPriceUsd: number;
  usdInr: number;
  capitalTao: number;
  score: number; // 0–100 — conviction in the recommendation
  /** Headline confidence 0–1 — model blend, or 70% model + 30% observed
   *  accuracy when a real TRUST-LOOP calibration sample exists. */
  confidence: number;
  recommended: ScoredStrategy;
  alternative: ScoredStrategy;
  closeCall: boolean;
  /** Both sides, for transparency. */
  mining: { roiMonthlyPct: number; netMonthlyUsd: number; taoPerMonth: number } | null;
  staking: { netApyPct: number; monthlyTao: number; monthlyInr: number; kind: "root" | "subnet" };
  stakingRoot: StakingStrategy;
  stakingTopSubnet: StakingStrategy | null;
  /** Top mining runners + top staking pools beyond the headline pair. */
  alternatives: {
    mining: Array<{ netuid: number; name: string; roiMonthlyPct: number; netMonthlyUsd: number; gpu: string; riskLevel: string }>;
    staking: Array<{ netuid: number; name: string; netApyPct: number; riskLevel: string; kind: "root" | "subnet" }>;
  };
  notes: string[];
  /** True when a live chain snapshot backs the verdict (vs curated fallback). */
  liveData: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function inr(usd: number, usdInr: number): number {
  return Math.round(usd * usdInr);
}

/** Mining candidates: real net-positive runners, optionally capped to the
 *  user's GPU. Ranked by the profitability engine's monthly ROI %. */
function bestMiningCandidates(
  snap: LiveNetworkSnapshot,
  profConfig: ProfitabilityConfig | undefined,
  maxGpuVramGb?: number
): LiveOpportunity[] {
  const rows = mergeOpportunities(snap, profConfig).filter((o) => {
    if (o.netuid === 0) return false;
    if (o.meetsMinimum === false) return false;
    if (!(o.netMonthlyUsd != null && o.netMonthlyUsd > 0)) return false;
    if (maxGpuVramGb != null && o.minVramGb > maxGpuVramGb) return false;
    return true;
  });
  const roi = (o: LiveOpportunity): number =>
    o.profitability?.roiMonthlyPct ??
    (o.netMonthlyUsd && o.gpuCostMonthlyUsd
      ? (o.netMonthlyUsd / Math.max(o.gpuCostMonthlyUsd, 100)) * 100
      : 0);
  return rows.sort((a, b) => roi(b) - roi(a));
}

function miningStrategy(o: LiveOpportunity, usdInr: number): ScoredStrategy {
  const roiMonthlyPct =
    o.profitability?.roiMonthlyPct ??
    (o.netMonthlyUsd && o.gpuCostMonthlyUsd
      ? Math.round((o.netMonthlyUsd / Math.max(o.gpuCostMonthlyUsd, 100)) * 1000) / 10
      : 0);
  return {
    strategy: "mine",
    title: o.subnetName,
    netuid: o.netuid,
    roiMonthlyPct: Math.round(roiMonthlyPct * 10) / 10,
    netMonthlyUsd: Math.round(o.netMonthlyUsd ?? 0),
    netMonthlyInr: inr(o.netMonthlyUsd ?? 0, usdInr),
    taoPerMonth: Math.round((o.estimatedDailyReward ?? 0) * 30 * 1000) / 1000,
    riskLevel: o.riskLevel ?? "high",
    confidence: o.confidence ?? 0.5,
    requiredGpu: o.recommendedGpu,
    minVramGb: o.minVramGb,
    detail: `net of GPU + infra (${o.profitability ? "full P&L" : "ledger estimate"})`,
  };
}

function stakingStrategy(s: StakingStrategy, capitalTao: number, _usdInr: number): ScoredStrategy {
  const monthlyTao = s.monthlyTao(capitalTao);
  return {
    strategy: "stake",
    title: s.name,
    netuid: s.netuid,
    roiMonthlyPct: Math.round((s.netApyPct / 12) * 100) / 100,
    // USD value is filled in by the caller (needs taoPriceUsd).
    netMonthlyUsd: 0,
    netMonthlyInr: 0,
    taoPerMonth: monthlyTao,
    riskLevel: s.riskLevel,
    confidence: s.confidence,
    detail: s.kind === "root" ? "TAO-denominated · low risk" : "alpha-denominated · price risk",
  };
}

export interface TrustCalibrationInput {
  /** Total earning days behind the observed accuracy (≥ 7 to apply). */
  minerDays: number;
  /** Mean actual ÷ projected ratio across calibrated miners (0–1+). */
  accuracyRatio: number;
}

export interface OpportunityScoreOptions {
  /** Capital assumed for the staking leg, in TAO (default 10). */
  capitalTao?: number;
  /** USD→INR (default: model constant). */
  usdInr?: number;
  /** Cap mining candidates to GPUs up to this VRAM (undefined = any). */
  maxGpuVramGb?: number;
  /** Profitability config (electricity etc.) — forwarded to the miner ledger. */
  profConfig?: ProfitabilityConfig;
  /** TRUST-LOOP — observed accuracy of our own past projections. When a real
   *  sample exists (≥ 7 miner-days), the headline confidence becomes
   *  70% model + 30% observed instead of asserted. */
  calibration?: TrustCalibrationInput | null;
}

export function computeOpportunityScore(
  snap: LiveNetworkSnapshot,
  opts?: OpportunityScoreOptions
): OpportunityScoreResult {
  const capitalTao = Math.max(0.1, opts?.capitalTao ?? 10);
  const usdInr = opts?.usdInr ?? STAKING_MODEL.USD_INR;
  const taoUsd = snap?.taoPriceUsd || 0;

  const { root: stakingRoot, subnets: stakingSubnets } = computeStakingStrategies(snap, {
    maxSubnetStrategies: 5,
  });
  const stakingTopSubnet = stakingSubnets[0] ?? null;

  // Best staking lane: root unless a subnet pool beats it by a real margin.
  const bestStaking =
    stakingTopSubnet && stakingTopSubnet.netApyPct > stakingRoot.netApyPct * 1.5 + 2
      ? stakingTopSubnet
      : stakingRoot;

  const miners = opts?.profConfig
    ? bestMiningCandidates(snap, opts.profConfig, opts?.maxGpuVramGb)
    : bestMiningCandidates(snap, undefined, opts?.maxGpuVramGb);
  const bestMiner = miners[0] ?? null;

  const miningStrategyRow = bestMiner ? miningStrategy(bestMiner, usdInr) : null;
  const stakingStrategyRow = stakingStrategy(bestStaking, capitalTao, usdInr);
  // Fill the USD legs of the staking strategy (needs the live TAO price).
  stakingStrategyRow.netMonthlyUsd = Math.round(stakingStrategyRow.taoPerMonth * taoUsd);
  stakingStrategyRow.netMonthlyInr = inr(stakingStrategyRow.netMonthlyUsd, usdInr);

  const notes: string[] = [];
  const liveData = Boolean(snap && snap.source === "live" && snap.subnets.length > 1);

  let recommended: ScoredStrategy;
  let alternative: ScoredStrategy;
  if (!miningStrategyRow) {
    // No net-positive mining candidate → staking wins by default.
    recommended = stakingStrategyRow;
    alternative = stakingStrategyRow; // UI shows only staking leg when true
    notes.push(
      "No net-positive mining opportunity under the current profitability settings — passive staking is the whole play right now."
    );
  } else {
    const edge = miningStrategyRow.roiMonthlyPct - stakingStrategyRow.roiMonthlyPct;
    recommended = edge >= 0 ? miningStrategyRow : stakingStrategyRow;
    alternative = edge >= 0 ? stakingStrategyRow : miningStrategyRow;
    if (Math.abs(edge) < 1) {
      notes.push(
        "Close call — the mining edge is under 1pp/month; GPU downtime or an alpha dip can flip the ranking."
      );
    }
    notes.push(
      `Mining ROI ${miningStrategyRow.roiMonthlyPct.toFixed(1)}%/mo vs staking ${stakingStrategyRow.roiMonthlyPct.toFixed(2)}%/mo — the score tracks this edge.`
    );
  }

  const score = clamp(
    Math.round(
      50 +
        50 *
          Math.tanh(
            (recommended.roiMonthlyPct - alternative.roiMonthlyPct) / 8
          )
    ),
    3,
    98
  );

  let confidence =
    Math.round(
      (recommended.confidence * 0.7 + alternative.confidence * 0.3) * 100
    ) / 100;

  // TRUST-LOOP recalibration — the score's confidence stops being purely a
  // model opinion once real miners have judged our projections.
  const cal = opts?.calibration;
  if (cal && cal.minerDays >= 7 && Number.isFinite(cal.accuracyRatio)) {
    const observed = Math.min(Math.max(cal.accuracyRatio, 0), 1);
    confidence = Math.round((confidence * 0.7 + observed * 100 * 0.3)) / 100;
    notes.push(
      `Confidence includes observed projection accuracy: ${Math.round(cal.accuracyRatio * 100)}% over ${cal.minerDays} miner-days of real earnings.`
    );
  }

  if (!liveData) {
    notes.push("Chain snapshot not live — figures run on the curated fallback until the scanner syncs.");
  }
  notes.push(
    `Staking net APY is after the validator take (${stakingRoot.validatorTakePct}%) and a ${STAKING_MODEL.POOL_SWAP_FEE_PCT}% pool round-trip haircut; subnet staking additionally carries alpha/TAO price risk.`
  );

  const alternatives = {
    mining: miners.slice(0, 3).map((o) => ({
      netuid: o.netuid,
      name: o.subnetName,
      roiMonthlyPct:
        o.profitability?.roiMonthlyPct ??
        (o.netMonthlyUsd && o.gpuCostMonthlyUsd
          ? Math.round((o.netMonthlyUsd / Math.max(o.gpuCostMonthlyUsd, 100)) * 1000) / 10
          : 0),
      netMonthlyUsd: Math.round(o.netMonthlyUsd ?? 0),
      gpu: o.recommendedGpu,
      riskLevel: o.riskLevel ?? "high",
    })),
    staking: [stakingRoot, ...stakingSubnets].slice(0, 4).map((s) => ({
      netuid: s.netuid,
      name: s.name,
      netApyPct: s.netApyPct,
      riskLevel: s.riskLevel,
      kind: s.kind,
    })),
  };

  return {
    asOf: new Date().toISOString(),
    taoPriceUsd: taoUsd,
    usdInr,
    capitalTao,
    score,
    confidence,
    recommended,
    alternative,
    closeCall: recommended !== alternative && Math.abs(recommended.roiMonthlyPct - alternative.roiMonthlyPct) < 1,
    mining: miningStrategyRow
      ? {
          roiMonthlyPct: miningStrategyRow.roiMonthlyPct,
          netMonthlyUsd: miningStrategyRow.netMonthlyUsd,
          taoPerMonth: miningStrategyRow.taoPerMonth,
        }
      : null,
    staking: {
      netApyPct: bestStaking.netApyPct,
      monthlyTao: stakingStrategyRow.taoPerMonth,
      monthlyInr: stakingStrategyRow.netMonthlyInr,
      kind: bestStaking.kind,
    },
    stakingRoot,
    stakingTopSubnet,
    alternatives,
    notes,
    liveData,
  };
}

// Re-exports so the dashboard can import everything from one module.
export { STAKING_MODEL, computeStakingStrategies } from "./staking";
export type { StakingStrategy } from "./staking";
