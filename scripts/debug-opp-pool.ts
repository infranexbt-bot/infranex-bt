// Debug: dump the full mining-candidate pool behind the Opportunity Score —
// how many subnets pass each filter, and what the survivors look like.
import fs from "fs";
import path from "path";
import { mergeOpportunities } from "../src/lib/infranex/use-network";
import { DEFAULT_PROFITABILITY_CONFIG } from "../src/lib/infranex/profitability";
import { computeStakingStrategies } from "../src/lib/infranex/staking";
import type { LiveNetworkSnapshot } from "../src/lib/infranex/chain";

const BASE = "http://localhost:3000";
const USERS: Array<{ userId: string; code: string }> = JSON.parse(
  fs.readFileSync(path.join(path.dirname(process.argv[1] ?? ""), "users.local.json"), "utf8")
);
async function login(): Promise<string> {
  const creds = USERS.find((u) => u.userId === "ops01") ?? USERS[0];
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: creds.userId, code: creds.code }),
  });
  const c = (r.headers.getSetCookie?.() ?? []).find((x) => x.startsWith("infranex_session="));
  return c ? c.split(";")[0] : "";
}
const cookie = await login();
if (!cookie) { console.error("login failed"); process.exit(1); }
const res = await fetch(`${BASE}/api/network`, { cache: "no-store", headers: { cookie } });
const snap = (await res.json()) as LiveNetworkSnapshot;
console.log(`source=${snap.source} subnets=${snap.subnets.length} TAO=$${snap.taoPriceUsd}`);

const all = mergeOpportunities(snap, DEFAULT_PROFITABILITY_CONFIG);
const mining = all.filter((o) => o.netuid !== 0);

const pass = mining.filter(
  (o) => o.meetsMinimum !== false && (o.netMonthlyUsd != null && o.netMonthlyUsd > 0)
);
console.log(`\nTotal mining rows: ${mining.length}`);
console.log(`Pass ALL hero-card filters (meetsMinimum && net>0): ${pass.length}\n`);

console.log("=== SURVIVORS (what the score can pick from) ===");
for (const o of pass.slice(0, 15)) {
  console.log(
    `#${String(o.netuid).padStart(3)} ${o.subnetName.slice(0, 22).padEnd(22)} ` +
    `score=${String(Math.round(o.score)).padStart(3)} roi=${String(o.profitability?.roiMonthlyPct?.toFixed(1) ?? "?").padStart(7)}% ` +
    `net=$${String(Math.round(o.netMonthlyUsd ?? 0)).padStart(6)} gross=$${String(Math.round(o.grossMonthlyUsd ?? 0)).padStart(7)} ` +
    `gpu=${o.recommendedGpu} min=${o.meetsMinimum}`
  );
}

console.log("\n=== TOP 12 BY SCORE (regardless of net) — what killed the rest ===");
for (const o of mining.slice(0, 12)) {
  const p = o.profitability;
  const kill =
    o.meetsMinimum === false ? "below-min-profit" :
    (o.netMonthlyUsd ?? 0) <= 0 ? "net<=0" : "PASSES";
  console.log(
    `#${String(o.netuid).padStart(3)} ${o.subnetName.slice(0, 22).padEnd(22)} ` +
    `score=${String(Math.round(o.score)).padStart(3)} verdict=${(p?.verdict ?? "?").padEnd(7)} ` +
    `gross=$${String(Math.round(o.grossMonthlyUsd ?? 0)).padStart(7)} gpuRent=$${String(Math.round(o.gpuCostMonthlyUsd ?? 0)).padStart(5)} ` +
    `net=$${String(Math.round(o.netMonthlyUsd ?? 0)).padStart(6)} → ${kill}`
  );
}

// How many are killed purely by economics?
const netNeg = mining.filter((o) => (o.netMonthlyUsd ?? 0) <= 0).length;
const belowMin = mining.filter((o) => o.meetsMinimum === false && (o.netMonthlyUsd ?? 0) > 0).length;
console.log(`\nKilled by net<=0: ${netNeg}/${mining.length}; killed by below-minimum while net>0: ${belowMin}`);

// Staking side — what the score's staking alternatives show
const st = computeStakingStrategies(snap, { maxSubnetStrategies: 5 });
console.log("\n=== STAKING LANES ===");
console.log(`root: netApy=${st.root.netApyPct}% (source=${st.root.source})`);
for (const s of st.subnets) {
  console.log(`#${String(s.netuid).padStart(3)} ${s.name.slice(0, 22).padEnd(22)} netApy=${String(s.netApyPct).padStart(6)}% risk=${s.riskLevel}`);
}
