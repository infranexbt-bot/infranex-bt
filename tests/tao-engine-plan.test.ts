// Tests for the three-route strategy planner (tao-engine-plan.ts).
import { describe, expect, test } from "bun:test";
import { computeThreeRoutePlan } from "../src/lib/infranex/tao-engine-plan";
import type { PlanMarketContext, PlanStakingContext } from "../src/lib/infranex/tao-engine-plan";

const VIABLE_STAKING: PlanStakingContext = {
  bestNetApyPct: 10.0,
  apyLowPct: 7.5,
  apyHighPct: 12.5,
  rootNetApyPct: 4.3,
  viableCount: 2,
};

const NO_VIABLE: PlanStakingContext = {
  bestNetApyPct: null,
  apyLowPct: null,
  apyHighPct: null,
  rootNetApyPct: 4.3,
  viableCount: 0,
};

const BUY_MARKET: PlanMarketContext = {
  action: "BUY",
  confidence: "medium",
  score: 40,
  spotUsd: 216,
  d30Pct: 8,
  volAnnualizedPct: 70,
  fromHigh180Pct: -10,
};

const SELL_MARKET: PlanMarketContext = {
  action: "SELL",
  confidence: "high",
  score: -50,
  spotUsd: 216,
  d30Pct: -20,
  volAnnualizedPct: 120,
  fromHigh180Pct: -55,
};

describe("three-route planner: allocation rules", () => {
  test("BUY balanced splits 60/30/10 and sums to the stake", () => {
    const p = computeThreeRoutePlan({
      stakeTao: 100,
      risk: "balanced",
      horizonDays: 90,
      market: BUY_MARKET,
      staking: VIABLE_STAKING,
    });
    expect(p.allocation.stakeTao + p.allocation.holdTao + p.allocation.cashTao).toBe(100);
    expect(p.allocation.stakePct).toBeCloseTo(60, 5);
    expect(p.allocation.holdPct).toBeCloseTo(30, 5);
    expect(p.allocation.cashPct).toBeCloseTo(10, 5);
    expect(p.stakeTarget).toBe("subnet");
  });

  test("SELL market → zero stake, cash-heavy (90/10 base)", () => {
    const p = computeThreeRoutePlan({
      stakeTao: 100,
      risk: "balanced",
      horizonDays: 90,
      market: SELL_MARKET,
      staking: VIABLE_STAKING,
    });
    expect(p.allocation.stakeTao).toBe(0);
    expect(p.allocation.cashPct).toBeCloseTo(90, 5);
    expect(p.allocation.holdPct).toBeCloseTo(10, 5);
  });

  test("safe risk shifts allocation into cash", () => {
    const balanced = computeThreeRoutePlan({
      stakeTao: 100,
      risk: "balanced",
      horizonDays: 90,
      market: BUY_MARKET,
      staking: VIABLE_STAKING,
    });
    const safe = computeThreeRoutePlan({
      stakeTao: 100,
      risk: "safe",
      horizonDays: 90,
      market: BUY_MARKET,
      staking: VIABLE_STAKING,
    });
    expect(safe.allocation.cashTao).toBeGreaterThan(balanced.allocation.cashTao);
    expect(safe.allocation.stakeTao).toBeLessThan(balanced.allocation.stakeTao);
  });

  test("aggressive risk shifts into stake only when VIABLE staking exists", () => {
    const aggressiveViable = computeThreeRoutePlan({
      stakeTao: 100,
      risk: "aggressive",
      horizonDays: 90,
      market: BUY_MARKET,
      staking: VIABLE_STAKING,
    });
    const balanced = computeThreeRoutePlan({
      stakeTao: 100,
      risk: "balanced",
      horizonDays: 90,
      market: BUY_MARKET,
      staking: VIABLE_STAKING,
    });
    expect(aggressiveViable.allocation.stakeTao).toBeGreaterThan(balanced.allocation.stakeTao);

    // No viable staking: aggressive shifts to HOLD instead, stakeTarget=root.
    const aggressiveNoViable = computeThreeRoutePlan({
      stakeTao: 100,
      risk: "aggressive",
      horizonDays: 90,
      market: BUY_MARKET,
      staking: NO_VIABLE,
    });
    expect(aggressiveNoViable.stakeTarget).toBe("root");
    expect(aggressiveNoViable.allocation.holdTao).toBeGreaterThan(
      computeThreeRoutePlan({
        stakeTao: 100,
        risk: "balanced",
        horizonDays: 90,
        market: BUY_MARKET,
        staking: NO_VIABLE,
      }).allocation.holdTao
    );
  });

  test("low confidence shaves stake into cash", () => {
    const med = computeThreeRoutePlan({
      stakeTao: 100,
      risk: "balanced",
      horizonDays: 90,
      market: { ...BUY_MARKET, confidence: "medium" },
      staking: VIABLE_STAKING,
    });
    const low = computeThreeRoutePlan({
      stakeTao: 100,
      risk: "balanced",
      horizonDays: 90,
      market: { ...BUY_MARKET, confidence: "low" },
      staking: VIABLE_STAKING,
    });
    expect(low.allocation.stakeTao).toBeLessThan(med.allocation.stakeTao);
    expect(low.allocation.cashTao).toBeGreaterThan(med.allocation.cashTao);
  });

  test("allocation always sums to the full stake (odd amounts)", () => {
    for (const s of [1, 7, 33, 123.45, 9999]) {
      const p = computeThreeRoutePlan({
        stakeTao: s,
        risk: "balanced",
        horizonDays: 90,
        market: BUY_MARKET,
        staking: VIABLE_STAKING,
      });
      const total =
        p.allocation.stakeTao + p.allocation.holdTao + p.allocation.cashTao;
      // Residue lands in the hold bucket, so the split always sums exactly.
      expect(Math.abs(total - s)).toBeLessThan(1e-9);
      // Stake and cash buckets are whole-TAO; hold absorbs the fraction.
      expect(Number.isInteger(p.allocation.stakeTao)).toBe(true);
      expect(Number.isInteger(p.allocation.cashTao)).toBe(true);
    }
  });
});

