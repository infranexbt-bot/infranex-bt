// Post-fix verification: dollars must now be realizable-based for ALL subnets.
// login → /api/network → mergeOpportunities → key subnets table + extremes.
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

  const show = [105, 64, 67, 2, 101, 4, 1];
  console.log("net | spot $/α | realizable $/α | realiz % | dilution | newcomer TAO/d | gross $/mo | net $/mo | name");
  for (const n of show) {
    const r = rows.find((x: any) => x.netuid === n);
    if (!r) continue;
    const spot = r.alphaPriceUsd != null ? `$${r.alphaPriceUsd.toFixed(4)}` : "—";
    const real = r.realizableAlphaPriceUsd != null ? `$${r.realizableAlphaPriceUsd.toFixed(4)}` : "—";
    const pct = r.rewardRealizability != null ? (r.rewardRealizability * 100).toFixed(1) + "%" : "—";
    const dil = r.dilutionRatio != null ? r.dilutionRatio.toFixed(1) + "x" : "—";
    console.log(
      `${String(n).padStart(3)} | ${spot.padStart(9)} | ${real.padStart(9)} | ${pct.padStart(7)} | ${dil.padStart(9)} | ${r.estimatedDailyReward.toFixed(4)} | ${String(r.grossMonthlyUsd ?? "—").padStart(6)} | ${String(r.netMonthlyUsd ?? "—").padStart(6)} | ${r.subnetName}`
    );
  }

  // Extremes: biggest haircuts — confirm the ledger actually bites.
  const hair = rows
    .filter((r: any) => r.rewardRealizability != null)
    .sort((a: any, b: any) => a.rewardRealizability - b.rewardRealizability)
    .slice(0, 8);
  console.log("\nbiggest realizable haircuts:");
  for (const r of hair) {
    console.log(
      `SN${r.netuid} ${r.subnetName}: realizability ${(r.rewardRealizability * 100).toFixed(2)}% | spot $${(r.alphaPriceUsd ?? 0).toFixed(4)} → realizable $${(r.realizableAlphaPriceUsd ?? 0).toFixed(4)} | dilution ${r.dilutionRatio?.toFixed(0) ?? "—"}x | gross $${r.grossMonthlyUsd}/mo`
    );
  }

  // Deep-pool control: haircuts must be ~0 where pools are deep.
  const deep = rows
    .filter((r: any) => (r.liquidityTao ?? 0) > 50000 && r.rewardRealizability != null)
    .sort((a: any, b: any) => b.liquidityTao - a.liquidityTao)
    .slice(0, 5);
  console.log("\ndeep-pool control (liquidity > 50k TAO — haircut should be tiny):");
  for (const r of deep) {
    console.log(
      `SN${r.netuid} ${r.subnetName}: liq ${Math.round(r.liquidityTao)} TAO | realizability ${(r.rewardRealizability * 100).toFixed(2)}% | gross $${r.grossMonthlyUsd}/mo`
    );
  }

  const noRealiz = rows.filter((r: any) => r.rewardRealizability == null).length;
  console.log(`\nrows missing realizability (null → treated as 1): ${noRealiz}/${rows.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
