// ---------------------------------------------------------------------------
// analyze-own-gpu-nogo.ts — reproduce the Dashboard "Choose your subnet"
// picker EXACTLY (same lib code the browser runs) and dump WHY every GPU
// row is NO-GO under hardwareMode=owned.
//
// Feeds the same three inputs the UI uses:
//   /api/network + /api/subnet-overrides + /api/profitability-config
// then classifies every excluded/gated GPU row into:
//   A) hosting-gate blocked (bareMetalOnly / teeRequired / curated)
//   B) meetsMinimum=false (excluded from the picker before ranking)
//   C) not net-positive (excluded before ranking)
//   D) ranked but conviction < 35 (no hard gate — just weak economics)
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { mergeOpportunities } from "../src/lib/infranex/live-merge";
import { computeMinePick, rankMinePicks } from "../src/lib/infranex/mine-pick";
import type { ProfitabilityConfig } from "../src/lib/infranex/profitability";
import type { LiveNetworkSnapshot } from "../src/lib/infranex/chain";

const dir = "/home/z/my-project/scripts";
const snap = JSON.parse(readFileSync(`${dir}/tmp-network.json`, "utf8")) as LiveNetworkSnapshot;
const overridesRaw = JSON.parse(readFileSync(`${dir}/tmp-overrides.json`, "utf8"));
const profConfig = JSON.parse(readFileSync(`${dir}/tmp-profconfig.json`, "utf8")) as ProfitabilityConfig;

// Rebuild the overrides Map exactly like use-subnet-overrides.ts does.
const overrides = new Map<number, Record<string, unknown>>();
for (const o of overridesRaw.overrides as Array<Record<string, unknown>>) {
  const entry: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => {
    if (v != null && v !== "") entry[k] = v;
  };
  put("name", o.name);
  put("description", o.description);
  put("category", o.category);
  put("minVramGb", o.minVramGb);
  put("recommendedGpu", o.recommendedGpu);
  put("gpuCount", o.gpuCount);
  if (o.hostingRequirements) {
    try { entry.hosting = JSON.parse(String(o.hostingRequirements)); } catch { /* ignore */ }
  }
  if (o.mechanicsJson) {
    try { entry.mechanics = JSON.parse(String(o.mechanicsJson)); } catch { /* ignore */ }
  }
  put("requirementsSource", o.requirementsSource);
  put("githubUrl", o.githubUrl);
  put("website", o.website);
  overrides.set(Number(o.netuid), entry);
}

const rows = mergeOpportunities(snap, profConfig, overrides);

const isCpu = (r: { minVramGb: number; workType?: string | null; recommendedGpu?: string | null }) =>
  r.minVramGb <= 0 ||
  (r.workType ?? "").toLowerCase().includes("cpu") ||
  /cpu/i.test(r.recommendedGpu ?? "");

const gpuRows = rows.filter((r) => !isCpu(r));
const cpuRows = rows.filter((r) => isCpu(r));

console.log(`snapshot: block=${snap.blockNumber} subnets=${snap.subnets.length} tao=$${snap.taoPriceUsd} mode=${profConfig.hardwareMode}`);
console.log(`merged rows: ${rows.length}  GPU-class: ${gpuRows.length}  CPU-class: ${cpuRows.length}\n`);

// --- classify every GPU row -------------------------------------------------
const cat = { gate: [] as any[], minFail: [] as any[], notNet: [] as any[], ranked: [] as any[] };
for (const r of gpuRows) {
  const net = r.netMonthlyUsd ?? r.estimatedMonthlyRewardUsd ?? 0;
  if (r.meetsMinimum === false) cat.minFail.push(r);
  else if (net <= 0) cat.notNet.push(r);
  else {
    const pick = computeMinePick(r);
    if (!pick.rent.rentable) cat.gate.push(pick);
    else cat.ranked.push(pick);
  }
}

console.log(`GPU row outcomes:`);
console.log(`  A) hosting-gate blocked  : ${cat.gate.length}`);
console.log(`  B) meetsMinimum=false    : ${cat.minFail.length}  (picker excludes)`);
console.log(`  C) not net-positive      : ${cat.notNet.length}  (picker excludes)`);
console.log(`  D) ranked, no hard gate  : ${cat.ranked.length}\n`);

// --- A) gate breakdown -------------------------------------------------------
const gateKind = (p: any) => {
  const h = p.o.hosting;
  if (h?.bareMetalOnly && h?.teeRequired) return "bareMetal+TEE";
  if (h?.bareMetalOnly) return "bareMetal";
  if (h?.teeRequired) return "TEE";
  return "curated";
};
const gateCounts: Record<string, number> = {};
for (const p of cat.gate) {
  const k = gateKind(p);
  gateCounts[k] = (gateCounts[k] ?? 0) + 1;
}
console.log(`A) Hosting-gate kind distribution:`, JSON.stringify(gateCounts), "\n");

