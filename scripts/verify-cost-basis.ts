/**
 * verify-cost-basis.ts — owned-GPU mode verification.
 * Replicates the browser merge (network + overrides + config →
 * mergeOpportunities → rent-earn + mine-pick) under BOTH hardwareModes and
 * reports which GPU verdicts flip. Expected: knife-fight rows stay gated
 * (seat reality is cost-independent), rent-negative broad-reward rows flip.
 */
const BASE = "http://localhost:3000";

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ userId: "admin", code: process.env.INFRANEX_ADMIN_CODE ?? "" }),
});
if (!login.ok) throw new Error("login failed");
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

const snap = await (await fetch(`${BASE}/api/network`, { headers: { cookie }, cache: "no-store" })).json();
const ov = await (await fetch(`${BASE}/api/subnet-overrides`, { headers: { cookie }, cache: "no-store" })).json() as any;
const savedConfig = await (await fetch(`${BASE}/api/profitability-config`, { headers: { cookie }, cache: "no-store" })).json() as any;

const map = new Map<number, Record<string, unknown>>();
for (const o of ov.overrides) {
  const e: Record<string, unknown> = {};
  if (o.name) e.name = o.name;
  if (o.description) e.description = o.description;
  if (o.minVramGb != null) e.minVramGb = o.minVramGb;
  if (o.recommendedGpu) e.recommendedGpu = o.recommendedGpu;
  if (o.gpuCount != null) e.gpuCount = o.gpuCount;
  if (o.hostingRequirements) { try { e.hosting = JSON.parse(String(o.hostingRequirements)); } catch {} }
  map.set(Number(o.netuid), e);
}

const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
const { computeMinePick } = await import("../src/lib/infranex/mine-pick");
const { opportunityBand } = await import("../src/lib/utils");

const run = (mode: "rent" | "owned") => {
  const config = { ...savedConfig, hardwareMode: mode };
  const rows = mergeOpportunities(snap as never, config as never, map) as any[];
  const picks = rows.filter((o) => o.netuid > 0).map(computeMinePick);
  const runRows = rows.filter((o) => o.netuid > 0 && opportunityBand({ score: o.score, meetsMinimum: o.meetsMinimum, targetUsd: o.targetUsd }).label === "RUN");
  return { rows, picks, runRows };
};

const rent = run("rent");
const owned = run("owned");

const bands = (ps: any[]) => {
  const b: Record<string, number> = { PRIME: 0, READY: 0, MARGINAL: 0, "NO-GO": 0 };
  for (const p of ps) b[p.band]++;
  return b;
};

console.log(`cost basis      : RENTED            →  OWNED (electricity $${savedConfig.electricityUsdPerKwh}/kWh)`);
console.log(`dashboard bands : ${JSON.stringify(bands(rent.picks))} → ${JSON.stringify(bands(owned.picks))}`);
console.log(`RUN rows (opps) : ${rent.runRows.length} → ${owned.runRows.length}`);
console.log(`\n=== GPU rows that changed band (dashboard picker) ===`);
for (const op of owned.picks) {
  const rp = rent.picks.find((p) => p.o.netuid === op.o.netuid)!;
  if (rp.band !== op.band) {
    console.log(`SN${String(op.o.netuid).padStart(3)} ${String(op.o.subnetName ?? "").slice(0, 14).padEnd(14)} ${rp.band.padEnd(8)}(${String(rp.conviction).padStart(2)}) → ${op.band.padEnd(8)}(${String(op.conviction).padStart(2)})  net $${Math.round(rent.rows.find(r => r.netuid === op.o.netuid)?.netMonthlyUsd ?? 0).toLocaleString()} → $${Math.round(op.o.netMonthlyUsd ?? 0).toLocaleString()}/mo`);
  }
}
console.log(`\n=== New RUN rows under OWNED (opportunities page) ===`);
for (const o of owned.runRows) {
  const was = rent.runRows.some((r) => r.netuid === o.netuid);
  if (!was) console.log(`SN${String(o.netuid).padStart(3)} ${String(o.subnetName ?? "").slice(0, 14).padEnd(14)} score ${o.score} GPU="${String(o.recommendedGpu ?? "?").slice(0, 24)}" net $${Math.round(o.netMonthlyUsd ?? 0).toLocaleString()}/mo`);
}

// restore saved config in case the run mutated nothing (pure — no writes above)
console.log(`\npure simulation — persisted config untouched (hardwareMode=${savedConfig.hardwareMode})`);
