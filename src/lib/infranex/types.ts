// Infranex BT — domain types (adapted for the single-page intelligence platform)

import type { ProfitabilityReport, ProfitVerdict } from "./profitability";
import type { EarnChance } from "./miner-score";

export interface Subnet {
  netuid: number;
  name: string;
  symbol: string;
  description: string;
  category: string;
  owner: string;
  tempo: number;
  emission: number; // TAO per block
  taoInReserve: number;
  price: number; // TAO price of alpha
  marketCap: number;
  volume24h: number;
  change24h: number;
  minersCount: number;
  validatorsCount: number;
  maxNeurons: number;
  status: "active" | "inactive" | "pending";
  registrationOpen: boolean;
  createdAt: string;
  tags: string[];
  minVramGb: number;
  recommendedGpu: string;
  githubUrl?: string | null;
  website?: string | null;
  // DATA-AUDIT-1: the old `miningRequirements` (fabricated per-category
  // docker images / commands) was removed — requirements now come ONLY from
  // the live repo profiler (SubnetRequirementsProfile / InfraStack).
  // --- Live seat/registration data (chain snapshot; absent on curated-only) ---
  /** Current registration burn cost in TAO — the deterministic entry path when full. */
  burnCostTao?: number | null;
  /** Immunity period in blocks — protection window a new seat gets. */
  immunityBlocks?: number | null;
  /** Max UIDs (slot capacity). */
  maxUids?: number | null;
  /** UIDs that earned incentive last epoch. */
  rewardedMiners?: number | null;
}

export interface OpportunityFactor {
  name: string;
  value: number; // weighted contribution
  weight: number;
  raw: number; // raw component score 0-100
  impact: "positive" | "negative" | "neutral";
  description: string;
}

export interface Opportunity {
  id: string;
  netuid: number;
  subnetName: string;
  subnetSymbol: string;
  category: string;
  type: "mining" | "validating" | "staking";
  score: number; // 0-100
  rank: number;
  estimatedDailyReward: number; // TAO
  estimatedMonthlyRewardUsd: number;
  estimatedApy: number;
  requiredStake: number;
  utilization: number; // 0-1
  riskLevel: "low" | "medium" | "high";
  confidence: number; // 0-1
  factors: OpportunityFactor[];
  status: "active" | "pending" | "expired";
  updatedAt: string;
  // GPU requirements (copied from the subnet for quick reference)
  minVramGb: number;
  recommendedGpu: string;
  // --- Miner's Ledger v2 (all optional so legacy rows stay valid) ---
  /** Work type the classifier detected (drives the GPU requirement). */
  workType?: string;
  /** GitHub-scraped GPU count (e.g. 8 for "8x H200"). */
  gpuCount?: number | null;
  /** Hosting constraints scraped from the subnet's repo README
   *  (bare metal/VM only, TEE/TDX, static IP + 1:1 ports). */
  hosting?: {
    bareMetalOnly: boolean;
    teeRequired: boolean;
    staticIpRequired: boolean;
    notes: string[];
  } | null;
  /** Repo URL the hosting/GPU requirements came from. */
  requirementsSource?: string | null;
  /** Curated official mechanics (mechanics.ts) — null when none verified. */
  mechanics?: {
    netuid: number;
    subnetName: string;
    sources: { label: string; url: string }[];
    rewardWindowDays?: number;
    rewardWindowQuote?: string;
    bountyQuote?: string;
    gpuVariety?: { quote: string; catalog: string[] };
    validatedTopologies?: string[];
    optimizationTargets: string[];
    operations: { title: string; detail: string; quote?: string }[];
    controlPlaneMonthlyUsd?: number;
    curatedAt: string;
  } | null;
  /** Hosting-aware cost class: bare-metal dedicated vs container rental. */
  costClass?: "container" | "bare-metal" | null;
  /** Gross per-EARNING-miner monthly USD (before GPU + infra costs). */
  grossMonthlyUsd?: number;
  /** Net monthly USD after GPU rental + infra — the miner's bottom line. */
  netMonthlyUsd?: number;
  gpuCostMonthlyUsd?: number;
  infraCostMonthlyUsd?: number;
  netDailyTao?: number;
  /** Alpha token price in USD (pool ratio × TAO spot). */
  alphaPriceUsd?: number;
  /** Alpha/TAO price change vs ~24h ago (server-side ring buffer). */
  alphaChange24h?: number | null;
  /** TAO-side pool depth — exit liquidity for mined alpha. */
  liquidityTao?: number;
  /** Daily earnings ÷ alpha pool, in % — sell-pressure price impact. */
  slippagePct?: number | null;
  /** Registration burn cost (TAO) — demand signal for the seat. */
  burnCostTao?: number | null;
  /** Share of last-epoch incentive captured by the top 10% of UIDs (0-1). */
  top10IncentiveShare?: number | null;
  /** Median earning UID's share vs the mean — ≪1 means a whale takes most rewards. */
  rewardMedianShare?: number | null;
  /** Mean daily TAO over rewarded UIDs (the median-earner figure is estimatedDailyReward). */
  perEarningMeanDailyTao?: number;
  /** Share of registered miners that earned reward last epoch (0-1). */
  rewardedRatio?: number | null;
  /** Estimated weeks until a newcomer's bonds mature (ramp penalty). */
  rampWeeks?: number | null;
  freeSlots?: number | null;
  totalSlots?: number | null;
  immunityBlocks?: number | null;
  /** Chance to earn · month 1 — newcomer odds of earning any reward. */
  earnChance?: EarnChance;
  // --- Profitability Engine ---
  /** Full P&L: revenue − GPU − storage − infra − other = net, plus ROI,
   *  daily/weekly/monthly profit, break-even, margin, risk-adjusted and the
   *  minimum-entry-rule verdict. */
  profitability?: ProfitabilityReport;
  /** Convenience mirror of profitability.verdict for quick band checks. */
  verdict?: ProfitVerdict;
  /** Minimum entry rule: net ≥ target. Below → forced AVOID band. */
  meetsMinimum?: boolean;
}

