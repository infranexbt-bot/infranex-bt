import { describe, expect, test } from "bun:test";
import { scoreAllValidators, validatorStakeScore } from "../src/lib/infranex/validator-score";
import type { SubnetStakeOpportunity } from "../src/lib/infranex/tao-engine";
import baseline from "../src/lib/infranex/tao-engine-baseline.json";

// ---------------------------------------------------------------------------
// VALIDATOR-STAKE-SCORE — unit tests. The scoring lens over the TAO engine
// outputs; opportunity-score pattern (documented components, missing-data
// neutral, AVOID honesty cap). Pure math — no network.
// ---------------------------------------------------------------------------

function baseInput(over: Partial<Parameters<typeof validatorStakeScore>[0]> = {}) {
  return {
    sustainableApyPct: 12,
    rootBaselineApyPct: 4.31,
    realizableTao: 0.95,
    alphaSpotTao: 1,
    poolTao: 150_000,
    exitSlippagePct: 0.4,
    takePct: 10,
    concentrationPct: 40,
    alphaChange24hPct: 1,
    dilutionRatio: 2,
    verdict: "VIABLE" as const,
    ...over,
  };
}

describe("validatorStakeScore", () => {
  test("strong inputs score high and grade A", () => {
    const r = validatorStakeScore(baseInput({ sustainableApyPct: 40, takePct: 0 }));
    expect(r.score).toBeGreaterThan(75);
    expect(r.grade).toBe("A");
    expect(r.cappedByVerdict).toBe(false);
  });

  test("no edge over root → yieldEdge component is 0, verdict AVOID caps score", () => {
    // Realistic pairing: classifyVerdict returns AVOID whenever !beatsRoot,
    // so a sub-root pick arrives with verdict AVOID (capped at 25).
    const r = validatorStakeScore(baseInput({ sustainableApyPct: 3, verdict: "AVOID" }));
    const edge = r.parts.find((p) => p.key === "yieldEdge")!;
    expect(edge.points).toBe(0);
    expect(r.score).toBeLessThanOrEqual(25);
    expect(r.cappedByVerdict).toBe(true);
  });

  test("missing data components sit at the 35 neutral and are flagged", () => {
    const r = validatorStakeScore(
      baseInput({ concentrationPct: null, alphaChange24hPct: null, dilutionRatio: null })
    );
    expect(r.parts.find((p) => p.key === "decentralization")!.points).toBe(35);
    expect(r.parts.find((p) => p.key === "priceStability")!.points).toBe(35);
    expect(r.parts.find((p) => p.key === "dilutionDiscipline")!.points).toBe(35);
    expect(r.flags.length).toBe(3);
  });

  test("AVOID verdict caps the score at 25", () => {
    const r = validatorStakeScore(baseInput({ verdict: "AVOID" }));
    expect(r.score).toBeLessThanOrEqual(25);
    expect(r.cappedByVerdict).toBe(true);
  });

  test("lower take scores higher than higher take, all else equal", () => {
    const low = validatorStakeScore(baseInput({ takePct: 0 }));
    const high = validatorStakeScore(baseInput({ takePct: 30 }));
    expect(low.score).toBeGreaterThan(high.score);
  });

  test("thin pool + big slippage scores worse than deep pool", () => {
    const deep = validatorStakeScore(baseInput({ poolTao: 500_000, exitSlippagePct: 0.2 }));
    const thin = validatorStakeScore(baseInput({ poolTao: 900, exitSlippagePct: 8 }));
    expect(deep.score).toBeGreaterThan(thin.score);
  });

  test("parts always carry their weights' full contribution (sum check)", () => {
    const r = validatorStakeScore(baseInput());
    const weightSum = r.parts.reduce((s, p) => s + p.weightPct, 0);
    expect(weightSum).toBe(100);
  });
});

