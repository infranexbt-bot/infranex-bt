import type { LiveNetworkSnapshot, LiveSubnetMetrics } from "./chain";

// ---------------------------------------------------------------------------
// TAO Staking / Delegation model (dTAO era).
//
// Two earn lanes exist for passive TAO on Bittensor (researched Sept 2026):
//
//   1. ROOT staking (netuid 0) — delegate TAO to a root validator. Paid in
//      TAO. Lower risk. Live market estimates: Coinbase 5.25%,
//      StakingRewards 5.65% APY. Root validators route dividends through
//      "baskets" (escrowed index funds of subnet alpha). The yield decays
//      slowly as emission schedules advance.
//
//   2. SUBNET staking (dTAO) — stake TAO into a subnet's liquidity pool /
//      a validator on that subnet. Accrues in the subnet's ALPHA token:
//      nominators share the dividends lane (~42% of subnet emission flows
//      to validators and their nominators). High nominal APY, but the
//      alpha/TAO rate moves — a subnet yielding 40% in alpha whose token
//      drops 30% nets less than root. Thin pools add exit slippage.
//
// Every constant below is visible and adjustable — the model is an ESTIMATE
// layer on top of live chain data, never a promise.
// ---------------------------------------------------------------------------

export const STAKING_MODEL = {
  /** Root staking gross APY baseline (%) — Coinbase 5.25 / StakingRewards 5.65 (2026). */
  ROOT_GROSS_APY_PCT: 5.25,
  /** Validator take (commission) — chain default 18%; live range 9–20%. */
  VALIDATOR_TAKE_PCT: 18,
  /** dTAO dividends lane share of subnet emission reaching validators+nominators. */
  STAKER_EMISSION_SHARE: 0.42,
  /** Round-trip pool haircut (stake → alpha → unstake price impact / fees), %. */
  POOL_SWAP_FEE_PCT: 2,
  /** Pools below this TAO depth are skipped — exit slippage dominates yield. */
  MIN_POOL_TAO: 1_000,
  /** Pools above this depth are considered liquid enough to soften risk. */
  DEEP_POOL_TAO: 100_000,
  /** Static USD→INR for the ₹ projections (phase 2: live FX fetch). */
  USD_INR: 87.5,
} as const;

export interface StakingStrategy {
  kind: "root" | "subnet";
  netuid: number; // 0 for root
  name: string;
  /** Gross APY before validator commission, in %. */
  grossApyPct: number;
  /** Net APY after validator take + pool fees, in %. */
  netApyPct: number;
  validatorTakePct: number;
  /** 24h alpha/TAO drift for subnet strategies (null for root — TAO-denominated). */
  alphaChange24hPct: number | null;
  /** TAO-equivalent monthly accumulation on `capitalTao`. */
  monthlyTao: (capitalTao: number) => number;
  riskLevel: "low" | "medium" | "high";
  /** 0–1 — how much live chain data backs the number vs model baselines. */
  confidence: number;
  notes: string[];
  /** "root-baseline" | "root-chain" | "subnet-pool" */
  source: string;
}

export interface StakingOptions {
  /** Override the validator commission (%, 0–50). Default: chain default 18. */
  validatorTakePct?: number;
  /** Max subnet staking strategies to return (default 5). */
  maxSubnetStrategies?: number;
}

function monthlyTaoFor(netApyPct: number) {
  return (capitalTao: number) =>
    Math.round((capitalTao * (netApyPct / 100) / 12) * 1000) / 1000;
}

/** Root staking (netuid 0) — the market-observed baseline is authoritative:
 *  root validators route dividends through escrowed alpha baskets, and a
 *  naive emission/stake proxy misreads root's dTAO mechanics (root's pool
 *  price ≠ what stakers receive). The chain-derived figure is surfaced as a
 *  note when it disagrees. Always TAO-denominated. */
