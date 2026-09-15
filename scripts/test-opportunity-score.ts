// Opportunity Score engine test — synthetic live snapshot, no network.
// Run: bun scripts/test-opportunity-score.ts
import {
  computeOpportunityScore,
  computeStakingStrategies,
  STAKING_MODEL,
} from "../src/lib/infranex/opportunity-score";
import { DEFAULT_PROFITABILITY_CONFIG } from "../src/lib/infranex/profitability";
import type { LiveNetworkSnapshot, LiveSubnetMetrics } from "../src/lib/infranex/chain";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}${cond ? "" : `: ${detail}`}`);
  if (!cond) failures++;
}

function subnet(partial: Partial<LiveSubnetMetrics> & { netuid: number }): LiveSubnetMetrics {
  return {
    name: `Subnet ${partial.netuid}`,
    minersCount: 100,
    validatorsCount: 12,
    subnetTao: 100_000,
    alphaIn: 50_000,
    alphaOut: 0,
    tempo: 360,
    emissionEnabled: true,
    movingPrice: 0.1,
    emission: null,
    emissionTaoPerDay: null,
    minerEmissionTaoPerDay: null,
    rewardedMiners: null,
    top10IncentiveShare: null,
    incentiveMedianShare: null,
    burnCostTao: null,
    immunityBlocks: null,
    alphaPriceChange24h: null,
    maxUids: 256,
    owner: null,
    registeredAt: null,
    identityGithub: null,
    identityDescription: null,
    ...partial,
  } as LiveSubnetMetrics;
}

const TAO_USD = 225;

// --- Synthetic network -------------------------------------------------------
// SN0 root: big stake, no conclusive emission → root baseline path.
// SN8: strong mining subnet (Frontier LLM inference → H100 tier).
// SN1: staking-heavy pool: deep, calm alpha → medium risk, high net APY.
// SN2: thin pool (stake < MIN_POOL_TAO) → must be skipped.
// SN3: net-negative mining (no rewarded miners) → not a mining candidate.
const snap: LiveNetworkSnapshot = {
  blockNumber: 5_000_000,
  totalSubnets: 5,
  specVersion: 1500,
  fetchedAt: new Date().toISOString(),
  taoPriceUsd: TAO_USD,
  taoMarketCapUsd: 4_400_000_000,
  taoChange24h: -1.2,
  source: "live",
  subnets: [
    subnet({ netuid: 0, name: "Root", subnetTao: 21_000_000, emissionTaoPerDay: 0 }),
    subnet({
      netuid: 8,
      name: "Frontier LLM inference subnet",
      identityDescription: "Frontier LLM inference and serving",
      minersCount: 500,
      rewardedMiners: 400,
      minerEmissionTaoPerDay: 720, // 1.8 TAO/day per earning miner
      subnetTao: 800_000,
      alphaPriceChange24h: 2.1,
      burnCostTao: 0.8,
    }),
    subnet({
      netuid: 1,
      name: "Apex staking pool",
      emissionTaoPerDay: 1200,
      subnetTao: 500_000,
      alphaPriceChange24h: -2.0,
    }),
    subnet({ netuid: 2, name: "Thin pool", emissionTaoPerDay: 900, subnetTao: 500 }),
    subnet({
      netuid: 3,
      name: "Dying subnet",
      minersCount: 64,
      rewardedMiners: 0,
      minerEmissionTaoPerDay: 0.5,
      emissionEnabled: false,
    }),
  ],
  neurons: [],
};

// --- Staking model -----------------------------------------------------------
const { root, subnets: stakingSubnets } = computeStakingStrategies(snap);
const rootNetExpected = Math.round(5.25 * (1 - 0.18) * 100) / 100; // 4.31
check("root net APY = baseline × (1 − take)", root.netApyPct === rootNetExpected, `got ${root.netApyPct}`);
check("root risk low + TAO-denominated", root.riskLevel === "low" && root.alphaChange24hPct === null);
check("root monthlyTao scales with capital", Math.abs(root.monthlyTao(10) * 12 - 10 * (root.netApyPct / 100)) < 0.001, `got ${root.monthlyTao(10)}`);

const sn1 = stakingSubnets.find((s) => s.netuid === 1);
check("thin pool SN2 skipped", !stakingSubnets.some((s) => s.netuid === 2));
check("dying subnet (emission off) skipped", !stakingSubnets.some((s) => s.netuid === 3));
if (sn1) {
  const expected =
    Math.round(
      ((1200 * 365) / 500_000) * 100 *
        STAKING_MODEL.STAKER_EMISSION_SHARE *
        (1 - 0.18) *
        (1 - STAKING_MODEL.POOL_SWAP_FEE_PCT / 100) *
        100
    ) / 100;
  check("subnet pool net APY formula", sn1.netApyPct === expected, `got ${sn1.netApyPct} want ${expected}`);
  check("deep + calm pool → medium risk", sn1.riskLevel === "medium", sn1.riskLevel);
  check("alpha drift surfaced", sn1.alphaChange24hPct === -2.0);
} else {
  check("SN1 staking strategy exists", false, "missing");
}

// --- Full score composition --------------------------------------------------
const result = computeOpportunityScore(snap, {
  capitalTao: 10,
  profConfig: DEFAULT_PROFITABILITY_CONFIG,
});

check("liveData true on live snapshot", result.liveData === true);
check("staking leg populated with SN1 (beats root by margin)", result.staking.kind === "subnet" && result.staking.netApyPct === sn1?.netApyPct, JSON.stringify(result.staking));
check("mining leg populated from SN8", result.mining != null && result.mining.taoPerMonth > 0, JSON.stringify(result.mining));
check("score within 3–98", result.score >= 3 && result.score <= 98, String(result.score));
check("recommended is mining when mining ROI ≫ staking", result.recommended.strategy === "mine", result.recommended.title);
check("alternative is staking", result.alternative.strategy === "stake");
check("mining netMonthlyInr = usd × 87.5", result.recommended.netMonthlyInr === Math.round(result.recommended.netMonthlyUsd * STAKING_MODEL.USD_INR));
check("staking monthlyTao on 10 TAO", Math.abs(result.staking.monthlyTao - (10 * (sn1!.netApyPct / 100)) / 12) < 0.001, String(result.staking.monthlyTao));
check("capital scales staking linearly", (() => {
  const r40 = computeOpportunityScore(snap, { capitalTao: 40, profConfig: DEFAULT_PROFITABILITY_CONFIG });
  return Math.abs(r40.staking.monthlyTao - result.staking.monthlyTao * 4) < 0.01;
})());
check("alternatives include mining runners + staking pools", result.alternatives.mining.length >= 1 && result.alternatives.staking.length >= 2);
check("risk badge on recommended", ["low", "medium", "high"].includes(result.recommended.riskLevel));

// --- Staking-favored regime: no profitable mining ----------------------------
const stakeOnly = computeOpportunityScore(
  {
    ...snap,
    subnets: snap.subnets.map((s) =>
      s.netuid === 8
        ? { ...s, minerEmissionTaoPerDay: 0.01, rewardedMiners: 400 } // dust revenue → net negative
        : s
    ),
  },
  { capitalTao: 10, profConfig: DEFAULT_PROFITABILITY_CONFIG }
);
check(
  "stake-only regime recommends staking",
  stakeOnly.recommended.strategy === "stake",
  `${stakeOnly.recommended.strategy} · ${stakeOnly.recommended.title}`
);
check("stake-only note explains why", stakeOnly.notes.some((n) => n.includes("passive staking")));

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
