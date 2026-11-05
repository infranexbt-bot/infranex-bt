import { describe, expect, test } from "bun:test";
import {
  TAO_ENGINE,
  computeSubnetStakeOpportunity,
  entryAlphaForStake,
  normalizeTake,
  rankSubnetOpportunities,
  rootBaselineRow,
  rootNetApyPct,
  screenSubnetsForLane,
  validatorLaneAlphaPerDay,
  type SubnetStakeInputs,
  type ValidatorStakeInput,
} from "../src/lib/infranex/tao-engine";
import baseline from "../src/lib/infranex/tao-engine-baseline.json";

// ---------------------------------------------------------------------------
// TAO ENGINE — unit tests (pure math, no network).
// Model chain-verified 2026-11-05: scripts/tao-engine-probe.ts,
// research: scripts/tao-engine-research.ts.
// ---------------------------------------------------------------------------

function val(partial: Partial<ValidatorStakeInput> & { uid: number }): ValidatorStakeInput {
  return {
    hotkey: `5Hot${partial.uid}`,
    stakeAlpha: 10_000,
    captureShare: 0.1,
    take: 0.18,
    ...partial,
  };
}

/** Healthy subnet: 190k TAO pool, 3.8M α, lane 25k α/day, 4 spread validators. */
function healthyInputs(over: Partial<SubnetStakeInputs> = {}): SubnetStakeInputs {
  return {
    netuid: 51,
    name: "lium.io",
    poolTao: 190_000,
    poolAlpha: 3_800_000,
    alphaSpotTao: 0.05,
    realizableTao: 0.049,
    laneAlphaPerDay: 25_000,
    validators: [
      val({ uid: 1, captureShare: 0.4, take: 0.09, stakeAlpha: 1_000_000 }),
      val({ uid: 2, captureShare: 0.3, take: 0.05, stakeAlpha: 900_000 }),
      val({ uid: 3, captureShare: 0.2, take: 0.0, stakeAlpha: 800_000 }),
      val({ uid: 4, captureShare: 0.1, take: 0.18, stakeAlpha: 700_000 }),
    ],
    dilutionRatio: 2,
    alphaChange24hPct: 0.4,
    emissionEnabled: true,
    ...over,
  };
}

// --- take normalization ------------------------------------------------------

describe("normalizeTake", () => {
  test("chain-verified scale: 11796 raw → 18%", () => {
    expect(normalizeTake(11796)).toBeCloseTo(0.18, 4);
  });
  test("5898 → 9%, 655 → 1%, 0 → 0%", () => {
    expect(normalizeTake(5898)).toBeCloseTo(0.09, 4);
    expect(normalizeTake(655)).toBeCloseTo(0.01, 4);
    expect(normalizeTake(0)).toBe(0);
  });
  test("out-of-range raw falls back to the chain default 18%", () => {
    expect(normalizeTake(60000)).toBe(TAO_ENGINE.DEFAULT_TAKE);
    expect(normalizeTake(-5)).toBe(TAO_ENGINE.DEFAULT_TAKE);
    expect(normalizeTake(NaN)).toBe(TAO_ENGINE.DEFAULT_TAKE);
  });
});

// --- entry alpha (balancer shape) -------------------------------------------

describe("entryAlphaForStake", () => {
  test("tiny stake ≈ spot rate; own impact negligible", () => {
    const alphaPerTao = entryAlphaForStake(3_800_000, 190_000, 100) / 100;
    // spot 0.05 TAO/α = 20 α/TAO; own impact moves it by ~0.05%
    expect(alphaPerTao).toBeGreaterThan(19.98);
    expect(alphaPerTao).toBeLessThan(20.0);
  });
  test("large stake self-dilutes (own impact priced in)", () => {
    const small = entryAlphaForStake(3_800_000, 190_000, 100) / 100;
    const big = entryAlphaForStake(3_800_000, 190_000, 95_000) / 95_000;
    expect(big).toBeLessThan(small);
  });
  test("zero/negative inputs → 0", () => {
    expect(entryAlphaForStake(0, 100, 100)).toBe(0);
    expect(entryAlphaForStake(100, 0, 100)).toBe(0);
    expect(entryAlphaForStake(100, 100, -1)).toBe(0);
  });
});

// --- root baseline ------------------------------------------------------------

