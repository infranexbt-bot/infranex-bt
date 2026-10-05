// SN116 NO-GO diagnosis: run rent-earn + 14-stage diligence + mine-pick
// on the live merged row and print every gate that fires.
import { readFileSync } from "node:fs";

async function main() {
  const users = JSON.parse(readFileSync("/home/z/my-project/scripts/users.local.json", "utf8"));
  const admin = users.find((u: any) => u.role === "admin" && u.code);
  const base = "http://localhost:3000";
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: admin.userId, code: admin.code }),
  });
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c: string) => c.split(";")[0]).join("; ");
  const res = await fetch(`${base}/api/network`, { headers: { cookie } });
  const data = await res.json();

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const rows = mergeOpportunities(data);
  const o: any = rows.find((r: any) => r.netuid === 116);
  if (!o) { console.log("SN116 not found"); return; }

  console.log(`SN116 ${o.subnetName} | ${o.workType} | GPU: ${o.recommendedGpu} ${o.minVramGb}GB x${o.gpuCount ?? 1}`);
  console.log(`netMonthlyUsd: $${o.netMonthlyUsd} | meetsMinimum: ${o.meetsMinimum} | verdict: ${o.verdict}`);
  console.log(`rewardedRatio: ${o.rewardedRatio} | top10Share: ${o.top10IncentiveShare} | rewardMedianShare: ${o.rewardMedianShare}`);
  console.log(`liquidityTao: ${o.liquidityTao} | slippagePct: ${o.slippagePct} | realizability: ${o.rewardRealizability}`);
  console.log(`freeSlots: ${o.freeSlots}/${o.totalSlots} | burn: ${o.burnCostTao} | hosting: ${JSON.stringify(o.hosting)}`);
  console.log(`dilutionRatio: ${o.dilutionRatio} | alphaChange24h: ${o.alphaChange24h} | demandScore: ${o.demandScore} (${o.demandBand})`);
  console.log(`earnChance: ${JSON.stringify(o.earnChance)}`);
  console.log(`gpuCostMonthlyUsd: $${o.gpuCostMonthlyUsd} | requirementsSource: ${o.requirementsSource}\n`);

  const { computeRentEarn } = await import("../src/lib/infranex/rent-earn");
  const { computeDiligence } = await import("../src/lib/infranex/diligence");
  const { computeMinePick } = await import("../src/lib/infranex/mine-pick");

  const rent = computeRentEarn(o);
  console.log(`RENT-EARN: score ${rent.score} band ${rent.band} | rentable: ${rent.rentable}${rent.rentBlock ? ` | BLOCK: ${rent.rentBlock} (${rent.rentBlockSource})` : ""}`);
  console.log(`  knifeFight: ${rent.knifeFight} | whaleMean: ${rent.whaleMean} | entry: ${rent.entry} | EV: ${rent.expectedNetMonthlyUsd}\n`);

  const dil = computeDiligence(o);
  console.log(`DILIGENCE: verdict ${dil.verdict} | fails ${dil.failCount} warns ${dil.warnCount} | ${dil.verdictReason}`);
  for (const s of dil.stages) {
    const flag = s.status === "fail" ? " ❌ FAIL" : s.status === "warn" ? " ⚠ warn" : "";
    console.log(`  ${String(s.n).padStart(2)} ${s.label}: ${s.value}${flag}`);
  }

  const pick = computeMinePick(o);
  console.log(`\nMINE-PICK: conviction ${pick.conviction} band ${pick.band} (hardware ${pick.hardware})`);
  console.log("reasons:");
  for (const r of pick.reasons) console.log(`  - ${r}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
