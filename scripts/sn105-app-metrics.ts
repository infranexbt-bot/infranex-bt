// Pull SN105 metrics from the app's own /api/network (uses the app's price feed).
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
  const snap = await res.json();
  const s = (snap.subnets ?? []).find((x: any) => x.netuid === 105);
  console.log(JSON.stringify({
    taoPriceUsd: snap.taoPriceUsd,
    blockNumber: snap.blockNumber,
    sn105: s ? {
      name: s.name,
      alphaPriceTao: s.movingPrice,
      alphaPriceUsd: s.movingPrice ? +(s.movingPrice * snap.taoPriceUsd).toFixed(5) : null,
      alphaChange24hPct: s.alphaChange24h,
      minersCount: s.minersCount,
      maxUids: s.maxUids,
      rewardedMiners: s.rewardedMiners,
      minerEmissionTaoPerDay: s.minerEmissionTaoPerDay,
      subnetTao: s.subnetTao,
      burnCostTao: s.burnCostTao,
      emissionEnabled: s.emissionEnabled,
      identityDescription: s.identityDescription,
    } : null,
  }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