describe("scoreAllValidators over the research baseline", () => {
  test("produces scored rows ordered by verdict tier then score", () => {
    const payload = baseline as unknown as {
      allResearched?: unknown[];
      subnets?: unknown[];
    };
    // Minimal opportunity objects straight from the baseline payload shape —
    // reuse the route's own mapping logic shape (spot, pool, lane, validators).
    const subs = (payload.allResearched ?? payload.subnets ?? []) as Array<{
      netuid: number;
      name: string | null;
      poolTao: number;
      poolAlpha: number;
      alphaSpotTao: number;
      realizableTao: number | null;
      laneAlphaPerDay: number;
      laneStakeTao: number;
      validators: Array<{
        uid: number;
        hotkey: string;
        stakeAlpha: number;
        captureShare: number;
        take: number;
      }>;
      dilutionRatio: number | null;
      alphaChange24hPct: number | null;
    }>;
    // Feed ONE handcrafted opportunity instead of re-importing the engine
    // (keeps this test about the scorer, not the APY math).
    const sub = subs.find((s) => s.validators.length > 0);
    expect(sub).toBeTruthy();
    if (!sub) return;
    const spot = sub.alphaSpotTao;
    const laneStakeAlpha = sub.laneStakeTao > 0 && spot > 0 ? sub.laneStakeTao / spot : 0;
    const op: SubnetStakeOpportunity = {
      netuid: sub.netuid,
      name: sub.name ?? `Subnet ${sub.netuid}`,
      poolTao: sub.poolTao,
      poolAlpha: sub.poolAlpha,
      alphaSpotTao: spot,
      realizableTao: sub.realizableTao ?? spot,
      laneAlphaPerDay: sub.laneAlphaPerDay,
      laneTaoPerDay: sub.laneAlphaPerDay * (sub.realizableTao ?? spot),
      laneStakeAlpha: Math.round(laneStakeAlpha),
      laneStakeTao: Math.round(laneStakeAlpha * spot),
      exitSlippagePct: 1,
      validators: sub.validators.map((v) => {
        const captureAlphaPerDay = sub.laneAlphaPerDay * v.captureShare;
        const taoPerDay = ((captureAlphaPerDay * (1 - v.take)) / laneStakeAlpha) * 100 * (sub.realizableTao ?? spot);
        const susApy = (taoPerDay * 365 * 100) / 100;
        return {
          uid: v.uid,
          hotkey: v.hotkey,
          stakeAlpha: Math.round(v.stakeAlpha),
          captureShare: v.captureShare,
          take: v.take,
          captureAlphaPerDay,
          taoPerDay,
          taoPerMonth: taoPerDay * 30,
          apySustainablePct: susApy,
          apyLowPct: susApy * 0.75,
          apyHighPct: susApy * 1.25,
          apyInstantPct: susApy * 2,
        };
      }),
      bestValidator: {
        uid: 0, hotkey: "", stakeAlpha: 0, captureShare: 0, take: 0,
        captureAlphaPerDay: 0, taoPerDay: 0, taoPerMonth: 0,
        apySustainablePct: 0, apyLowPct: 0, apyHighPct: 0, apyInstantPct: 0,
      },
      bestApySustainablePct: 0,
      beatsRoot: true,
      rootBaselineApyPct: 4.31,
      dilutionRatio: sub.dilutionRatio,
      alphaChange24hPct: sub.alphaChange24hPct,
      topValidatorConcentration: Math.max(...sub.validators.map((v) => v.captureShare)),
      riskLevel: "medium",
      notes: [],
    };
    const rows = scoreAllValidators([op]);
    expect(rows.length).toBe(op.validators.length);
    for (const row of rows) {
      expect(row.score.score).toBeGreaterThanOrEqual(0);
      expect(row.score.score).toBeLessThanOrEqual(100);
      expect(row.netuid).toBe(sub.netuid);
    }
    // Tier ordering: STRONG rows never appear after AVOID rows.
    const tier = { STRONG: 0, VIABLE: 1, SPECULATIVE: 2, AVOID: 3 } as const;
    for (let i = 1; i < rows.length; i++) {
      expect(tier[rows[i - 1].verdict]).toBeLessThanOrEqual(tier[rows[i].verdict]);
    }
  });
});
