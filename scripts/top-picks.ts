// TOP-PICKS — rank all subnets for the user's rig (owned basis) and print the
// top 8 by conviction with verdict + EV, to answer "what should I run instead".
// Run: bun --smol scripts/top-picks.ts

const BASE = "http://127.0.0.1:3000";

async function api<T>(path: string): Promise<T> {
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: process.env.INFRANEX_ADMIN_CODE ?? "" }),
  });
  if (!login.ok) throw new Error("login failed");
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const res = await fetch(BASE + path, { headers: { cookie } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

async function main() {
  const snap = await api<any>("/api/network");
  const profConfig = await api<any>("/api/profitability-config");
  const ovrJson = await api<any>("/api/subnet-overrides");

  const overrides = new Map<number, Record<string, unknown>>();
  for (const o of ovrJson.overrides as any[]) {
    const entry: Record<string, unknown> = {};
    if (o.name) entry.name = o.name;
    if (o.minVramGb != null) entry.minVramGb = o.minVramGb;
    if (o.recommendedGpu) entry.recommendedGpu = o.recommendedGpu;
    if (o.gpuCount != null) entry.gpuCount = o.gpuCount;
    overrides.set(o.netuid, entry);
  }

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const { computeMinePick } = await import("../src/lib/infranex/mine-pick");
  const { costBasisFromConfig } = await import("../src/lib/infranex/rent-earn");

  const opps = mergeOpportunities(snap, profConfig, overrides);
  const basis = { ...costBasisFromConfig(profConfig), mode: "owned" as const, rigVramGb: 96, rigTeeCapable: true };

  const rows = opps
    .map((o: any) => ({ o, p: computeMinePick(o, basis) }))
    .filter((r: any) => r.p.rent.rentable)
    .sort((a: any, b: any) => b.p.conviction - a.p.conviction)
    .slice(0, 8);

  console.log("TOP 8 FOR YOUR RIG (owned, 96GB, TEE-capable, $0.12/kWh)");
  console.log("=".repeat(78));
  for (const { o, p } of rows as any[]) {
    console.log(
      `SN${String(o.netuid).padStart(3)} ${String(o.subnetName).slice(0, 12).padEnd(12)} ` +
      `conviction ${String(p.conviction).padStart(3)} ${p.verdict.padEnd(6)} ` +
      `EV $${String(Math.round(p.rent.expectedNetMonthlyUsd ?? 0)).padStart(5)}/mo ` +
      `rewarded ${(o.rewardedRatio * 100).toFixed(0)}% seats ${o.freeSlots}/${o.totalSlots} ` +
      `top10 ${(o.top10IncentiveShare * 100).toFixed(0)}%`
    );
  }
  console.log("\nSN64 for comparison:");
  const ch = (opps as any[]).find((o) => o.netuid === 64);
  const pc = computeMinePick(ch, basis);
  console.log(
    `SN64  Chutes       conviction ${pc.conviction} ${pc.verdict}  EV $${Math.round(pc.rent.expectedNetMonthlyUsd ?? 0)}/mo  ` +
    `rewarded ${(ch.rewardedRatio * 100).toFixed(0)}% seats ${ch.freeSlots}/${ch.totalSlots} top10 ${(ch.top10IncentiveShare * 100).toFixed(0)}%`
  );
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
