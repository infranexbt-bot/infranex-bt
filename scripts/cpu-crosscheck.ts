/**
 * cpu-crosscheck.ts — cross-check the CPU list against scraped ground truth.
 * 1. What does mergeOpportunities(snap, profConfig, overrides) say for the
 *    pinned CPU guide profiles (SN6, 13, 50, 67, 62, 75)?
 * 2. For all 17 classifier-CPU subnets: does the scraped override disagree
 *    (repo README says GPU required)?
 * Run: bun /home/z/my-project/scripts/cpu-crosscheck.ts
 */
import { mergeOpportunities } from "@/lib/infranex/live-merge";
import type { LiveNetworkSnapshot } from "@/lib/infranex/chain";
import type { ProfitabilityConfig } from "@/lib/infranex/types";

const snap: LiveNetworkSnapshot = JSON.parse(await Bun.file("/tmp/net.json").text());
const profConfig = JSON.parse(await Bun.file("/tmp/prof.json").text()) as ProfitabilityConfig;
const ovrRaw = JSON.parse(await Bun.file("/tmp/ovr.json").text()).overrides as any[];

// Map DB columns → merge-engine override shape (hostingRequirements→hosting,
// mechanicsJson→mechanics) the way the server-side loaders do.
const ovrMap = new Map<number, Record<string, unknown>>();
for (const o of ovrRaw) {
  ovrMap.set(o.netuid, {
    ...o,
    hosting: o.hostingRequirements ?? null,
    mechanics: o.mechanicsJson ?? null,
  });
}

const withOv = mergeOpportunities(snap, profConfig, ovrMap);

console.log("=== Pinned CPU-guide profiles: classifier vs scraped ground truth ===");
for (const netuid of [67, 62, 13, 50, 75, 6]) {
  const o = withOv.find((x) => x.netuid === netuid);
  const sn = snap.subnets.find((s) => s.netuid === netuid);
  if (!o) { console.log(`SN${netuid}: not in live opportunities`); continue; }
  console.log(
    `SN${netuid} ${o.subnetName}: vram=${o.minVramGb} cat="${o.category}" ` +
    `gpu=${o.recommendedGpu ?? "-"} src=${o.requirementsSource ?? "none"} ` +
    `bareMetal=${(o as any).hosting?.bareMetalOnly ?? "-"} ` +
    `| liveDesc="${(sn?.identityDescription ?? "").slice(0, 70)}"`
  );
}

console.log("\n=== 17 classifier-CPU subnets: does scraped truth disagree? ===");
const oppsNoOv = mergeOpportunities(snap, profConfig).filter((o) => (o.minVramGb ?? 0) <= 0);
for (const o of oppsNoOv.sort((a, b) => b.score - a.score)) {
  const ov = withOv.find((x) => x.netuid === o.netuid);
  const conflict = ov && (ov.minVramGb ?? 0) > 0;
  console.log(
    `SN${String(o.netuid).padStart(3)} ${o.subnetName}: classifier=CPU ` +
    `| scraped vram=${ov?.minVramGb ?? "-"} gpu=${ov?.recommendedGpu ?? "-"} ` +
    `src=${(ov?.requirementsSource ?? "none").slice(0, 60)} ` +
    (conflict ? `>>> CONFLICT: repo says GPU ${ov?.minVramGb}GB` : "| consistent")
  );
}
