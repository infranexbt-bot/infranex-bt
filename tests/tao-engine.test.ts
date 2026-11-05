import { describe, expect, test } from "bun:test";
import {
  computeTaoEngineOptions,
  summarizeTaoEngine,
  type TaoEngineValidatorOption,
} from "../src/lib/infranex/tao-engine";
import type { TaoEngineResearchPayload } from "../src/lib/infranex/tao-engine-types";
import baseline from "../src/lib/infranex/tao-engine-baseline.json";

// ---------------------------------------------------------------------------
// TAO ENGINE — unit tests (pure math over a synthetic research payload,
// plus structural assertions against the frozen chain baseline).
// Model chain-verified 2026-11-05: scripts/tao-engine-probe.ts,
// research: scripts/tao-engine-research.ts.
// ---------------------------------------------------------------------------

const ROOT_NET = 4.31;

function vRow(p: {
  uid: number; take: number; captureShare: number; stakeAlpha: number;
  captureAlphaPerDay?: number;
}) {
  return {
    uid: p.uid,
    hotkey: `5Hot${p.uid}`,
    stakeAlpha: p.stakeAlpha,
    captureShare: p.captureShare,
    captureAlphaPerDay: p.captureAlphaPerDay ?? 1000 * p.captureShare,
    take: p.take,
    apySustainablePct: 0,
    apyInstantPct: 0,
    apyLowPct: 0,
    apyHighPct: 0,
    taoPerDaySustainable: 0,
  };
}

function subRow(p: {
  netuid: number; name?: string | null; poolTao: number; poolAlpha: number;
  spot?: number; realizable?: number | null; laneAlphaPerDay?: number;
  dilution?: number | null; drift24h?: number | null; concentration?: number | null;
  validators: ReturnType<typeof vRow>[];
}) {
  const spot = p.spot ?? 0.05;
  const laneAlpha = p.laneAlphaPerDay ?? 1000;
  return {
    netuid: p.netuid,
    name: p.name === undefined ? `Subnet ${p.netuid}` : p.name,
    poolTao: p.poolTao,
    poolAlpha: p.poolAlpha,
    alphaSpotTao: spot,
    realizableTao: p.realizable === undefined ? spot * 0.98 : p.realizable,
    emissionTaoPerDay: 100,
    laneAlphaPerDay: laneAlpha,
    laneTaoPerDay: laneAlpha * (p.realizable === undefined ? spot * 0.98 : p.realizable),
    laneStakeTao: p.validators.reduce((a, v) => a + v.stakeAlpha, 0) * spot,
    dilutionRatio: p.dilution ?? 2,
    alphaChange24hPct: p.drift24h ?? 0,
    validatorsResearched: p.validators.length,
    validators: p.validators,
    bestApySustainablePct: 0,
    medianTake: 0.18,
    topValidatorConcentration: p.concentration ?? Math.max(...p.validators.map((v) => v.captureShare)),
    notes: [],
  };
}

function payload(subnets: ReturnType<typeof subRow>[]): TaoEngineResearchPayload {
  return {
    model: "tao-engine-research-v2",
    fetchedAt: "2026-11-05T16:08:31.145Z",
    block: 9440930,
    taoPriceUsd: 216,
    referenceStakeTao: 100,
    rootBaseline: {
      poolTao: 5_474_079,
      emissionTaoPerDay: 646,
      naiveChainApyPct: 4.31,
      marketGrossApyPct: 5.25,
      takePct: 18,
      netApyPct: ROOT_NET,
    },
    subnets: [],
    allResearched: subnets,
  } as TaoEngineResearchPayload;
}

// A "STRONG candidate" subnet: deep pool, low dilution, low-take validators,
// spread lane, calm price. Sustainable APY lands above root.
function strongSubnet(netuid = 51): ReturnType<typeof subRow> {
  return subRow({
    netuid,
    name: "lium.io",
    poolTao: 190_000,
    poolAlpha: 3_800_000,
    spot: 0.05,
    laneAlphaPerDay: 25_000,
    dilution: 2,
    drift24h: 0.4,
    validators: [
      vRow({ uid: 1, take: 0.09, captureShare: 0.4, stakeAlpha: 1_000_000 }),
      vRow({ uid: 2, take: 0.05, captureShare: 0.3, stakeAlpha: 900_000 }),
      vRow({ uid: 3, take: 0.0, captureShare: 0.2, stakeAlpha: 800_000 }),
      vRow({ uid: 4, take: 0.18, captureShare: 0.1, stakeAlpha: 700_000 }),
    ],
  });
}

// --- user-stake math ----------------------------------------------------------