describe("root baseline", () => {
  test("5.25% gross net of 18% take = 4.31%", () => {
    expect(rootNetApyPct()).toBe(4.31);
  });
  test("baseline row: monthly TAO from the net figure", () => {
    const row = rootBaselineRow(1200);
    expect(row.netApyPct).toBe(4.31);
    expect(row.taoPerMonth).toBeCloseTo((1200 * 0.0431) / 12, 2);
  });
});

// --- subnet opportunity -------------------------------------------------------

describe("computeSubnetStakeOpportunity", () => {
  test("sustainable APY: capture·(1−take)/laneStake · S · realizable · 365", () => {
    const rec = computeSubnetStakeOpportunity(healthyInputs())!;
    // uid1: capture 10000 α/d, take 9% → net 9100 α/d; lane stake 3.4M α
    const expected = ((10_000 * 0.91) / 3_400_000) * 100 * 0.049 * 365;
    expect(rec.bestValidator.apySustainablePct).toBeCloseTo(Math.round(expected * 100) / 100, 2);
  });
  test("low-take validators win the sustainable ranking on equal capture", () => {
    const rec = computeSubnetStakeOpportunity(healthyInputs())!;
    const u1 = rec.validators.find((v) => v.uid === 1)!; // 40% share, 9% take
    const u4 = rec.validators.find((v) => v.uid === 4)!; // 10% share, 18% take
    expect(u1.apySustainablePct).toBeGreaterThan(u4.apySustainablePct);
    expect(rec.bestValidator.uid).toBe(1);
  });
  test("0% take beats 18% take at identical capture", () => {
    const rec = computeSubnetStakeOpportunity(healthyInputs({
      validators: [
        val({ uid: 1, captureShare: 0.5, take: 0.0, stakeAlpha: 1_000_000 }),
        val({ uid: 2, captureShare: 0.5, take: 0.18, stakeAlpha: 1_000_000 }),
      ],
    }))!;
    const zero = rec.validators.find((v) => v.uid === 1)!;
    const full = rec.validators.find((v) => v.uid === 2)!;
    expect(zero.apySustainablePct).toBeCloseTo(full.apySustainablePct / 0.82, 1);
  });
  test("sustainable APY is stake-invariant; taoPerDay scales linearly", () => {
    const a = computeSubnetStakeOpportunity(healthyInputs(), { stakeTao: 100 })!;
    const b = computeSubnetStakeOpportunity(healthyInputs(), { stakeTao: 2500 })!;
    expect(b.bestValidator.apySustainablePct).toBe(a.bestValidator.apySustainablePct);
    expect(b.bestValidator.taoPerDay).toBeCloseTo(a.bestValidator.taoPerDay * 25, 2);
  });
  test("instant APY: transient upside; heavier stake → lower instant at equal capture", () => {
    const rec = computeSubnetStakeOpportunity(healthyInputs({
      validators: [
        val({ uid: 1, captureShare: 0.3, take: 0.09, stakeAlpha: 3_000_000 }),
        val({ uid: 2, captureShare: 0.3, take: 0.09, stakeAlpha: 1_000 }),
      ],
    }))!;
    const heavy = rec.validators.find((v) => v.uid === 1)!;
    const light = rec.validators.find((v) => v.uid === 2)!;
    expect(light.apyInstantPct).toBeGreaterThan(heavy.apyInstantPct * 100);
    expect(heavy.apyInstantPct).toBeGreaterThan(0);
  });
  test("exit slippage scales with stake and is flagged over 3%", () => {
    const small = computeSubnetStakeOpportunity(healthyInputs(), { stakeTao: 100 })!;
    const big = computeSubnetStakeOpportunity(healthyInputs(), { stakeTao: 50_000 })!;
    expect(small.exitSlippagePct).toBeLessThan(1);
    expect(big.exitSlippagePct).toBeGreaterThan(small.exitSlippagePct!);
    expect(big.notes.join(" ")).toMatch(/exit slippage/);
  });
  test("honest band brackets sustainable; falling α deepens the floor", () => {
    const calm = computeSubnetStakeOpportunity(healthyInputs())!;
    const uid = calm.bestValidator;
    expect(uid.apyLowPct).toBeLessThanOrEqual(uid.apySustainablePct);
    expect(uid.apyHighPct).toBeGreaterThanOrEqual(uid.apySustainablePct);
    const falling = computeSubnetStakeOpportunity(healthyInputs({ alphaChange24hPct: -20 }))!;
    expect(falling.bestValidator.apyLowPct).toBeLessThan(uid.apyLowPct);
    expect(falling.bestValidator.apyHighPct).toBeGreaterThan(uid.apySustainablePct);
  });
  test("drift clamp: −90% crash clamps to −60%", () => {
    const rec = computeSubnetStakeOpportunity(healthyInputs({ alphaChange24hPct: -90 }))!;
    const uid = rec.bestValidator;
    expect(uid.apyLowPct).toBeCloseTo(Math.round(uid.apySustainablePct * 0.15 * 100) / 100, 2);
  });
  test("beatsRoot: on above 4.31% with adequate pool; off below", () => {
    expect(computeSubnetStakeOpportunity(healthyInputs())!.beatsRoot).toBe(true);
    const weak = computeSubnetStakeOpportunity(healthyInputs({ laneAlphaPerDay: 1000 }))!;
    expect(weak.beatsRoot).toBe(false);
  });
  test("thin pool (<1k TAO) can never beat root — honesty gate", () => {
    const rec = computeSubnetStakeOpportunity(healthyInputs({ poolTao: 500 }))!;
    expect(rec.beatsRoot).toBe(false);
    expect(rec.notes.join(" ")).toMatch(/below minimum depth/);
  });
  test("dust validators (stake < 1000 α) are ignored", () => {
    const rec = computeSubnetStakeOpportunity(healthyInputs({
      validators: [val({ uid: 9, stakeAlpha: 500 }), ...healthyInputs().validators],
    }))!;
    expect(rec.validators.find((v) => v.uid === 9)).toBeUndefined();
  });
  test("returns null on dead inputs — never a fabricated row", () => {
    expect(computeSubnetStakeOpportunity(healthyInputs({ laneAlphaPerDay: 0 }))).toBeNull();
    expect(computeSubnetStakeOpportunity(healthyInputs({ poolTao: 0 }))).toBeNull();
    expect(computeSubnetStakeOpportunity(healthyInputs({ alphaSpotTao: 0 }))).toBeNull();
    expect(computeSubnetStakeOpportunity(healthyInputs({ emissionEnabled: false }))).toBeNull();
    expect(computeSubnetStakeOpportunity(healthyInputs({ validators: [] }))).toBeNull();
    expect(computeSubnetStakeOpportunity(healthyInputs({ validators: [val({ uid: 1, stakeAlpha: 10 })] }))).toBeNull();
  });
  test("risk: deep + calm + spread lane → medium; shallow or whale lane → high", () => {
    const deep = computeSubnetStakeOpportunity(healthyInputs({ alphaChange24hPct: 1 }))!;
    expect(deep.riskLevel).toBe("medium");
    const whale = computeSubnetStakeOpportunity(healthyInputs({
      alphaChange24hPct: 1,
      validators: [val({ uid: 1, captureShare: 0.95, stakeAlpha: 3_000_000 })],
    }))!;
    expect(whale.riskLevel).toBe("high");
    expect(whale.notes.join(" ")).toMatch(/captures 95%/);
  });
  test("dilution note fires above 3×; concentration reported", () => {
    const rec = computeSubnetStakeOpportunity(healthyInputs({ dilutionRatio: 6.2 }))!;
    expect(rec.notes.join(" ")).toMatch(/dilution 6\.2×/);
    expect(rec.topValidatorConcentration).toBeCloseTo(0.4, 6);
  });
});