describe("three-route planner: scenario math", () => {
  test("HOLD scenarios preserve TAO count; STAKE grows it by the yield band", () => {
    const p = computeThreeRoutePlan({
      stakeTao: 100,
      risk: "balanced",
      horizonDays: 365,
      market: BUY_MARKET,
      staking: VIABLE_STAKING,
    });
    // HOLD mid scenario (0% price move): TAO count unchanged.
    const holdMid = p.hold.scenarios.find((s) => s.priceChgPct === 0);
    expect(holdMid).toBeDefined();
    expect(holdMid!.endTao).toBeCloseTo(p.hold.allocTao, 6);
    // STAKE mid scenario: grows at the mid yield over the horizon.
    const stakeMid = p.stake.scenarios.find((s) => s.priceChgPct === 0);
    expect(stakeMid).toBeDefined();
    expect(stakeMid!.endTao).toBeCloseTo(
      p.stake.allocTao * (1 + (VIABLE_STAKING.bestNetApyPct! / 100) * (365 / 365)),
      6
    );
  });

  test("scenario grid is vol-scaled over the horizon (σ·√t)", () => {
    const p90 = computeThreeRoutePlan({
      stakeTao: 100,
      risk: "balanced",
      horizonDays: 90,
      market: BUY_MARKET,
      staking: VIABLE_STAKING,
    });
    const p365 = computeThreeRoutePlan({
      stakeTao: 100,
      risk: "balanced",
      horizonDays: 365,
      market: BUY_MARKET,
      staking: VIABLE_STAKING,
    });
    const span90 =
      p90.hold.scenarios[p90.hold.scenarios.length - 1].priceChgPct -
      p90.hold.scenarios[0].priceChgPct;
    const span365 =
      p365.hold.scenarios[p365.hold.scenarios.length - 1].priceChgPct -
      p365.hold.scenarios[0].priceChgPct;
    // √(365/90) ≈ 2.01 — the 1y grid must be wider than the 90d grid.
    expect(span365).toBeGreaterThan(span90 * 1.8);
  });

  test("cash scenarios show re-buy power: cheaper price → more TAO", () => {
    const p = computeThreeRoutePlan({
      stakeTao: 100,
      risk: "balanced",
      horizonDays: 90,
      market: BUY_MARKET,
      staking: VIABLE_STAKING,
    });
    const down = p.cash.scenarios.find((s) => s.priceChgPct < 0)!;
    const up = p.cash.scenarios.find((s) => s.priceChgPct > 0)!;
    expect(down.endTao).toBeGreaterThan(p.cash.allocTao);
    expect(up.endTao).toBeLessThan(p.cash.allocTao);
    // USD stays flat for cash.
    for (const s of p.cash.scenarios) {
      expect(s.endUsd).toBeCloseTo(p.cash.allocTao * BUY_MARKET.spotUsd!, 4);
    }
  });

  test("no spot price → USD columns null, TAO math intact", () => {
    const p = computeThreeRoutePlan({
      stakeTao: 100,
      risk: "balanced",
      horizonDays: 90,
      market: { ...BUY_MARKET, spotUsd: null },
      staking: VIABLE_STAKING,
    });
    for (const s of [...p.stake.scenarios, ...p.hold.scenarios]) {
      expect(s.endUsd).toBeNull();
    }
  });
});

describe("three-route planner: honesty gates", () => {
  test("missing market signal → conservative fallback with explicit reason", () => {
    const p = computeThreeRoutePlan({
      stakeTao: 100,
      risk: "balanced",
      horizonDays: 90,
      market: null,
      staking: VIABLE_STAKING,
    });
    expect(p.reasons.some((r) => r.includes("market signal unavailable"))).toBe(true);
    // Base mix for HOLD fallback + balanced = 40/40/20 (clamped by low confidence → 30/40/30)
    expect(p.allocation.stakePct + p.allocation.holdPct + p.allocation.cashPct).toBeCloseTo(100, 5);
  });

  test("zero stake → trivial empty plan", () => {
    const p = computeThreeRoutePlan({
      stakeTao: 0,
      risk: "balanced",
      horizonDays: 90,
      market: BUY_MARKET,
      staking: VIABLE_STAKING,
    });
    expect(p.allocation.stakeTao).toBe(0);
    expect(p.reasons.some((r) => r.includes("no stake amount"))).toBe(true);
  });

  test("every plan emits at least one auditable reason", () => {
    for (const m of [BUY_MARKET, SELL_MARKET, null]) {
      const p = computeThreeRoutePlan({
        stakeTao: 100,
        risk: "safe",
        horizonDays: 30,
        market: m,
        staking: NO_VIABLE,
      });
      expect(p.reasons.length).toBeGreaterThan(0);
    }
  });
});
