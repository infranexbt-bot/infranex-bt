// ---------------------------------------------------------------------------
// TAO ENGINE — THREE-ROUTE STRATEGY PLANNER (pure math, no network).
//
// Unifies the two questions the engine already answers into the one the
// owner actually faces: "of my S TAO, how much should I STAKE (validators),
// how much should I HOLD outright, and how much should I keep in CASH?"
//
// Inputs (both already exist and are unit-tested):
//   · market  — the tao-market.ts signal (BUY/HOLD/REDUCE/SELL + confidence)
//   · staking — the tao-engine.ts output (best root-gated APY band, root APY)
//
// Output: a deterministic allocation split + per-route horizon outcomes +
// auditable reasons. This is NOT a prediction: the HOLD/STAKE routes show
// the same price-scenario grid so the routes are comparable; the only
// honest differences between staking and holding are (a) the yield band and
// (b) the α-dilution/exit-slippage risk stack on top of price risk.
//
// Allocation rules (documented, no black box):
//   base by market action:  BUY 60/30/10 · HOLD 40/40/20 · REDUCE 20/30/50 · SELL 0/10/90
//   risk "safe":            stake −15pp, hold −10pp, cash +25pp
//   risk "aggressive":      stake +10pp (only if a VIABLE staking pick exists), cash −10pp (floor 5%)
//   confidence low:         stake −10pp → cash (uncertain signal, size down)
//   confidence high:        cash −5pp → stake (only if VIABLE staking exists)
//   no VIABLE subnet beats root: stake bucket routes to ROOT staking instead
//                                (root APY replaces the subnet band)
// All percentages clipped to [0,100] and the split always sums to 100%.
// ---------------------------------------------------------------------------

import type { TaoMarketAction, TaoMarketConfidence } from "./tao-market";

export type PlanRisk = "safe" | "balanced" | "aggressive";

export interface PlanMarketContext {
  action: TaoMarketAction;
  confidence: TaoMarketConfidence;
  /** Composite market score in [-90, +100]. */
  score: number;
  spotUsd: number | null;
  d30Pct: number | null;
  volAnnualizedPct: number | null;
  fromHigh180Pct: number | null;
}

export interface PlanStakingContext {
  /** Best root-gated sustainable net APY (mid of band), % or null. */
  bestNetApyPct: number | null;
  apyLowPct: number | null;
  apyHighPct: number | null;
  rootNetApyPct: number;
  /** How many researched subnets beat the root baseline sustainably. */
  viableCount: number;
}

export interface PlanScenarioRow {
  /** Price move applied over the horizon, % (TAO/USD). */
  priceChgPct: number;
  /** End position value in TAO terms. */
  endTao: number;
  /** End position value in USD at spot×(1+priceChg). */
  endUsd: number | null;
  /** Total return vs today in TAO terms, %. */
  pnlTaoPct: number;
}

export interface PlanRoute {
  /** TAO allocated to this route (whole TAO, Σ over routes = stakeTao). */
  allocTao: number;
  allocPct: number;
  scenarios: PlanScenarioRow[];
  notes: string[];
}

export interface ThreeRoutePlan {
  stakeTao: number;
  risk: PlanRisk;
  horizonDays: number;
  /** Where the stake bucket goes when no subnet beats root. */
  stakeTarget: "subnet" | "root";
  allocation: {
    stakeTao: number;
    holdTao: number;
    cashTao: number;
    stakePct: number;
    holdPct: number;
    cashPct: number;
  };
  stake: PlanRoute;
  hold: PlanRoute;
  cash: PlanRoute;
  reasons: string[];
}

export interface ThreeRoutePlanInput {
  stakeTao: number;
  risk: PlanRisk;
  horizonDays: number;
  market: PlanMarketContext | null; // null → signal unavailable, conservative fallback
  staking: PlanStakingContext;
}

const BASE_BY_ACTION: Record<TaoMarketAction, { stake: number; hold: number; cash: number }> = {
  BUY: { stake: 60, hold: 30, cash: 10 },
  HOLD: { stake: 40, hold: 40, cash: 20 },
  REDUCE: { stake: 20, hold: 30, cash: 50 },
  SELL: { stake: 0, hold: 10, cash: 90 },
};