describe("computeTaoEngineOptions — user stake math", () => {
  test("sustainable APY is invariant to stake size (lane-equilibrium yield)", () => {
    const pl = payload([strongSubnet()]);
    const a = computeTaoEngineOptions(pl, { stakeTao: 100 })[0];
    const b = computeTaoEngineOptions(pl, { stakeTao: 2500 })[0];
    expect(a.sustainableApyPct).toBe(b.sustainableApyPct);
    expect(b.taoPerDay).toBeCloseTo((a.taoPerDay * 2500) / 100, 2);
  });
  test("taoPerDay: capture·(1−take)/laneStake · S · realizable", () => {
    const pl = payload([strongSubnet()]);
    const sub = strongSubnet();
    const v1 = sub.validators[0];
    const laneStakeAlpha = sub.validators.reduce((a, v) => a + v.stakeAlpha, 0);
    const realizable = 0.05 * 0.98;
    const expected = ((v1.captureAlphaPerDay * (1 - 0.09)) / laneStakeAlpha) * 100 * realizable;
    const opt = computeTaoEngineOptions(pl, { stakeTao: 100 }).find((o) => o.validatorUid === 1)!;
    expect(opt.taoPerDay).toBeCloseTo(Math.round(expected * 1e4) / 1e4, 3);
  });
  test("instant APY beats sustainable for a lightly-staked validator and grows as stake shrinks", () => {
    const shallowValidator = subRow({
      netuid: 82,
      name: "Noah",
      poolTao: 2_500,
      poolAlpha: 65_000,
      validators: [
        vRow({ uid: 0, take: 0.18, captureShare: 0.69, stakeAlpha: 32_000 }),
        vRow({ uid: 1, take: 0.0, captureShare: 0.31, stakeAlpha: 10_500 }),
      ],
    });
    const opts = computeTaoEngineOptions(payload([shallowValidator]), { stakeTao: 100 });
    for (const o of opts) expect(o.instantApyPct).toBeGreaterThan(o.sustainableApyPct);
    const uid1 = opts.find((o) => o.validatorUid === 1)!;
    expect(uid1.takePct).toBe(0);
  });
  test("exit slippage scales with the user's stake", () => {
    const sub = strongSubnet();
    const pl = payload([sub]);
    const small = computeTaoEngineOptions(pl, { stakeTao: 100 })[0].exitSlippagePct;
    const big = computeTaoEngineOptions(pl, { stakeTao: 100_000 })[0].exitSlippagePct;
    expect(big).toBeGreaterThan(small);
    expect(small).toBeLessThan(1);
  });
  test("honest band brackets sustainable; falling α widens the floor", () => {
    const calm = computeTaoEngineOptions(payload([strongSubnet()]), { stakeTao: 100 })[0];
    expect(calm.apyLowPct).toBeLessThan(calm.sustainableApyPct);
    expect(calm.apyHighPct).toBeGreaterThan(calm.sustainableApyPct);
    const falling = computeTaoEngineOptions(
      payload([subRow({ ...strongSubnet(), drift24h: -30 })]),
      { stakeTao: 100 }
    )[0];
    expect(falling.apyLowPct).toBeLessThan(calm.apyLowPct);
    expect(falling.apyHighPct).toBeGreaterThan(calm.sustainableApyPct);
  });
});

// --- verdict gates ------------------------------------------------------------

describe("computeTaoEngineOptions — verdict gates", () => {
  test("deep + calm + low take + spread lane + low dilution → STRONG", () => {
    const [opt] = computeTaoEngineOptions(payload([strongSubnet()]), { stakeTao: 100 });
    expect(opt.verdict).toBe("STRONG");
    expect(opt.riskLevel).toBe("low");
    expect(opt.beatsRoot).toBe(true);
  });
  test("shallow pool → at best SPECULATIVE even with high APY", () => {
    const spec = subRow({
      netuid: 70, name: "Fugal", poolTao: 345, poolAlpha: 36_000, dilution: 455,
      validators: [vRow({ uid: 0, take: 0.18, captureShare: 0.58, stakeAlpha: 2_600 })],
    });
    const [opt] = computeTaoEngineOptions(payload([spec]), { stakeTao: 100 });
    expect(opt.sustainableApyPct).toBeGreaterThan(ROOT_NET);
    expect(opt.verdict).toBe("SPECULATIVE");
  });
  test("α collapsing ≤ −20%/24h → AVOID regardless of yield", () => {
    const crash = subRow({
      netuid: 4, poolTao: 150_000, drift24h: -25,
      validators: [vRow({ uid: 0, take: 0.05, captureShare: 0.5, stakeAlpha: 900_000 })],
    });
    const [opt] = computeTaoEngineOptions(payload([crash]), { stakeTao: 100 });
    expect(opt.verdict).toBe("AVOID");
  });
  test("below root baseline → AVOID", () => {
    const weak = subRow({
      netuid: 8, poolTao: 200_000,
      validators: [vRow({ uid: 0, take: 0.18, captureShare: 0.5, stakeAlpha: 5_000_000, captureAlphaPerDay: 100 })],
    });
    const [opt] = computeTaoEngineOptions(payload([weak]), { stakeTao: 100 });
    expect(opt.beatsRoot).toBe(false);
    expect(opt.verdict).toBe("AVOID");
  });
  test("18% take blocks STRONG even on a deep calm pool", () => {
    const highTake = subRow({
      netuid: 9, poolTao: 190_000, poolAlpha: 3_800_000, laneAlphaPerDay: 25_000,
      validators: [vRow({ uid: 0, take: 0.18, captureShare: 0.4, stakeAlpha: 1_000_000 })],
    });
    const [opt] = computeTaoEngineOptions(payload([highTake]), { stakeTao: 100 });
    expect(opt.verdict).not.toBe("STRONG");
  });
});

