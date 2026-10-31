const BASE = "http://localhost:3000";
const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ userId: "admin", code: process.env.INFRANEX_ADMIN_CODE ?? "" }),
});
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
const snap = await (await fetch(`${BASE}/api/network`, { headers: { cookie }, cache: "no-store" })).json();
const ov = await (await fetch(`${BASE}/api/subnet-overrides`, { headers: { cookie }, cache: "no-store" })).json() as any;
const profConfig = await (await fetch(`${BASE}/api/profitability-config`, { headers: { cookie }, cache: "no-store" })).json();

const map = new Map<number, Record<string, unknown>>();
for (const o of ov.overrides) {
  const e: Record<string, unknown> = {};
  if (o.name) e.name = o.name;
  if (o.description) e.description = o.description;
  if (o.category) e.category = o.category;
  if (o.minVramGb != null) e.minVramGb = o.minVramGb;
  if (o.recommendedGpu) e.recommendedGpu = o.recommendedGpu;
  if (o.gpuCount != null) e.gpuCount = o.gpuCount;
  if (o.hostingRequirements) { try { e.hosting = JSON.parse(String(o.hostingRequirements)); } catch {} }
  if (o.requirementsSource) e.requirementsSource = o.requirementsSource;
  map.set(Number(o.netuid), e);
}

const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
const rows = mergeOpportunities(snap as never, profConfig as never, map) as any[];
const { computeMinePick } = await import("../src/lib/infranex/mine-pick");

const picks = rows.filter((o) => o.netuid > 0).map(computeMinePick);
const cpuPrime = picks.filter(p => p.hardware === "CPU" && p.band === "PRIME");
const gpuPicks = picks.filter(p => p.hardware === "GPU").sort((a,b) => b.conviction - a.conviction);

console.log(`total rows: ${picks.length} | CPU: ${picks.filter(p=>p.hardware==="CPU").length} | GPU: ${gpuPicks.length}`);
console.log(`\n=== CPU PRIME (${cpuPrime.length}) ===`);
for (const p of cpuPrime)
  console.log(`SN${p.o.netuid} ${String(p.o.name).slice(0,18).padEnd(18)} conviction=${p.conviction} EV=$${p.rent.expectedNetMonthlyUsd ?? "?"}/mo · ${p.band}`);

console.log(`\n=== ALL GPU SUBNETS BY CONVICTION ===`);
for (const p of gpuPicks) {
  const o = p.o;
  const rent = o.gpuMonthlyCostUsd ?? o.estimatedGpuRentUsd ?? null;
  console.log(`SN${String(o.netuid).padStart(3)} ${String(o.name ?? "").slice(0,16).padEnd(16)} band=${p.band.padEnd(8)} conv=${String(p.conviction).padStart(2)} ` +
    `vram=${String(o.minVramGb ?? "?").padStart(3)}GB rent=$${rent ?? "?"}/mo net=$${Math.round(o.netMonthlyUsd ?? 0)} earnChance=${o.earnChance?.pct ?? "?"}% ` +
    `rewarded=${o.rewardedRatio != null ? Math.round(o.rewardedRatio*100)+"%" : "?"} top10=${o.top10IncentiveShare != null ? Math.round(o.top10IncentiveShare*100)+"%" : "?"}`);
  for (const r of p.reasons.slice(0, 2)) console.log(`     ↳ ${r}`);
}
const bands = { PRIME: 0, READY: 0, MARGINAL: 0, "NO-GO": 0 };
for (const p of gpuPicks) bands[p.band as keyof typeof bands]++;
console.log(`\nGPU band counts:`, JSON.stringify(bands));