console.log(`A) GATE-BLOCKED GPU rows (would-be miner subnets the gate rejects):`);
for (const p of [...cat.gate].sort((a, b) => b.conviction - a.conviction)) {
  const h = p.o.hosting;
  console.log(
    `  SN${String(p.o.netuid).padStart(3)} ${String(p.o.subnetName).slice(0, 22).padEnd(22)} gate=${gateKind(p).padEnd(14)} conv=${String(p.conviction).padStart(3)} net=$${String(Math.round(p.o.netMonthlyUsd ?? 0)).padStart(6)} gpu=${(p.o.recommendedGpu ?? "?").slice(0, 24)}`
  );
  console.log(`        block: ${p.rent.rentBlock}`);
  console.log(`        src:   ${p.rent.rentBlockSource} | earn%=${p.rent.earnChancePct} top10=${p.rent.top10TakePct} knife=${p.rent.knifeFight} whale=${p.rent.whaleMean}`);
}

console.log(`\nD) RANKED GPU rows (no hard gate) — the ONLY ones the picker can show as GPU:`);
for (const p of [...cat.ranked].sort((a, b) => b.conviction - a.conviction)) {
  console.log(
    `  SN${String(p.o.netuid).padStart(3)} ${String(p.o.subnetName).slice(0, 22).padEnd(22)} band=${p.band.padEnd(7)} conv=${String(p.conviction).padStart(3)} net=$${String(Math.round(p.o.netMonthlyUsd ?? 0)).padStart(6)} EV=$${p.rent.expectedNetMonthlyUsd} earn%=${p.rent.earnChancePct} knife=${p.rent.knifeFight} whale=${p.rent.whaleMean} minProfit=${p.o.meetsMinimum}`
  );
  console.log(`        reasons: ${p.reasons.join(" | ")}`);
}

// --- B) meetsMinimum breakdown ----------------------------------------------
console.log(`\nB) GPU rows killed by the $${profConfig.minNetProfitTargetUsd}/mo minimum-profit rule (${cat.minFail.length}):`);
const minFailTop = [...cat.minFail].sort((a, b) => (b.netMonthlyUsd ?? 0) - (a.netMonthlyUsd ?? 0)).slice(0, 15);
for (const r of minFailTop) {
  const gate = (r as any).hosting?.bareMetalOnly || (r as any).hosting?.teeRequired ? " [gate too]" : "";
  console.log(`  SN${String(r.netuid).padStart(3)} ${String(r.subnetName).slice(0, 22).padEnd(22)} net=$${String(Math.round(r.netMonthlyUsd ?? 0)).padStart(6)} gpu=${(r.recommendedGpu ?? "?").slice(0, 22)}${gate}`);
}
if (cat.minFail.length > minFailTop.length) console.log(`  ... and ${cat.minFail.length - minFailTop.length} more`);

// --- C) not net positive ------------------------------------------------------
console.log(`\nC) GPU rows with net<=0 (${cat.notNet.length}):`);
const notNetTop = [...cat.notNet].sort((a, b) => (b.netMonthlyUsd ?? 0) - (a.netMonthlyUsd ?? 0)).slice(0, 12);
for (const r of notNetTop) {
  console.log(`  SN${String(r.netuid).padStart(3)} ${String(r.subnetName).slice(0, 22).padEnd(22)} net=$${String(Math.round(r.netMonthlyUsd ?? 0)).padStart(6)} gpu=${(r.recommendedGpu ?? "?").slice(0, 22)}`);
}
if (cat.notNet.length > notNetTop.length) console.log(`  ... and ${cat.notNet.length - notNetTop.length} more`);

// --- full picker output (what the user sees) ----------------------------------
console.log(`\n--- PICKER OUTPUT (rankMinePicks — what the Dashboard shows) ---`);
const picks = rankMinePicks(rows);
for (const band of ["PRIME", "READY", "MARGINAL", "NO-GO"] as const) {
  const inBand = picks.filter((p) => p.band === band);
  console.log(`${band} (${inBand.length}):`);
  for (const p of inBand) {
    console.log(
      `  SN${String(p.o.netuid).padStart(3)} ${String(p.o.subnetName).slice(0, 22).padEnd(22)} hw=${p.hardware.padEnd(4)} conv=${String(p.conviction).padStart(3)} net=$${String(Math.round(p.o.netMonthlyUsd ?? 0)).padStart(6)}`
    );
  }
}

// --- what-if: owned rigs ignore the bare-metal-only part of the gate ----------
console.log(`\n--- WHAT-IF: owned rigs satisfy bareMetalOnly (keep TEE gate) ---`);
const lifted = cat.gate.filter((p: any) => {
  const h = p.o.hosting;
  return h?.bareMetalOnly && !h?.teeRequired && !h?.staticIpOnly;
});
console.log(`rows that would lift: ${lifted.length}`);
for (const p: any of lifted) {
  console.log(`  SN${String(p.o.netuid).padStart(3)} ${String(p.o.subnetName).slice(0, 22).padEnd(22)} conv was ${p.conviction} net=$${Math.round(p.o.netMonthlyUsd ?? 0)} earn%=${p.rent.earnChancePct} top10=${p.rent.top10TakePct} knife=${p.rent.knifeFight} whale=${p.rent.whaleMean}`);
  console.log(`        block was: ${p.rent.rentBlock}`);
}
