// Verify the honest price/units fix end-to-end: login → /api/network →
// mergeOpportunities → print SN105 vs reference subnets (SN64, SN1).
import { readFileSync } from "node:fs";

async function main() {
  const users = JSON.parse(readFileSync("/home/z/my-project/scripts/users.local.json", "utf8"));
  const admin = users.find((u: any) => u.role === "admin" && u.code);
  if (!admin) throw new Error("no admin code in mirror");
  const base = "http://localhost:3000";

  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: admin.userId, code: admin.code }),
  });
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c: string) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("no session cookie");

  const res = await fetch(`${base}/api/network`, { headers: { cookie } });
  const data = await res.json();
  console.log("network status:", res.status, "| taoUsd:", data.taoPriceUsd, "| block:", data.blockNumber, "| source:", data.source);

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const rows = mergeOpportunities(data);
  const taoUsd = data.taoPriceUsd || 0;
  console.log("\nnetuid | α price TAO | ($/α) | EMA ref | taoInflow/day | minerEm/day | per-earning | gross $/mo | pool TAO");
  for (const n of [105, 64, 1, 67]) {
    const r = rows.find((x: any) => x.netuid === n);
    const live = r?.livePrice != null ? null : null;
    // live metrics come through the merged subnet's live field via the row:
    const row = rows.find((x: any) => x.netuid === n) as any;
    if (!row) { console.log(`SN${n}: not in ranking`); continue; }
    const mp = row.livePrice ?? 0;
    const ema = (data.subnets as any[]).find((s) => s.netuid === n)?.emaMovingPrice ?? null;
    const inflow = (data.subnets as any[]).find((s) => s.netuid === n)?.taoInflowTaoPerDay ?? null;
    const perEarn = row.perEarningMeanDailyTao ?? 0;
    console.log(
      `SN${String(n).padStart(3)} | ${mp.toFixed(6)} | $${(mp * taoUsd).toFixed(2)} | ${ema ? ema.toFixed(6) : "-"} | ${inflow ? inflow.toFixed(2) : "-"} | ${(row.grossMonthlyUsd && perEarn ? (row.grossMonthlyUsd / (30 * taoUsd)).toFixed(4) : "0")} | ${perEarn.toFixed(5)} | $${row.grossMonthlyUsd}/mo | ${row.liveStake}`
    );
  }

  const sn105 = rows.find((r: any) => r.netuid === 105) as any;
  if (sn105) {
    console.log("\nSN105 detail:");
    console.log("  category:", sn105.category, "| GPU:", sn105.recommendedGpu, "| minVram:", sn105.minVramGb);
    console.log("  netMonthlyUsd:", sn105.netMonthlyUsd, "| alphaPriceUsd:", sn105.alphaPriceUsd?.toFixed(3));
    console.log("  rewardedRatio:", sn105.rewardedRatio, "| freeSlots:", sn105.freeSlots, "| totalSlots:", sn105.totalSlots);
    console.log("  slippagePct:", sn105.slippagePct, "| liquidityTao:", sn105.liquidityTao);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
