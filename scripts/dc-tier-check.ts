// DC-TIER-CHECK — score the 141GB (H200) and 288GB (B300) fleet tiers through
// the exact conviction engine, to see what a datacenter-class card unlocks.
// Run: bun --smol scripts/dc-tier-check.ts

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

const TIERS = [
  { key: "H100 80GB", vram: 80, tee: false },
  { key: "H200 141GB", vram: 141, tee: true },
  { key: "B300 288GB", vram: 180, tee: true },
];

async function main() {
  const snap = await api<any>("/api/network");
  const profConfig = await api<any>("/api/profitability-config");
  const ovrJson = await api<any>("/api/subnet-overrides");

  const overrides = new Map<number, Record<string, unknown>>();
  for (const o of ovrJson.overrides as any[]) {
    const e: Record<string, unknown> = {};
    if (o.name) e.name = o.name;
    if (o.minVramGb != null) e.minVramGb = o.minVramGb;
    if (o.recommendedGpu) e.recommendedGpu = o.recommendedGpu;
    overrides.set(o.netuid, e);
  }

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const { computeMinePick } = await import("../src/lib/infranex/mine-pick");
  const { costBasisFromConfig } = await import("../src/lib/infranex/rent-earn");

  const opps = mergeOpportunities(snap, profConfig, overrides);

  for (const t of TIERS) {
    const basis = { ...costBasisFromConfig(profConfig), mode: "owned" as const, rigVramGb: t.vram, rigTeeCapable: t.tee };
    const scored = (opps as any[])
      .map((o) => ({ o, p: computeMinePick(o, basis) }))
      .filter((r) => r.p.rent.rentable)
      .sort((a, b) => b.p.conviction - a.p.conviction);
    const counts = { RUN: 0, WATCH: 0, AVOID: 0 } as Record<string, number>;
    for (const r of scored) counts[r.p.verdict]++;
    console.log(`\n=== TIER ${t.key}: ${scored.length} rentable | RUN ${counts.RUN} · WATCH ${counts.WATCH} · AVOID ${counts.AVOID} ===`);
    // top 10 + any non-AVOID
    const top = scored.slice(0, 10);
    for (const { o, p } of top) {
      console.log(
        `  SN${String(o.netuid).padStart(3)} ${String(o.subnetName).slice(0, 13).padEnd(13)} ` +
        `${String(p.conviction).padStart(3)} ${p.verdict.padEnd(6)} EV $${String(Math.round(p.rent.expectedNetMonthlyUsd ?? 0)).padStart(5)}/mo ` +
        `netP&L $${String(Math.round(o.netMonthlyUsd)).padStart(6)}/mo rewarded ${(o.rewardedRatio * 100).toFixed(0).padStart(3)}% ` +
        `seats ${o.freeSlots}/${o.totalSlots} gpuCount ${o.gpuCount ?? 1}`
      );
    }
    const runs = scored.filter((r) => r.p.verdict !== "AVOID");
    if (runs.length > top.filter((r) => r.p.verdict !== "AVOID").length) {
      console.log("  --- additional non-AVOID ---");
      for (const { o, p } of runs)
        if (!top.includes({ o, p } as any))
          console.log(`  SN${String(o.netuid).padStart(3)} ${String(o.subnetName).slice(0, 13).padEnd(13)} ${p.conviction} ${p.verdict} EV $${Math.round(p.rent.expectedNetMonthlyUsd ?? 0)}/mo seats ${o.freeSlots}/${o.totalSlots}`);
    }
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
