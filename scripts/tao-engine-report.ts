// Prints the TAO Engine ranked research output (same math as the live API).
// Usage: bun scripts/tao-engine-report.ts [stakeTao] [risk]
import baseline from "../src/lib/infranex/tao-engine-baseline.json";
import {
  computeTaoEngineOptions,
  summarizeTaoEngine,
  rootBaselineRow,
} from "../src/lib/infranex/tao-engine";
import type { TaoEngineResearchPayload } from "../src/lib/infranex/tao-engine-types";

const stakeTao = Number(process.argv[2] ?? 100);
const risk = (process.argv[3] ?? "any") as "any" | "safe";
const payload = baseline as unknown as TaoEngineResearchPayload;

const summary = summarizeTaoEngine(payload, stakeTao);
const root = rootBaselineRow(stakeTao);
const options = computeTaoEngineOptions(payload, { stakeTao, maxOptions: 15, riskTolerance: risk });

console.log(`=== TAO ENGINE RESEARCH SUMMARY (stake ${stakeTao} TAO) ===`);
console.log(JSON.stringify(summary, null, 1));
console.log(`root baseline: netApyPct=${root.netApyPct} taoPerDay=${root.taoPerDay}`);

console.log(`\n=== TOP ${options.length} VALIDATOR-STAKING OPTIONS ===`);
for (const o of options) {
  console.log(
    `S${String(o.netuid).padStart(3)} ${o.subnetName.padEnd(16)} uid=${String(o.validatorUid).padStart(2)} ` +
      `net=${o.sustainableApyPct.toFixed(1)}%APY (lo ${o.apyLowPct.toFixed(1)} hi ${o.apyHighPct.toFixed(1)}) ` +
      `take=${o.takePct.toFixed(1)}% slip=${o.exitSlippagePct.toFixed(2)}% ` +
      `tao/mo=${o.taoPerMonth.toFixed(3)} ${o.verdict}/${o.riskLevel}`
  );
}
