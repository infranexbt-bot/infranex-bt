const BASE = "http://localhost:3000";
const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
});
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
const snap = await (await fetch(`${BASE}/api/network`, { headers: { cookie }, cache: "no-store" })).json() as any;
const ov = await (await fetch(`${BASE}/api/subnet-overrides`, { headers: { cookie }, cache: "no-store" })).json() as any;
const profConfig = await (await fetch(`${BASE}/api/profitability-config`, { headers: { cookie }, cache: "no-store" })).json();

// live names
const names = new Map<number, string>();
for (const s of snap.subnets ?? []) if (s.netuid != null && s.name) names.set(Number(s.netuid), s.name);

const map = new Map<number, Record<string, unknown>>();
for (const o of ov.overrides) {
  const e: Record<string, unknown> = {};
  if (o.name) e.name = o.name;
  if (o.description) e.description = o.description;
  if (o.minVramGb != null) e.minVramGb = o.minVramGb;
  if (o.recommendedGpu) e.recommendedGpu = o.recommendedGpu;
  if (o.hostingRequirements) { try { e.hosting = JSON.parse(String(o.hostingRequirements)); } catch {} }
  map.set(Number(o.netuid), e);
}
const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
const rows = mergeOpportunities(snap as never, profConfig as never, map) as any[];
const { computeMinePick } = await import("../src/lib/infranex/mine-pick");

console.log("=== CPU PRIME rows with names ===");
for (const p of rows.filter((o) => o.netuid > 0).map(computeMinePick).filter(p => p.hardware === "CPU" && p.band === "PRIME"))
  console.log(`SN${p.o.netuid} ${names.get(p.o.netuid) ?? "?"} conv=${p.conviction} EV=$${p.rent.expectedNetMonthlyUsd}/mo net=$${Math.round(p.o.netMonthlyUsd ?? 0)}/mo`);

console.log("\n=== SN4 (Templar) + top-emission GPU subnets ===");
const topEmission = rows.filter((o) => o.netuid > 0).sort((a, b) => (b.minerEmissionTaoPerDay ?? 0) - (a.minerEmissionTaoPerDay ?? 0)).slice(0, 12);
for (const o of topEmission) {
  const p = computeMinePick(o);
  const name = names.get(o.netuid) ?? "?";
  console.log(`SN${String(o.netuid).padStart(3)} ${String(name).slice(0,12).padEnd(12)} ${String(p.o.recommendedGpu ?? "?").slice(0,26).padEnd(26)} em=${String(Math.round(o.minerEmissionTaoPerDay ?? 0)).padStart(4)}TAO/d band=${p.band.padEnd(8)} net=$${Math.round(o.netMonthlyUsd ?? 0).toLocaleString()}/mo`);
  for (const r of p.reasons.slice(0, 2)) console.log(`     ↳ ${r}`);
}

// RUN rows (opportunities page band) for completeness
const { opportunityBand } = await import("../src/lib/utils");
const runRows = rows.filter((o) => o.netuid > 0 && opportunityBand({ score: o.score, meetsMinimum: o.meetsMinimum, targetUsd: o.targetUsd }).label === "RUN");
console.log(`\n=== Opportunities-page RUN rows (${runRows.length}) ===`);
for (const o of runRows) console.log(`SN${String(o.netuid).padStart(3)} ${names.get(o.netuid) ?? "?"} score=${o.score} GPU="${String(o.recommendedGpu ?? "?").slice(0,24)}" net=$${Math.round(o.netMonthlyUsd ?? 0)}/mo`);
