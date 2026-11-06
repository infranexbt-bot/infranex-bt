// ---------------------------------------------------------------------------
// VALIDATOR BOARD STATS — compute the full Validator Stake Score board from
// the frozen research baseline exactly the way /api/tao-engine/recommend does
// (same mapping, same math, same ranking), then print the distribution:
// verdict tiers, grades, the top-8 headline vs the rest, and per-subnet
// group stats. Run: bun scripts/validator-board-stats.ts
// ---------------------------------------------------------------------------
import baseline from "../src/lib/infranex/tao-engine-baseline.json";
import {
  computeSubnetStakeOpportunity,
  type SubnetStakeInputs,
} from "../src/lib/infranex/tao-engine";
import { scoreAllValidators } from "../src/lib/infranex/validator-score";

interface BaselineValidator {
  uid: number; hotkey: string; stakeAlpha: number; captureShare: number; take: number;
}
interface BaselineSubnet {
  netuid: number; name: string | null; poolTao: number; poolAlpha: number;
  alphaSpotTao: number; realizableTao: number | null; laneAlphaPerDay: number;
  laneStakeTao: number;
  validators: BaselineValidator[];
  dilutionRatio: number | null; alphaChange24hPct: number | null;
}

const STAKE_TAO = 100;

const subs = (baseline.allResearched ?? baseline.subnets ?? []) as unknown as BaselineSubnet[];
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
    laneStakeAlpha:
      raw.laneStakeTao > 0 && raw.alphaSpotTao > 0
        ? raw.laneStakeTao / raw.alphaSpotTao
        : undefined,
    validators: raw.validators.map((v) => ({
      uid: v.uid, hotkey: v.hotkey, stakeAlpha: v.stakeAlpha,
      captureShare: v.captureShare, take: v.take,
    })),
    dilutionRatio: raw.dilutionRatio ?? null,
    alphaChange24hPct: raw.alphaChange24hPct ?? null,
    emissionEnabled: true,
  };
  const rec = computeSubnetStakeOpportunity(inputs, { stakeTao: STAKE_TAO });
  if (rec) opportunities.push(rec);
}

const rows = scoreAllValidators(opportunities);
const byVerdict: Record<string, number> = {};
const byGrade: Record<string, number> = {};
for (const r of rows) {
  byVerdict[r.verdict] = (byVerdict[r.verdict] ?? 0) + 1;
  byGrade[r.score.grade] = (byGrade[r.score.grade] ?? 0) + 1;
}

console.log(`stake=${STAKE_TAO} TAO · researched subnets=${subs.length} · opportunities=${opportunities.length} · scored validator rows=${rows.length}`);
console.log(`verdicts: ` + Object.entries(byVerdict).map(([k, v]) => `${k} ${v}`).join(" · "));
console.log(`grades:   ` + Object.entries(byGrade).map(([k, v]) => `${k} ${v}`).join(" · "));

const headline = rows.filter((r) => r.verdict !== "AVOID").slice(0, 8);
console.log("\nHEADLINE top-8 (what the card shows by default):");
for (const [i, r] of headline.entries()) {
  console.log(`  ${i + 1}. α${r.netuid} ${r.subnetName} uid${r.validatorUid} — ${r.score.score} ${r.score.grade} ${r.verdict} · take ${r.takePct}% · susAPY ${r.sustainableApyPct}%`);
}

console.log("\nTHE REST (ranks 9+, same board):");
let prev = headline.length;
for (const r of rows.slice(8, 32)) {
  prev += 1;
  console.log(`  ${prev}. α${r.netuid} ${r.subnetName} uid${r.validatorUid} — ${r.score.score} ${r.score.grade} ${r.verdict} · take ${r.takePct}% · susAPY ${r.sustainableApyPct}%`);
}

// per-subnet groups in board order
const groups = new Map<number, { name: string; rows: typeof rows }>();
for (const r of rows) {
  const g = groups.get(r.netuid);
  if (g) g.rows.push(r);
  else groups.set(r.netuid, { name: r.subnetName, rows: [r] });
}
console.log(`\nPER-SUBNET GROUPS (${groups.size}) — best score · spread · verdicts:`);
for (const [netuid, g] of groups) {
  const best = g.rows[0];
  const scores = g.rows.map((r) => r.score.score);
  const vcounts: Record<string, number> = {};
  for (const r of g.rows) vcounts[r.verdict] = (vcounts[r.verdict] ?? 0) + 1;
  console.log(
    `  α${String(netuid).padStart(3)} ${g.name.padEnd(14)} n=${g.rows.length} · best ${best.score.score}${best.score.grade} · spread ${Math.min(...scores)}–${Math.max(...scores)} · ${Object.entries(vcounts).map(([k, v]) => `${k[0]}${v}`).join("/")}`
  );
}