function computeRootStaking(snap: LiveNetworkSnapshot, takePct: number): StakingStrategy {
  const notes: string[] = [];
  const root = snap.subnets.find((s) => s.netuid === 0) as LiveSubnetMetrics | undefined;
  const grossApyPct = STAKING_MODEL.ROOT_GROSS_APY_PCT;
  const source: StakingStrategy["source"] = "root-baseline";
  let confidence = 0.7;

  const stake = root?.subnetTao ?? 0;
  const emission = root?.emissionTaoPerDay ?? 0;
  if (stake > 50_000 && emission > 0) {
    const derived = ((emission * 365) / stake) * 100;
    if (derived >= 1 && derived <= 12) {
      notes.push(
        `Naive chain proxy (root emission ${emission.toFixed(0)} TAO/day ÷ ${Math.round(stake).toLocaleString()} TAO staked) suggests ${(Math.round(derived * 100) / 100).toFixed(2)}% — root's basket mechanics make the market-observed baseline the better estimate.`
      );
    }
  }
  notes.push(
    `Baseline from market estimates (Coinbase 5.25%, StakingRewards 5.65% — 2026), net of the validator take (${takePct}%). Root staking pays in TAO — no alpha price exposure, unstake is liquid.`
  );

  const netApyPct =
    Math.round(grossApyPct * (1 - takePct / 100) * 100) / 100;
  return {
    kind: "root",
    netuid: 0,
    name: "Root network staking",
    grossApyPct,
    netApyPct,
    validatorTakePct: takePct,
    alphaChange24hPct: null,
    monthlyTao: monthlyTaoFor(netApyPct),
    riskLevel: "low",
    confidence,
    notes,
    source,
  };
}

/** One subnet pool → staking strategy estimate (TAO-equivalent). */
function computeSubnetStaking(
  live: LiveSubnetMetrics,
  takePct: number
): StakingStrategy | null {
  const notes: string[] = [];
  const { emissionTaoPerDay, subnetTao } = live;
  if (!emissionTaoPerDay || emissionTaoPerDay <= 0) return null;
  if (!subnetTao || subnetTao < STAKING_MODEL.MIN_POOL_TAO) {
    return null; // thin pool — exit slippage dominates any yield
  }

  // Whole-pool TAO yield → the nominator's share (dividends lane), net of
  // validator commission and a round-trip pool haircut.
  const poolYieldPct = Math.min(((emissionTaoPerDay * 365) / subnetTao) * 100, 200);
  const netApyPct =
    Math.round(
      poolYieldPct *
        STAKING_MODEL.STAKER_EMISSION_SHARE *
        (1 - takePct / 100) *
        (1 - STAKING_MODEL.POOL_SWAP_FEE_PCT / 100) *
        100
    ) / 100;
  if (netApyPct <= 0.1) return null;

  const drift = live.alphaPriceChange24h;
  const deep = subnetTao >= STAKING_MODEL.DEEP_POOL_TAO;
  const calm = drift != null && Math.abs(drift) < 8;

  // Risk: subnet staking is never "low" — the accrual token moves vs TAO.
  let riskLevel: StakingStrategy["riskLevel"] = "high";
  if (deep && calm && live.emissionEnabled) riskLevel = "medium";

  if (drift != null) {
    notes.push(
      `Alpha/TAO ${drift >= 0 ? "+" : ""}${drift.toFixed(1)}% in 24h — ${
        drift >= 0 ? "positive" : "negative"
      } momentum; net figures assume a flat alpha price.`
    );
  } else {
    notes.push("Alpha price trend unavailable — treat the net APY as indicative only.");
  }
  if (!deep) notes.push("Shallow pool — exiting large positions will move the price.");
  if (!live.emissionEnabled) return null; // no emissions → nothing to stake for
  notes.push("Accrues in the subnet's alpha token; selling into TAO adds pool impact.");

  const confidence = Math.min(0.75, 0.5 + (drift != null ? 0.1 : 0) + (live.rewardedMiners != null ? 0.1 : 0));

  return {
    kind: "subnet",
    netuid: live.netuid,
    name: live.name ?? `Subnet ${live.netuid}`,
    grossApyPct: Math.round(poolYieldPct * 100) / 100,
    netApyPct,
    validatorTakePct: takePct,
    alphaChange24hPct: drift,
    monthlyTao: monthlyTaoFor(netApyPct),
    riskLevel,
    confidence,
    notes,
    source: "subnet-pool",
  };
}

/** All staking strategies for the network: root first, then subnet pools by
 *  net APY (descending). Pure — safe on server and client. */
export function computeStakingStrategies(
  snap: LiveNetworkSnapshot,
  opts?: StakingOptions
): { root: StakingStrategy; subnets: StakingStrategy[] } {
  const takePct = Math.max(0, Math.min(50, opts?.validatorTakePct ?? STAKING_MODEL.VALIDATOR_TAKE_PCT));
  const root = computeRootStaking(snap, takePct);
  const subnets: StakingStrategy[] = [];
  for (const live of snap.subnets) {
    if (live.netuid === 0) continue;
    const s = computeSubnetStaking(live, takePct);
    if (s) subnets.push(s);
  }
  subnets.sort((a, b) => b.netApyPct - a.netApyPct);
  return { root, subnets: subnets.slice(0, opts?.maxSubnetStrategies ?? 5) };
}