// --- ordering, filtering, summary ----------------------------------------------

describe("computeTaoEngineOptions — ordering and filters", () => {
  const pl = payload([
    subRow({
      netuid: 70, name: "Fugal", poolTao: 345, poolAlpha: 36_000, dilution: 455,
      validators: [vRow({ uid: 0, take: 0.18, captureShare: 0.58, stakeAlpha: 2_600 })],
    }),
    strongSubnet(51),
    subRow({
      netuid: 8, poolTao: 200_000,
      validators: [vRow({ uid: 0, take: 0.18, captureShare: 0.5, stakeAlpha: 5_000_000, captureAlphaPerDay: 50 })],
    }),
  ]);

  test("tier order: STRONG/VIABLE before SPECULATIVE before AVOID", () => {
    const opts = computeTaoEngineOptions(pl, { stakeTao: 100, maxOptions: 50 });
    const tiers = opts.map((o) => o.verdict);
    const firstAvoid = tiers.indexOf("AVOID");
    const lastSpec = tiers.lastIndexOf("SPECULATIVE");
    const firstViableOrStrong = tiers.findIndex((t) => t === "STRONG" || t === "VIABLE");
    expect(firstViableOrStrong).toBeLessThan(lastSpec);
    expect(lastSpec).toBeLessThan(firstAvoid);
  });
  test("maxOptions caps the output", () => {
    expect(computeTaoEngineOptions(pl, { stakeTao: 100, maxOptions: 2 })).toHaveLength(2);
  });
  test("riskTolerance=safe drops SPECULATIVE and AVOID", () => {
    const safe = computeTaoEngineOptions(pl, { stakeTao: 100, riskTolerance: "safe" });
    expect(safe.length).toBeGreaterThan(0);
    expect(safe.every((o) => o.verdict === "STRONG" || o.verdict === "VIABLE")).toBe(true);
  });
  test("zero stake is clamped to ≥0 and produces zero economics, not NaN", () => {
    const opts = computeTaoEngineOptions(payload([strongSubnet()]), { stakeTao: 0 });
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) {
      expect(Number.isFinite(o.taoPerDay)).toBe(true);
      expect(Number.isFinite(o.sustainableApyPct)).toBe(true);
    }
  });
  test("summarizeTaoEngine: tier counts, root monthly, top option", () => {
    const s = summarizeTaoEngine(pl, 500);
    expect(s.rootBaselineApyPct).toBe(ROOT_NET);
    expect(s.rootMonthlyTao).toBeCloseTo((500 * 0.0431) / 12, 2);
    expect(s.strong + s.viable + s.speculative + s.avoid).toBeGreaterThan(0);
    expect(s.topOption).not.toBeNull();
    expect(s.researchedSubnets).toBe(3);
    expect(s.baselineFetchedAt).toBe("2026-11-05T16:08:31.145Z");
  });
});

// --- frozen chain baseline (structural, refresh-tolerant) ----------------------

describe("tao-engine-baseline.json (frozen live research)", () => {
  const pl = baseline as unknown as TaoEngineResearchPayload;

  test("schema shape and sane root baseline", () => {
    expect(pl.model).toBe("tao-engine-research-v2");
    expect(pl.rootBaseline.netApyPct).toBeGreaterThan(3);
    expect(pl.rootBaseline.netApyPct).toBeLessThan(8);
    expect((pl.allResearched ?? []).length).toBeGreaterThanOrEqual(30);
  });
  test("every researched subnet carries validator rows with the model fields", () => {
    for (const sub of pl.allResearched as never as Array<{ validators: unknown[]; laneAlphaPerDay: number; poolTao: number }>) {
      expect(Array.isArray(sub.validators)).toBe(true);
      expect(sub.poolTao).toBeGreaterThan(0);
    }
  });
  test("live snapshot of the engine over the real baseline runs clean", () => {
    const opts = computeTaoEngineOptions(pl, { stakeTao: 100, maxOptions: 1000 });
    expect(opts.length).toBeGreaterThan(20);
    for (const o of opts) {
      expect(Number.isFinite(o.sustainableApyPct)).toBe(true);
      expect(o.apyLowPct <= o.sustainableApyPct).toBe(true);
    }
    const nonAvoid = opts.filter((o: TaoEngineValidatorOption) => o.verdict !== "AVOID");
    expect(nonAvoid.length).toBeGreaterThan(0);
  });
});
