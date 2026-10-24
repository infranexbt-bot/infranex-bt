// probe-tier-pricing.ts — why are SN51/SN64 P&L GPU lines so cheap?
import { readFileSync } from "node:fs";
import { mergeOpportunities } from "../src/lib/infranex/live-merge";
import { classifySubnetHardware } from "../src/lib/infranex/miner-score";
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
  put("name", o.name);
  put("description", o.description);
  put("category", o.category);
  put("minVramGb", o.minVramGb);
  put("recommendedGpu", o.recommendedGpu);
  put("gpuCount", o.gpuCount);
  if (o.hostingRequirements) { try { entry.hosting = JSON.parse(String(o.hostingRequirements)); } catch { /* */ } }
  if (o.mechanicsJson) { try { entry.mechanics = JSON.parse(String(o.mechanicsJson)); } catch { /* */ } }
  put("requirementsSource", o.requirementsSource);
  overrides.set(Number(o.netuid), entry);
}

for (const nu of [51, 64, 4, 1]) {
  const live = snap.subnets.find((s) => s.netuid === nu);
  if (!live) continue;
  const ovr = overrides.get(nu);
  console.log(`\n=== SN${nu} ${live.name} ===`);
  console.log(`  identity desc: ${(live.identityDescription ?? "").slice(0, 90)}`);
  const hw = classifySubnetHardware(live.name, live.identityDescription, {
    fallbackMonthlyUsd: 0,
    scraped: ovr && (ovr.recommendedGpu || ovr.hosting)
      ? {
          recommendedGpu: (ovr.recommendedGpu as string | null) ?? null,
          gpuCount: (ovr.gpuCount as number | null) ?? null,
          minVramGb: (ovr.minVramGb as number | null) ?? null,
          hosting: (ovr.hosting as never) ?? null,
          requirementsSource: (ovr.requirementsSource as string | null) ?? null,
        }
      : null,
  });
  console.log(`  classified tier=${hw.tier.label} minVram=${hw.minVramGb} gpuCount=${hw.gpuCount ?? 1} unitRent=${hw.unitRentUsd ?? "-"} rent=${hw.tier.monthlyRentUsd} bareMetalRent=${hw.tier.bareMetalMonthlyUsd} watts=${hw.tier.powerWatts}`);
  console.log(`  hosting=${JSON.stringify(hw.hosting)}`);
  console.log(`  source=${hw.requirementsSource ?? "-"} classified=${hw.classified} costClass=${hw.costClass ?? "-"}`);
  console.log(`  override row: name=${ovr?.name} recGpu=${ovr?.recommendedGpu} gpuCount=${ovr?.gpuCount} minVram=${ovr?.minVramGb} hosting=${String(ovr?.hostingRequirements).slice(0, 120)}`);
  // what the merged P&L used
  const rows = mergeOpportunities(snap, { ...profConfig, hardwareMode: "rent" }, overrides);
  const row = rows.find((r) => r.netuid === nu);
  if (row) {
    console.log(`  P&L: gpuLine=$${row.profitability?.gpuRentalUsd}/mo diagGpuCost=$${row.gpuCostMonthlyUsd} unitRentDiag=${(row as unknown as { factors?: unknown }).factors ? "?" : "?"} gpuCount=${row.gpuCount} recGpu=${row.recommendedGpu} minVram=${row.minVramGb}`);
  }
}
