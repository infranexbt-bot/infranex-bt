// WHY-IOTA-NO — diagnostic: why does the Ranked Opportunities table show the
// "NO" earn-pick band for SN9 (IOTA) even though its GPU column says RTX 4090?
// Runs the app's OWN engine (live-merge + rent-earn + mine-pick) on the live
// snapshot data with the user's owned-rig basis.
import { readFileSync } from "node:fs";
import { mergeOpportunities } from "../src/lib/infranex/live-merge";
import { computeRentEarn, costBasisFromConfig } from "../src/lib/infranex/rent-earn";
import { computeMinePick } from "../src/lib/infranex/mine-pick";
import type { ProfitabilityConfig } from "../src/lib/infranex/types";

const snap = JSON.parse(readFileSync("/tmp/net.json", "utf8"));
const ovrRaw = JSON.parse(readFileSync("/tmp/ovr.json", "utf8"));
const overrides = new Map<number, Record<string, unknown>>(
  (Array.isArray(ovrRaw) ? ovrRaw : ovrRaw.rows ?? []).map((r: Record<string, unknown>) => [r.netuid as number, r])
);
const prof = JSON.parse(readFileSync("/tmp/prof.json", "utf8")) as ProfitabilityConfig;

const merged = mergeOpportunities(snap as never, prof, overrides);
const o = merged.find((r) => r.netuid === 9);
if (!o) {
  console.log("SN9 not found in merged rows; total:", merged.length);
  process.exit(0);
}

console.log("=== SN9 (IOTA) merged row (UI inputs) ===");
console.log({
  name: o.name,
  state: o.state,
  classification: o.classification,
  difficulty: o.difficulty,
  recommendedGpu: o.recommendedGpu,
  minVramGb: o.minVramGb,
  workType: o.workType,
  hosting: o.hosting,
  rewardedRatio: o.rewardedRatio,
  top10IncentiveShare: o.top10IncentiveShare,
  freeSlots: o.freeSlots,
  netMonthlyUsd: o.netMonthlyUsd,
  earnChance: o.earnChance,
  rewardMedianShare: o.rewardMedianShare,
  conviction: o.conviction,
});

const profOwned4090 = { ...prof, hardwareMode: "owned", rigGpuVramGb: 24, rigTeeCapable: true };
const bases: Array<[string, never]> = [
  ["UI basis (owned, rig=96GB, TEE)", costBasisFromConfig(prof) as never],
  ["User basis (owned, rig=24GB 4090, TEE)", costBasisFromConfig(profOwned4090) as never],
  ["Rent basis (default lens)", "rent" as never],
];

for (const [label, basis] of bases) {
  const v = computeRentEarn(o, basis);
  console.log(`\n=== RENT-EARN — ${label} ===`);
  console.log({
    band: v.band,
    score: v.score,
    rentable: v.rentable,
    rentBlock: v.rentBlock,
    earnChancePct: v.earnChancePct,
    top10TakePct: v.top10TakePct,
    knifeFight: v.knifeFight,
    whaleMean: v.whaleMean,
    entry: v.entry,
    expectedNetMonthlyUsd: v.expectedNetMonthlyUsd,
  });
  console.log("notes:", v.notes);
}

const mp = computeMinePick(o, costBasisFromConfig(prof) as never);
console.log("\n=== MINE-PICK (verdict chip logic) ===");
console.log({
  band: mp.band,
  verdict: mp.verdict,
  score: mp.score,
  gated: (mp as never as { gated?: boolean }).gated,
  gateReasons: (mp as never as { gateReasons?: unknown }).gateReasons,
});