export interface GPUModel {
  id: string;
  name: string;
  manufacturer: "NVIDIA" | "AMD";
  vramGb: number;
  cudaCores: number;
  fp16Tflops: number;
  tdpWatts: number;
  generation: string;
  tierLabel: "Entry" | "Mid" | "High" | "Flagship";
}

/**
 * TIER4 — normalize an offer's display-provider label ("RunPod", "Vast.ai",
 * "Lambda", "runpod"…) to a canonical provider id. Catalog sources have
 * shipped inconsistent casings ("runpod" vs "RunPod" vs "Vast.ai"); the
 * migration preflight + dialog filter on this helper so live targets
 * actually match. Client-safe (pure) — imported by server libs and
 * client components alike.
 */
export function offerProviderId(
  provider: string
): "runpod" | "vast" | "lambda" | "nvidia" | "other" {
  const p = provider.trim().toLowerCase();
  if (p === "runpod") return "runpod";
  if (p === "vast.ai" || p === "vast") return "vast";
  if (p === "lambda") return "lambda";
  if (p === "nvidia") return "nvidia";
  return "other";
}

export interface GPUOffer {
  id: string;
  model: string;
  vramGb: number;
  provider: string;
  region: string;
  hourlyPrice: number;
  monthlyPrice: number;
  availability: "available" | "limited" | "scarce";
  isSpot: boolean;
  ramGb: number;
  cpuCores: number;
}

export interface EmissionShare {
  name: string;
  symbol: string;
  netuid: number;
  emission: number;
  color: string;
}

export type ViewKey =
  | "dashboard"
  | "opportunities"
  | "subnets"
  | "judge"
  | "cpu-guide"
  | "gpus"
  | "miners"
  | "deployments"
  | "devops"
  | "monitoring"
  | "optimization"
  | "analytics"
  | "system"
  | "runbook"
  | "admin";
