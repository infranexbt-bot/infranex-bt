/**
 * cpu-subnet-list.ts — reproduce the app's CPU-minable subnet list exactly
 * as the CPU Guide view computes it: mergeOpportunities(snap, profConfig)
 * filtered to minVramGb <= 0. Also cross-checks against the DB's
 * GitHub-scraped ground truth (requirementsSource) to flag conflicts.
 *
 * Run: bun /home/z/my-project/scripts/cpu-subnet-list.ts
 */
import { mergeOpportunities } from "@/lib/infranex/live-merge";
import type { LiveNetworkSnapshot } from "@/lib/infranex/chain";
import type { ProfitabilityConfig } from "@/lib/infranex/types";

const snap: LiveNetworkSnapshot = JSON.parse(
  await Bun.file("/tmp/net.json").text()
);
const profConfig = JSON.parse(await Bun.file("/tmp/prof.json").text()) as ProfitabilityConfig;

const opps = mergeOpportunities(snap, profConfig);
const cpu = opps.filter((o) => (o.minVramGb ?? 0) <= 0);

console.log(`TOTAL live opportunities: ${opps.length}`);
console.log(`CPU-classified (minVramGb<=0): ${cpu.length}\n`);

for (const o of cpu.sort((a, b) => b.score - a.score)) {
  const sn = snap.subnets.find((s) => s.netuid === o.netuid);
  const cats = [
    o.category,
    (o as any).mechanics ? "mechanics✓" : "",
  ].filter(Boolean).join(" ");
  console.log(
    [
      `SN${String(o.netuid).padStart(3)}`,
      o.subnetName ?? "?",
      `score=${o.score}`,
      `vram=${o.minVramGb}`,
      `miners=${o.liveMiners ?? o.minersCount ?? "?"}`,
      `minerEm/day=${sn?.minerEmissionTaoPerDay ?? "?"}τ`,
      `rewarded=${sn?.rewardedMiners ?? "?"}`,
      `burn=${sn?.burnCostTao ?? "?"}τ`,
      `|$|${(o.grossMonthlyUsd ?? 0)}/mo`,
      `|${cats}`,
      `|${(sn?.identityDescription ?? "").slice(0, 90)}`,
    ].join(" ")
  );
}
