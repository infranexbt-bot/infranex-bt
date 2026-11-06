// Smoke test: validator-score over the frozen baseline payload.
// Verifies the exact path the TAO engine view renders: scoreAllValidators
// (verdict tier → score → APY), grades, honesty caps.
import baselinePayload from "../src/lib/infranex/tao-engine-baseline.json";
import { computeSubnetStakeOpportunity, rankSubnetOpportunities, type SubnetStakeInputs } from "../src/lib/infranex/tao-engine";
import { scoreAllValidators } from "../src/lib/infranex/validator-score";

interface BV { uid: number; hotkey: string; stakeAlpha: number; captureShare: number; take: number; }
interface BS {
  netuid: number; name: string | null; poolTao: number; poolAlpha: number;
  alphaSpotTao: number; realizableTao: number | null; laneAlphaPerDay: number;
  laneStakeTao: number; validators: BV[];
  dilutionRatio: number | null; alphaChange24hPct: number | null;
}

const subs = (baselinePayload.allResearched ?? baselinePayload.subnets ?? []) as unknown as BS[];
const stakeTao = 100;
const opportunities = [];
for (const raw of subs) {
  if (!Array.isArray(raw.validators) || raw.validators.length === 0) continue;
  const inputs: SubnetStakeInputs = {
    netuid: raw.netuid,
    name: raw.name ?? null,
    poolTao: raw.poolTao,
    poolAlpha: raw.poolAlpha,
    alphaSpotTao: raw.alphaSpotTao,
    realizableTao: raw.realizableTao != null && raw.realizableTao > 0 ? raw.realizableTao : raw.alphaSpotTao,
    laneAlphaPerDay: raw.laneAlphaPerDay,
    laneStakeAlpha: raw.laneStakeTao > 0 && raw.alphaSpotTao > 0 ? raw.laneStakeTao / raw.alphaSpotTao : undefined,
    validators: raw.validators.map((v) => ({
      uid: v.uid, hotkey: v.hotkey, stakeAlpha: v.stakeAlpha,
      captureShare: v.captureShare, take: v.take,
    })),
    dilutionRatio: raw.dilutionRatio ?? null,
    alphaChange24hPct: raw.alphaChange24hPct ?? null,
    emissionEnabled: true,
  };
  const rec = computeSubnetStakeOpportunity(inputs, { stakeTao });
  if (rec) opportunities.push(rec);
}
const { beatingRoot } = rankSubnetOpportunities(opportunities, { limit: 12 });
const scored = scoreAllValidators(opportunities);
console.log(`subnets researched: ${subs.length}, opportunities: ${opportunities.length}, beatingRoot: ${beatingRoot.length}, scored rows: ${scored.length}`);
console.log("\nTOP 8 SCORED VALIDATORS (verdict → score → APY):");
for (const r of scored.slice(0, 8)) {
  console.log(
    `#${scored.indexOf(r) + 1} α${r.netuid} ${r.subnetName} uid${r.validatorUid} | ${r.verdict} | score ${r.score.score} (${r.score.grade})` +
      ` | APY ${r.sustainableApyPct}% (${r.apyLowPct}..${r.apyHighPct}) | take ${r.takePct}% | slip ${r.exitSlippagePct ?? "?"}%` +
      ` | TAO/mo ${r.taoPerMonth}`
  );
}
const top = scored.find((r) => r.verdict !== "AVOID");
if (top) {
  console.log("\nTOP PICK COMPONENT BREAKDOWN:");
  for (const p of top.score.parts) console.log(`  ${p.label.padEnd(20)} ${String(p.weightPct).padStart(3)}% → pts ${p.points} weighted ${p.weighted} | ${p.note}`);
}
// Sanity assertions
const allScores = scored.map((r) => r.score.score);
const inRange = allScores.every((s) => s >= 0 && s <= 100);
const avoidCapped = scored.filter((r) => r.verdict === "AVOID").every((r) => r.score.score <= 25);
console.log(`\nchecks: scores in [0,100]=${inRange}, AVOID capped ≤25=${avoidCapped}`);
