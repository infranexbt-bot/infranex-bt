// RUN-SUBNET AUDIT — replicate the Opportunities page exactly:
// /api/network + /api/profitability-config + /api/subnet-overrides
// → mergeOpportunities → opportunityBand → dump every RUN row with full metrics.
import { mergeOpportunities } from "../src/lib/infranex/live-merge";
import { opportunityBand } from "../src/lib/utils";

const BASE = "http://localhost:3000";
const users = require("../scripts/users.local.json");
const admin = users.find((u: any) => u.userId === "admin");

async function main() {
  // 1. login → session cookie
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: admin.userId, code: admin.code }),
  });
  if (!loginRes.ok) throw new Error(`login ${loginRes.status}`);
  const setCookie = loginRes.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  const H = { cookie };

  // 2. fetch the three data sources the view uses
  const [snap, prof, ovr] = await Promise.all([
    fetch(`${BASE}/api/network`, { headers: H }).then((r) => r.json()),
    fetch(`${BASE}/api/profitability-config`, { headers: H }).then((r) => r.json()),
    fetch(`${BASE}/api/subnet-overrides`, { headers: H }).then((r) => r.json()),
  ]);
  console.log("taoPriceUsd:", snap.taoPriceUsd, "source:", snap.source, "subnets:", snap.subnets?.length, "block:", snap.blockNumber);
  const overrides = new Map<number, Record<string, unknown>>(
    (Array.isArray(ovr) ? ovr : ovr.overrides ?? []).map((o: any) => [o.netuid, o])
  );

  // 3. merge + band exactly like the UI
  const opps = mergeOpportunities(snap, prof, overrides);
  const run = opps.filter((o) => opportunityBand(o).label === "RUN");
  const watch = opps.filter((o) => opportunityBand(o).label === "WATCH").length;
  const avoid = opps.filter((o) => opportunityBand(o).label === "AVOID").length;
  console.log(`bands: RUN=${run.length} WATCH=${watch} AVOID=${avoid} total=${opps.length}`);

  const slim = run.map((o: any) => ({
    netuid: o.netuid,
    name: o.subnetName,
    score: Math.round(o.score * 10) / 10,
    action: opportunityBand(o).label,
    workType: o.workType ?? null,
    recommendedGpu: o.recommendedGpu ?? null,
    minVramGb: o.minVramGb,
    requirementsSource: o.requirementsSource ?? null,
    hardwareClassified: o.hardwareClassified ?? false,
    hosting: o.hosting ? { bareMetalOnly: o.hosting.bareMetalOnly ?? false, teeRequired: o.hosting.teeRequired ?? false, note: o.hosting.note ?? null } : null,
    minerCount: o.minerCount ?? null,
    emissionTaoPerDay: o.emissionTaoPerDay ?? o.dailyEmission ?? null,
    estimatedDailyReward: o.estimatedDailyReward ?? null,
    netMonthlyUsd: o.netMonthlyUsd ?? null,
    roiMonthlyPct: o.profitability?.roiMonthlyPct ?? null,
    gpuCostMonthlyUsd: o.gpuCostMonthlyUsd ?? null,
    revenueMonthlyUsd: o.profitability?.revenueMonthlyUsd ?? o.revenueMonthlyUsd ?? null,
    perMinerSharePct: o.perMinerSharePct ?? null,
    alphaPrice: o.alphaPrice ?? o.alphaPriceUsd ?? null,
    alphaChange24h: o.alphaChange24h ?? null,
    riskLevel: o.riskLevel ?? null,
    confidence: o.confidence ?? null,
    meetsMinimum: o.meetsMinimum,
    breakdown: o.scoreBreakdown ?? o.breakdown ?? null,
    raw: undefined,
  }));
  require("fs").writeFileSync("scripts/research/run-subnets.json", JSON.stringify({ asOf: new Date().toISOString(), block: snap.blockNumber, taoPriceUsd: snap.taoPriceUsd, counts: { RUN: run.length, WATCH: watch, AVOID: avoid }, run }, null, 2));
  // full dump for deep analysis
  require("fs").writeFileSync("scripts/research/run-subnets-full.json", JSON.stringify(run, null, 2));
  console.log("saved scripts/research/run-subnets.json + run-subnets-full.json");
  for (const r of slim) {
    console.log(
      `SN${String(r.netuid).padStart(3)} ${String(r.name).slice(0, 26).padEnd(26)} score=${String(r.score).padStart(5)} vram=${String(r.minVramGb).padStart(4)} gpu=${String(r.recommendedGpu ?? "-").padEnd(10)} net=${String(r.netMonthlyUsd ?? "-").padStart(6)}/mo miners=${r.minerCount ?? "-"} dailyTAO=${r.estimatedDailyReward ?? "-"}`
    );
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
