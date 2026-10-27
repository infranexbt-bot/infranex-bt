// WHY-704 — identify the subnet(s) whose Profit-rank "Rig rent" is ~$704/mo
// and print the full cost/rental breakdown so the number can be explained.
// Run: cd /home/z/my-project && bun scripts/why-704.ts

const BASE = "http://localhost:3000";
const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
});
if (!login.ok) throw new Error(`login failed: ${login.status}`);
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

const net = await (await fetch(`${BASE}/api/network`, { headers: { cookie }, cache: "no-store" })).json() as any;
const cfg = await (await fetch(`${BASE}/api/profitability-config`, { headers: { cookie }, cache: "no-store" })).json() as any;
const ovrRes = await (await fetch(`${BASE}/api/subnet-overrides`, { headers: { cookie }, cache: "no-store" })).json() as any;
const overrides = new Map<number, Record<string, unknown>>();
for (const o of (ovrRes.overrides ?? []) as any[]) {
  const entry: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v != null && v !== "" && k !== "netuid") entry[k] = v;
  }
  overrides.set(o.netuid, entry);
}

const { mergeOpportunities } = await import("../src/lib/infranex/live-merge.ts");
const opps = mergeOpportunities(net as never, cfg, overrides) as any[];

// Rent lines near $704/mo (allow ±30 to catch the exact row the user saw)
const hits = opps
  .filter((o) => typeof o.gpuCostMonthlyUsd === "number" && Math.abs(o.gpuCostMonthlyUsd - 704) <= 30)
  .sort((a, b) => Math.abs(a.gpuCostMonthlyUsd - 704) - Math.abs(b.gpuCostMonthlyUsd - 704));

const fmt = (n: unknown) => (typeof n === "number" ? `$${Math.round(n).toLocaleString()}` : String(n));

if (hits.length === 0) {
  console.log("no row within ±$30 of $704 — printing rent distribution instead:");
  const rents = opps
    .filter((o) => typeof o.gpuCostMonthlyUsd === "number" && o.gpuCostMonthlyUsd > 0)
    .sort((a, b) => a.gpuCostMonthlyUsd - b.gpuCostMonthlyUsd);
  for (const o of rents) {
    console.log(
      `SN${String(o.netuid).padStart(3)} ${String(o.subnetName).padEnd(14)} rent=${fmt(o.gpuCostMonthlyUsd).padStart(8)}/mo ` +
      `gpu=${o.gpuCount ?? 1}× ${o.recommendedGpu ?? "?"} class=${o.costClass ?? "?"} rev=${fmt(o.grossMonthlyUsd)} net=${fmt(o.netMonthlyUsd)}`
    );
  }
} else {
  for (const o of hits) {
    console.log(`SN${o.netuid} ${o.subnetName}`);
    console.log(`  rig rent      : ${fmt(o.gpuCostMonthlyUsd)}/mo  (${o.gpuCount ?? 1}× ${o.recommendedGpu ?? "?"} · ${o.costClass ?? "?"} rate)`);
    console.log(`  infra/opex    : ${fmt(o.infraCostMonthlyUsd)}/mo`);
    console.log(`  revenue (newcomer-adj): ${fmt(o.grossMonthlyUsd)}/mo`);
    console.log(`  net           : ${fmt(o.netMonthlyUsd)}/mo  verdict=${o.verdict ?? "—"}`);
    const perDay = (o.gpuCostMonthlyUsd ?? 0) / 30;
    const hourly = perDay / 24;
    console.log(`  => rent/day ≈ $${perDay.toFixed(2)} · per-GPU-hour ≈ $${hourly.toFixed(2)} (÷ ${o.gpuCount ?? 1} GPU)`);
  }
}