// --- ranking ------------------------------------------------------------------

describe("rankSubnetOpportunities", () => {
  const mk = (netuid: number, apy: number, beatsRoot: boolean) => ({
    netuid,
    name: `S${netuid}`,
    bestApySustainablePct: apy,
    beatsRoot,
  });
  test("root-beaters first by sustainable APY; below-root kept separately", () => {
    const { beatingRoot, belowRoot } = rankSubnetOpportunities([
      mk(1, 9, true), mk(2, 50, true), mk(3, 3, false), mk(4, 4.5, false),
    ]);
    expect(beatingRoot.map((s) => s.netuid)).toEqual([2, 1]);
    expect(belowRoot.map((s) => s.netuid)).toEqual([4, 3]);
  });
  test("limit applies across both buckets", () => {
    const { beatingRoot, belowRoot } = rankSubnetOpportunities(
      [mk(1, 9, true), mk(2, 50, true), mk(3, 3, false)],
      { limit: 2 }
    );
    expect(beatingRoot).toHaveLength(2);
    expect(belowRoot).toHaveLength(0);
  });
});

// --- snapshot screen (pure, no RPC) -------------------------------------------

describe("screenSubnetsForLane + validatorLaneAlphaPerDay", () => {
  const snap = {
    subnets: [
      { netuid: 0, emissionTaoPerDay: 646, movingPrice: 1, subnetTao: 5_474_079 }, // root — skipped
      { netuid: 51, name: "lium.io", emissionTaoPerDay: 100, minerEmissionTaoPerDay: 50, movingPrice: 0.05, subnetTao: 190_000, realizablePriceTao: 0.048, alphaPriceChange24h: 0.7, dilutionRatio: 6.1 },
      { netuid: 82, name: "Noah", emissionTaoPerDay: 200, minerEmissionTaoPerDay: 100, movingPrice: 0.04, subnetTao: 2_400, alphaPriceChange24h: -0.1, dilutionRatio: null },
      { netuid: 99, name: null, emissionTaoPerDay: 0, minerEmissionTaoPerDay: 0, movingPrice: 0.01, subnetTao: 100 }, // dead — skipped
    ],
  };

  test("lane α/day = lane TAO/day ÷ spot", () => {
    const sub = (snap.subnets as never[])[1] as never as Parameters<typeof validatorLaneAlphaPerDay>[0];
    expect(validatorLaneAlphaPerDay(sub)).toBeCloseTo(1000, 4);
  });
  test("root and dead subnets excluded; sorted by lane TAO/day", () => {
    const rows = screenSubnetsForLane(snap as never);
    expect(rows.map((r) => r.netuid)).toEqual([82, 51]);
    // Noah: (200−100) TAO/day at realizable fallback 0.04 → 4 TAO/day
    expect(rows[0].laneTaoPerDay).toBeCloseTo(4, 4);
    // lium.io: 50 × 0.048 = 2.4 TAO/day
    expect(rows[1].laneTaoPerDay).toBeCloseTo(2.4, 4);
    expect(rows.every((r) => r.needsDeepDive)).toBe(true);
  });
});