const clip = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function computeThreeRoutePlan(input: ThreeRoutePlanInput): ThreeRoutePlan {
  const stakeTao = Math.max(0, Math.min(Number(input.stakeTao) || 0, 10_000_000));
  const risk = input.risk;
  const horizonDays = clip(Math.round(input.horizonDays) || 90, 1, 3650);
  const reasons: string[] = [];

  // ---- 0. Degenerate stake → trivial 100% cash ----
  if (!(stakeTao > 0)) {
    return trivialPlan(0, risk, horizonDays, input.staking);
  }

  const staking = input.staking;
  const viable =
    staking.viableCount > 0 &&
    staking.bestNetApyPct != null &&
    staking.apyLowPct != null &&
    staking.apyHighPct != null;
  const stakeTarget: "subnet" | "root" = viable ? "subnet" : "root";
  if (!viable) {
    reasons.push(
      `no researched subnet beats root sustainably (${staking.viableCount} root-beaters) — the stake bucket routes to ROOT staking at ${staking.rootNetApyPct}% net`
    );
  }

  // ---- 1. Market context ----
  const m = input.market;
  let action = m?.action ?? "HOLD";
  let confidence = m?.confidence ?? "low";
  if (!m) {
    reasons.push("market signal unavailable — conservative HOLD-mix fallback used");
  } else {
    reasons.push(
      `market action ${m.action} (score ${m.score >= 0 ? "+" : ""}${m.score}, confidence ${m.confidence}) sets the base mix`
    );
    if (m.d30Pct != null) {
      reasons.push(`30d momentum ${m.d30Pct >= 0 ? "+" : ""}${m.d30Pct.toFixed(1)}%`);
    }
    if (m.volAnnualizedPct != null && m.volAnnualizedPct >= 100) {
      reasons.push(`volatility ${m.volAnnualizedPct.toFixed(0)}%/yr — very hot regime, cash cushion raised`);
    }
  }

  // Signal-unavailable fallback: treat as REDUCE-grade caution.
  const base = BASE_BY_ACTION[action];

  // ---- 2. Deterministic adjustments ----
  let stakeP = base.stake;
  let holdP = base.hold;
  let cashP = base.cash;

  if (risk === "safe") {
    stakeP -= 15;
    holdP -= 10;
    cashP += 25;
    reasons.push('risk "safe": 15pp out of stake and 10pp out of hold into cash');
  } else if (risk === "aggressive") {
    if (viable) {
      stakeP += 10;
      cashP -= 10;
      reasons.push('risk "aggressive": 10pp from cash into stake (VIABLE staking exists)');
    } else {
      holdP += 10;
      cashP -= 10;
      reasons.push('risk "aggressive": no VIABLE staking — 10pp from cash into hold instead');
    }
  }

  if (confidence === "low") {
    const shift = Math.min(stakeP, 10);
    stakeP -= shift;
    cashP += shift;
    if (shift > 0) reasons.push(`low signal confidence: ${shift}pp out of stake into cash`);
  } else if (confidence === "high" && viable && action !== "SELL") {
    const shift = Math.min(cashP, 5);
    cashP -= shift;
    stakeP += shift;
    if (shift > 0) reasons.push(`high signal confidence: ${shift}pp from cash into stake`);
  }

  // ---- 3. Clip and normalize to exactly 100 ----
  stakeP = clip(stakeP, 0, 100);
  holdP = clip(holdP, 0, 100);
  cashP = clip(cashP, 0, 100);
  const sum = stakeP + holdP + cashP;
  if (sum !== 100) cashP = clip(cashP + (100 - sum), 0, 100);
  // Final residue (can only happen if cash clipped) → hold.
  const residue = 100 - (stakeP + holdP + cashP);
  if (residue !== 0) holdP += residue;

  const allocStake = Math.round((stakeP / 100) * stakeTao);
  const allocCash = Math.round((cashP / 100) * stakeTao);
  const allocHold = Math.max(0, stakeTao - allocStake - allocCash); // residue lands here

  // ---- 4. Horizon scenario grid (same grid for HOLD and STAKE) ----
  const vol = m?.volAnnualizedPct ?? null;
  const sigmaH = vol != null && vol > 0 ? (vol / 100) * Math.sqrt(horizonDays / 365) : null;
  const moves = sigmaH
    ? [-sigmaH, -sigmaH / 2, 0, sigmaH / 2, sigmaH]
    : [-0.25, -0.1, 0, 0.1, 0.25];
  const spot = m?.spotUsd ?? null;
  if (spot == null) {
    reasons.push("no spot price — USD columns omitted, TAO-only scenarios shown");
  }

  const yieldMid = viable ? staking.bestNetApyPct! : staking.rootNetApyPct;
  const yieldLow = viable ? staking.apyLowPct! : staking.rootNetApyPct;
  const yieldHigh = viable ? staking.apyHighPct! : staking.rootNetApyPct;

  const scenarioFor = (
    alloc: number,
    chgPct: number,
    yieldPct: number
  ): PlanScenarioRow => {
    const endTao = alloc * (1 + (yieldPct / 100) * (horizonDays / 365));
    const endUsd = spot != null ? endTao * spot * (1 + chgPct / 100) : null;
    return {
      priceChgPct: Math.round(chgPct * 100) / 100,
      endTao,
      endUsd,
      pnlTaoPct: alloc > 0 ? (endTao / alloc - 1) * 100 : 0,
    };
  };

  const gridFor = (alloc: number, yieldFn: (i: number) => number): PlanScenarioRow[] =>
    alloc > 0
      ? moves.map((chg, i) => scenarioFor(alloc, chg, yieldFn(i)))
      : [];

  const stakeScenarios = gridFor(allocStake, (i) =>
    i <= 1 ? yieldLow : i === 2 ? yieldMid : yieldHigh
  );
  const holdScenarios = gridFor(allocHold, () => 0);
  const cashScenarios: PlanScenarioRow[] =
    allocCash > 0 && spot != null
      ? moves.map((chg) => ({
          priceChgPct: Math.round(chg * 100) / 100,
          endTao: spot > 0 ? allocCash / (1 + chg / 100) : allocCash, // TAO the cash could re-buy
          endUsd: allocCash * spot,
          pnlTaoPct: -chg,
        }))
      : [];

  // ---- 5. Route notes ----
  const stakeNotes: string[] = [
    stakeTarget === "subnet"
      ? `splits across the ranked VIABLE validators (best band ${yieldLow.toFixed(1)}–${yieldHigh.toFixed(1)}% net)`
      : `routes to root staking at ${staking.rootNetApyPct}% net (no swap/slippage, face-value exit)`,
    "yield is TAO-denominated; the price grid below is shared with HOLD so routes compare fairly",
  ];
  const holdNotes: string[] = [
    "pure TAO in wallet — 0% yield, 0% take, instant liquidity, no α-dilution risk",
    "wins the TAO-count race only if TAO price outpaces the staking yield band",
  ];
  const cashNotes: string[] = [
    "stables/dry powder — earns nothing but caps drawdown at 0% on this slice",
    "buy-back power shown as TAO re-purchasable if price falls",
  ];

  return {
    stakeTao,
    risk,
    horizonDays,
    stakeTarget,
    allocation: {
      stakeTao: allocStake,
      holdTao: allocHold,
      cashTao: allocCash,
      stakePct: (allocStake / stakeTao) * 100,
      holdPct: (allocHold / stakeTao) * 100,
      cashPct: (allocCash / stakeTao) * 100,
    },
    stake: {
      allocTao: allocStake,
      allocPct: stakeP,
      scenarios: stakeScenarios,
      notes: stakeNotes,
    },
    hold: {
      allocTao: allocHold,
      allocPct: holdP,
      scenarios: holdScenarios,
      notes: holdNotes,
    },
    cash: {
      allocTao: allocCash,
      allocPct: cashP,
      scenarios: cashScenarios,
      notes: cashNotes,
    },
    reasons,
  };
}

function trivialPlan(
  stakeTao: number,
  risk: PlanRisk,
  horizonDays: number,
  staking: PlanStakingContext
): ThreeRoutePlan {
  return {
    stakeTao,
    risk,
    horizonDays,
    stakeTarget: "root",
    allocation: {
      stakeTao: 0,
      holdTao: 0,
      cashTao: 0,
      stakePct: 0,
      holdPct: 0,
      cashPct: 0,
    },
    stake: { allocTao: 0, allocPct: 0, scenarios: [], notes: [] },
    hold: { allocTao: 0, allocPct: 0, scenarios: [], notes: [] },
    cash: { allocTao: 0, allocPct: 0, scenarios: [], notes: ["enter a stake amount to see a plan"] },
    reasons: ["no stake amount provided"],
  };
}
