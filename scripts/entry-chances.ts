// ENTRY-CHANCES — for every GPU subnet reachable by a 96GB rig (or cheap entry),
// print: entry cost class, rewarded%, top10 share, free seats, new-entrant EV,
// month-1 earn chance, and the dominant competitive moat from the playbook.
// Run: bun --smol scripts/entry-chances.ts

const BASE = "http://127.0.0.1:3000";

async function api<T>(path: string): Promise<T> {
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: process.env.INFRANEX_ADMIN_CODE ?? "" }),
  });
  if (!login.ok) throw new Error("login failed " + login.status);
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
    const e: Record<string, unknown> = {};
    if (o.minVramGb != null) e.minVramGb = o.minVramGb;
    if (o.recommendedGpu) e.recommendedGpu = o.recommendedGpu;
    if (o.gpuCount != null) e.gpuCount = o.gpuCount;
    overrides.set(o.netuid, e);
  }
  const pbJson: any = await api<any>("/api/playbook").catch(() => ({ entries: [] }));
  const pb = new Map<number, any>();
  for (const p of (pbJson.entries ?? [])) pb.set(p.netuid, p);

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const opps = mergeOpportunities(snap, profConfig, overrides);

  // GPU subnets reachable on <=96GB (fits the rig) — entry viability screen
  const gpu = opps
    .filter((o: any) => (o.minVramGb ?? 0) > 0 && (o.minVramGb ?? 0) <= 96)
    .sort((a: any, b: any) => (b.earnChance?.pct ?? 0) * (b.rewardedRatio ?? 0) - (a.earnChance?.pct ?? 0) * (a.rewardedRatio ?? 0));

  console.log("GPU SUBNETS REACHABLE WITH 96GB RIG — ENTRY VIABILITY TABLE");
  console.log("=".repeat(118));
  console.log(
    "SN    name            vRAM  seats      rew%  top10%  EV$/mo  earn1%  concentration  verdict"
  );
  for (const o of gpu as any[]) {
    const band =
      (o.rewardedRatio ?? 0) >= 0.6 ? "BROAD" :
      (o.rewardedRatio ?? 0) >= 0.25 ? "MIXED" :
      (o.top10IncentiveShare ?? 0) >= 0.95 ? "WHALE" : "SKEWED";
    console.log(
      `SN${String(o.netuid).padStart(3)} ${String(o.subnetName ?? "").slice(0, 14).padEnd(14)} ` +
      `${String(o.minVramGb).padStart(4)}GB ${String(o.freeSlots + "/" + o.totalSlots).padStart(9)} ` +
      `${(100 * (o.rewardedRatio ?? 0)).toFixed(0).padStart(4)}% ${(100 * (o.top10IncentiveShare ?? 0)).toFixed(0).padStart(5)}% ` +
      `${String(Math.round(o.netMonthlyUsd ?? 0)).padStart(7)} ${(o.earnChance?.pct ?? 0).toFixed(0).padStart(5)}% ` +
      `${band.padEnd(13)} ${o.verdict}`
    );
  }

  // Detail the 6 most viable: paid share math (what rank ~15 earns vs median)
  console.log("\n\nMOST ENTERABLE (broadest pay + open seats + <=96GB):");
  const viable = (gpu as any[]).filter((o) => (o.rewardedRatio ?? 0) >= 0.08);
  for (const o of viable.slice(0, 10)) {
    const p = pb.get(o.netuid);
    const perEarnTao = o.perEarningMeanDailyTao ?? 0;
    const price = o.alphaPriceUsd ?? 0;
    console.log(
      `\nSN${o.netuid} ${o.subnetName}: ${Math.round(100 * (o.rewardedRatio ?? 0))}% of ${o.totalSlots} slots paid → ~${Math.round((o.rewardedRatio ?? 0) * (o.totalSlots ?? 0))} earning seats. Mean earner ≈ ${perEarnTao.toFixed(3)} τα/day ≈ $${Math.round(perEarnTao * price)}/day gross. ${o.freeSlots} free seats. Month-1 earn chance ${o.earnChance?.pct ?? "?"}%.`
    );
    if (p) console.log(`   moat: ${String(p.top10Strategy ?? "").replace(/\s+/g, " ").slice(0, 220)}`);
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