// --- frozen chain baseline (structural, refresh-tolerant) ----------------------

describe("tao-engine-baseline.json (frozen live research)", () => {
  test("schema: sane root baseline and ≥30 researched subnets", () => {
    expect(baseline.model).toBe("tao-engine-research-v2");
    expect(baseline.rootBaseline.netApyPct).toBeGreaterThan(3);
    expect(baseline.rootBaseline.netApyPct).toBeLessThan(8);
    expect((baseline.allResearched as unknown[]).length).toBeGreaterThanOrEqual(30);
  });
  test("live subnets flow through the engine cleanly (no NaN, root gate active)", () => {
    let checked = 0;
    for (const raw of baseline.allResearched as Array<Record<string, unknown>>) {
      const vals = raw.validators as Array<Record<string, unknown>>;
      if (!Array.isArray(vals) || vals.length === 0) continue;
      const inputs: SubnetStakeInputs = {
        netuid: raw.netuid as number,
        name: (raw.name as string) ?? null,
        poolTao: raw.poolTao as number,
        poolAlpha: raw.poolAlpha as number,
        alphaSpotTao: raw.alphaSpotTao as number,
        realizableTao: (raw.realizableTao as number) ?? (raw.alphaSpotTao as number),
        laneAlphaPerDay: raw.laneAlphaPerDay as number,
        validators: vals.map((v) => ({
          uid: v.uid as number,
          hotkey: v.hotkey as string,
          stakeAlpha: v.stakeAlpha as number,
          captureShare: v.captureShare as number,
          take: v.take as number,
        })),
        dilutionRatio: (raw.dilutionRatio as number) ?? null,
        alphaChange24hPct: (raw.alphaChange24hPct as number) ?? null,
        emissionEnabled: true,
      };
      const rec = computeSubnetStakeOpportunity(inputs);
      if (rec == null) continue;
      checked++;
      expect(Number.isFinite(rec.bestApySustainablePct)).toBe(true);
      expect(rec.bestValidator.apyLowPct).toBeLessThanOrEqual(rec.bestValidator.apySustainablePct);
    }
    expect(checked).toBeGreaterThanOrEqual(30);
  });
});
