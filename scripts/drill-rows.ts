// ---------------------------------------------------------------------------
// drill-rows.ts — full detail on the rows that decide the answer:
// SN51 (Lium provider = mining SN51!), SN92 REAX (the one PRIME GPU),
// SN86 OnSale + SN35 (big nets killed by diligence), SN64 (what-if gate lift)
// ---------------------------------------------------------------------------
import { readFileSync } from "node:fs";
import { mergeOpportunities } from "../src/lib/infranex/live-merge";
import { computeMinePick } from "../src/lib/infranex/mine-pick";
import type { ProfitabilityConfig } from "../src/lib/infranex/profitability";
import type { LiveNetworkSnapshot } from "../src/lib/infranex/chain";

const dir = "/home/z/my-project/scripts";
const snap = JSON.parse(readFileSync(`${dir}/tmp-network.json`, "utf8")) as LiveNetworkSnapshot;
const overridesRaw = JSON.parse(readFileSync(`${dir}/tmp-overrides.json`, "utf8"));
const profConfig = JSON.parse(readFileSync(`${dir}/tmp-profconfig.json`, "utf8")) as ProfitabilityConfig;

const overrides = new Map<number, Record<string, unknown>>();
for (const o of overridesRaw.overrides as Array<Record<string, unknown>>) {
  const entry: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => { if (v != null && v !== "") entry[k] = v; };
  put("name", o.name); put("description", o.description); put("category", o.category);
  put("minVramGb", o.minVramGb); put("recommendedGpu", o.recommendedGpu); put("gpuCount", o.gpuCount);
  if (o.hostingRequirements) { try { entry.hosting = JSON.parse(String(o.hostingRequirements)); } catch {} }
  if (o.mechanicsJson) { try { entry.mechanics = JSON.parse(String(o.mechanicsJson)); } catch {} }
  put("requirementsSource", o.requirementsSource); put("githubUrl", o.githubUrl); put("website", o.website);
  overrides.set(Number(o.netuid), entry);
}

const rows = mergeOpportunities(snap, profConfig, overrides);
const want = [51, 92, 86, 35, 64, 5, 83, 82];

for (const netuid of want) {
  const r: any = rows.find((x) => x.netuid === netuid);
  if (!r) { console.log(`SN${netuid}: not in merged rows`); continue; }
  const pick = computeMinePick(r);
  const live = r.live ?? {};
  console.log(`\n=== SN${netuid} ${r.subnetName} ===`);
  console.log(`  gpu=${r.recommendedGpu} vram=${r.minVramGb} count=${r.gpuCount} work=${r.workType}`);
  console.log(`  hosting=${JSON.stringify(r.hosting)}`);
  console.log(`  miners=${live.minersCount} rewardedMiners=${live.rewardedMiners} minerEm/day=${(live.minerEmissionTaoPerDay ?? 0).toFixed(1)} TAO`);
  console.log(`  alphaPrice=$${live.alphaPrice?.moving ?? "?"} marketCap=$${live.marketCapUsd ? Math.round(live.marketCapUsd).toLocaleString() : "?"}`);
  console.log(`  gross=${r.estimatedMonthlyRewardUsd} net=${r.netMonthlyUsd} meetsMin=${r.meetsMinimum} confidence=${r.confidence}`);
  console.log(`  earnChance=${JSON.stringify(r.earnChance)}`);
  console.log(`  rewardedRatio=${r.rewardedRatio} top10=${r.top10IncentiveShare} freeSlots=${r.freeSlots}`);
  console.log(`  mine-pick: band=${pick.band} conv=${pick.conviction} rentBand=${pick.rent.band} rentable=${pick.rent.rentable} EV=${pick.rent.expectedNetMonthlyUsd}`);
  console.log(`  reasons: ${pick.reasons.join(" | ")}`);
  console.log(`  rent notes: ${pick.rent.notes.join(" | ")}`);
  console.log(`  diligence: ${pick.diligence.verdict} (${pick.diligence.failCount} fail / ${pick.diligence.warnCount} warn) — ${pick.diligence.verdictReason}`);
  for (const st of pick.diligence.stages.filter((s) => s.status === "fail" || s.status === "warn")) {
    console.log(`    [${st.status}] ${st.stage}: ${st.detail}`);
  }
}
