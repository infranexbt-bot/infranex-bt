// Live smoke test — the Opportunity Score against the REAL chain snapshot,
// pulled from the running dev server's warm /api/network cache.
import fs from "fs";
import path from "path";
import { computeOpportunityScore } from "../src/lib/infranex/opportunity-score";
import { DEFAULT_PROFITABILITY_CONFIG } from "../src/lib/infranex/profitability";
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
if (!cookie) {
  console.error("login failed");
  process.exit(1);
}
const res = await fetch(`${BASE}/api/network`, { cache: "no-store", headers: { cookie } });
if (!res.ok) {
  console.error(`/api/network ${res.status}`);
  process.exit(1);
}
const snap = (await res.json()) as LiveNetworkSnapshot;
console.log(`source=${snap.source} block=${snap.blockNumber} subnets=${snap.subnets.length} TAO=$${snap.taoPriceUsd}`);

const r = computeOpportunityScore(snap, { capitalTao: 10, profConfig: DEFAULT_PROFITABILITY_CONFIG });

console.log("\n=== HOME CARD PAYLOAD ===");
console.log(JSON.stringify({
  score: r.score,
  liveData: r.liveData,
  recommended: {
    strategy: r.recommended.strategy,
    title: r.recommended.title,
    netuid: r.recommended.netuid,
    roiMonthlyPct: r.recommended.roiMonthlyPct,
    netMonthlyUsd: r.recommended.netMonthlyUsd,
    netMonthlyInr: r.recommended.netMonthlyInr,
    taoPerMonth: r.recommended.taoPerMonth,
    gpu: r.recommended.requiredGpu ?? null,
    risk: r.recommended.riskLevel,
    confidence: r.recommended.confidence,
  },
  alternative: {
    strategy: r.alternative.strategy,
    title: r.alternative.title,
    roiMonthlyPct: r.alternative.roiMonthlyPct,
    taoPerMonth: r.alternative.taoPerMonth,
    netMonthlyInr: r.alternative.netMonthlyInr,
    risk: r.alternative.riskLevel,
  },
  stakingRootNetApy: r.stakingRoot.netApyPct,
  stakingRootSource: r.stakingRoot.source,
  stakingTopSubnet: r.stakingTopSubnet ? { netuid: r.stakingTopSubnet.netuid, netApyPct: r.stakingTopSubnet.netApyPct, risk: r.stakingTopSubnet.riskLevel } : null,
  closeCall: r.closeCall,
  notes: r.notes,
}, null, 2));
