// RENT-EARN audit — extend the RUN-subnet audit with the new rent-earn verdicts
import { mergeOpportunities } from "../src/lib/infranex/live-merge";
import { opportunityBand } from "../src/lib/utils";
import { computeRentEarn } from "../src/lib/infranex/rent-earn";

const BASE = "http://localhost:3000";
const users = require("../scripts/users.local.json");
const admin = users.find((u: any) => u.userId === "admin");

async function main() {
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: admin.userId, code: admin.code }),
  });
  if (!loginRes.ok) throw new Error(`login ${loginRes.status}`);
  const cookie = (loginRes.headers.get("set-cookie") ?? "").split(";")[0];
  const H = { cookie };

  const [snap, prof, ovr] = await Promise.all([
    fetch(`${BASE}/api/network`, { headers: H }).then((r) => r.json()),
    fetch(`${BASE}/api/profitability-config`, { headers: H }).then((r) => r.json()),
    fetch(`${BASE}/api/subnet-overrides`, { headers: H }).then((r) => r.json()),
  ]);
  const overrides = new Map<number, Record<string, unknown>>(
    (Array.isArray(ovr) ? ovr : ovr.overrides ?? []).map((o: any) => [o.netuid, o])
  );
  const opps = mergeOpportunities(snap, prof, overrides);
  const run = opps.filter((o) => opportunityBand(o).label === "RUN");

  const rows = run.map((o: any) => {
    const r = computeRentEarn(o);
    return {
      netuid: o.netuid,
      name: o.subnetName,
      ledger: Math.round(o.score * 10) / 10,
      hw: o.minVramGb > 0 ? `${o.recommendedGpu} ${o.minVramGb}GB` : "CPU",
      net: o.netMonthlyUsd,
      band: r.band,
      rentScore: r.score,
      rentable: r.rentable,
      earnPct: r.earnChancePct,
      top10: r.top10TakePct,
      knife: r.knifeFight,
      whale: r.whaleMean,
      entry: r.entry,
      ev: r.expectedNetMonthlyUsd,
      notes: r.notes,
    };
  });
  require("fs").writeFileSync(
    "scripts/research/rent-earn-run35.json",
    JSON.stringify({ asOf: new Date().toISOString(), block: snap.blockNumber, rows }, null, 2)
  );

  const order: Record<string, number> = { GREAT: 0, OK: 1, POOR: 2, NO: 3 };
  rows.sort((a, b) => order[a.band] - order[b.band] || b.rentScore - a.rentScore);
  console.log(`RENT-EARN — ${rows.length} RUN subnets (block ${snap.blockNumber})`);
  for (const r of rows) {
    console.log(
      `${r.band.padEnd(5)} ${String(r.rentScore).padStart(3)}  SN${String(r.netuid).padStart(3)} ${(r.name || "").slice(0, 16).padEnd(16)} ${r.hw.padEnd(14)} ledger=${String(r.ledger).padStart(5)} net=$${String(r.net).padStart(7)} earn=${String(r.earnPct).padStart(5)}% top10=${String(r.top10).padStart(3)}% EV=$${String(r.ev).padStart(7)}${r.knife ? " ⚔knife" : ""}${r.whale && !r.knife ? " ⚠whale-mean" : ""}${!r.rentable ? " 🚫no-rent" : ""}`
    );
  }
  const counts = rows.reduce((m: any, r) => ((m[r.band] = (m[r.band] ?? 0) + 1), m), {});
  console.log("bands:", JSON.stringify(counts));
}
main().catch((e) => { console.error(e); process.exit(1); });
