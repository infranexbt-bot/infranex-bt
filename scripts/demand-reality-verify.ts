// DEMAND-REALITY verification: login → /api/network → mergeOpportunities.
// Shows the composite demand score + 4 parts for key subnets, band
// distribution across ALL subnets, and the extremes. Honest-dollars cross-check.
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
  console.log("network:", res.status, "| taoUsd:", data.taoPriceUsd, "| block:", data.blockNumber, "| source:", data.source);

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const rows = mergeOpportunities(data);
  console.log(`opportunities: ${rows.length}\n`);

  const bandLabel = (b: string | null | undefined) =>
    b === "real-demand" ? "GREEN real-demand" : b === "mixed" ? "AMBER mixed" : b === "emission-funded" ? "RED emission-funded" : "—";

  const show = [105, 64, 67, 2, 101, 4, 1];
  console.log("net | demand | band | inflow-part | trend-part | pool-part | seat-part | name");
  for (const n of show) {
    const r = rows.find((x: any) => x.netuid === n);
    if (!r) continue;
    const part = (k: string) => r.demandParts?.find((p: any) => p.key === k)?.score ?? "—";
    console.log(
      `${String(n).padStart(3)} | ${String(r.demandScore ?? "—").padStart(6)} | ${bandLabel(r.demandBand).padEnd(19)} | ${String(part("inflow")).padStart(11)} | ${String(part("trend")).padStart(10)} | ${String(part("pool")).padStart(9)} | ${String(part("seats")).padStart(9)} | ${r.subnetName}`
    );
  }

  // Band distribution across ALL subnets
  const dist: Record<string, number> = { "real-demand": 0, mixed: 0, "emission-funded": 0, "null": 0 };
  for (const r of rows) dist[String(r.demandBand ?? "null")]++;
  console.log("\nband distribution:", JSON.stringify(dist));

  // Extremes: top green, top red
  const scored = rows.filter((r: any) => r.demandScore != null);
  const green = scored.filter((r: any) => r.demandBand === "real-demand").sort((a: any, b: any) => b.demandScore - a.demandScore).slice(0, 5);
  const red = scored.filter((r: any) => r.demandBand === "emission-funded").sort((a: any, b: any) => a.demandScore - b.demandScore).slice(0, 5);
  console.log("\ntop real-demand:");
  for (const r of green) console.log(`SN${r.netuid} ${r.subnetName}: ${r.demandScore} (${bandLabel(r.demandBand)})`);
  console.log("\nworst emission-funded:");
  for (const r of red) console.log(`SN${r.netuid} ${r.subnetName}: ${r.demandScore} | dilution ${(r.dilutionRatio ?? 0).toFixed(0)}x`);

  // Part detail for Beam (the user's subnet)
  const beam = rows.find((r: any) => r.netuid === 105);
  console.log(`\nBeam SN105 demand ${beam.demandScore} (${beam.demandBand}):`);
  for (const p of beam.demandParts ?? []) {
    console.log(`  ${p.label} [w${Math.round(p.weight * 100)}%]: ${p.score ?? "—"} — ${p.detail}`);
  }

  // Sanity: scores within 0-100, bands consistent with thresholds
  let bad = 0;
  for (const r of scored) {
    if (r.demandScore < 0 || r.demandScore > 100) bad++;
    if (r.demandScore >= 65 && r.demandBand !== "real-demand") bad++;
    if (r.demandScore >= 40 && r.demandScore < 65 && r.demandBand !== "mixed") bad++;
    if (r.demandScore < 40 && r.demandBand !== "emission-funded") bad++;
  }
  console.log(`\nsanity violations: ${bad}/${scored.length} scored rows`);
  console.log(`unscored (all signals missing): ${rows.length - scored.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
