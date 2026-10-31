// GPU-SUBNET-LIST — enumerate EVERY subnet and which of the three GPUs
// (RTX 6000 Ada 48GB / PRO 6000 Blackwell WS 96GB / PRO 6000 Blackwell Server 96GB)
// can run it, with conviction + verdict + EV + seat facts per card.
// Run: bun --smol scripts/gpu-subnet-list.ts

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

const PROFILES = [
  { key: "A", vram: 48, tee: false },  // RTX 6000 Ada
  { key: "W", vram: 96, tee: false },  // PRO 6000 Blackwell Workstation
  { key: "S", vram: 96, tee: true },   // PRO 6000 Blackwell Server
];

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
    overrides.set(o.netuid, entry);
  }

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const { computeMinePick } = await import("../src/lib/infranex/mine-pick");
  const { costBasisFromConfig } = await import("../src/lib/infranex/rent-earn");

  const opps = mergeOpportunities(snap, profConfig, overrides);
  const bases = PROFILES.map((p) => ({ key: p.key, basis: { ...costBasisFromConfig(profConfig), mode: "owned" as const, rigVramGb: p.vram, rigTeeCapable: p.tee } }));

  const rows = (opps as any[]).map((o) => {
    const picks: Record<string, any> = {};
    for (const { key, basis } of bases) picks[key] = computeMinePick(o, basis);
    return { o, picks };
  });

  const fmt = (p: any) => p.rent.rentable ? `${String(p.conviction).padStart(3)} ${p.verdict.padEnd(5)} $${String(Math.round(p.rent.expectedNetMonthlyUsd ?? 0)).padStart(4)}` : "gated";
  const seatFacts = (o: any) => `rew ${(o.rewardedRatio * 100).toFixed(0).padStart(3)}% seats ${o.freeSlots}/${o.totalSlots} top10 ${(o.top10IncentiveShare * 100).toFixed(0)}%`;

  const gpuRows = rows.filter((r) => (r.o.minVramGb ?? 0) > 0);
  const cpuRows = rows.filter((r) => (r.o.minVramGb ?? 0) === 0);

  const adaFits = gpuRows.filter((r) => r.picks.A.rent.rentable).sort((a, b) => b.picks.A.conviction - a.picks.A.conviction);
  const blackwellOnly = gpuRows.filter((r) => !r.picks.A.rent.rentable && r.picks.W.rent.rentable).sort((a, b) => b.picks.W.conviction - a.picks.W.conviction);
  const serverOnly = gpuRows.filter((r) => !r.picks.W.rent.rentable && r.picks.S.rent.rentable).sort((a, b) => b.picks.S.conviction - a.picks.S.conviction);
  const unreachable = gpuRows.filter((r) => !r.picks.S.rent.rentable).sort((a, b) => a.o.minVramGb - b.o.minVramGb);

  console.log(`GPU SUBNETS (minVram>0): ${gpuRows.length} | CPU-ONLY: ${cpuRows.length}\n`);

  console.log(`### GROUP 1 — runs on RTX 6000 Ada 48GB (also on both Blackwell) — ${adaFits.length} subnets`);
  for (const { o, picks } of adaFits)
    console.log(`  SN${String(o.netuid).padStart(3)} ${String(o.subnetName).slice(0, 13).padEnd(13)} ${String(o.minVramGb).padStart(3)}GB ${String(o.recommendedGpu ?? "").slice(0, 34).padEnd(34)} | A: ${fmt(picks.A)} | W: ${fmt(picks.W)} | S: ${fmt(picks.S)} | ${seatFacts(o)}`);

  console.log(`\n### GROUP 2 — needs >48GB → Blackwell 96GB only (WS + Server) — ${blackwellOnly.length} subnets`);
  for (const { o, picks } of blackwellOnly)
    console.log(`  SN${String(o.netuid).padStart(3)} ${String(o.subnetName).slice(0, 13).padEnd(13)} ${String(o.minVramGb).padStart(3)}GB ${String(o.recommendedGpu ?? "").slice(0, 34).padEnd(34)} | A: gated | W: ${fmt(picks.W)} | S: ${fmt(picks.S)} | ${seatFacts(o)}`);

  console.log(`\n### GROUP 3 — TEE-gated → Server Edition only — ${serverOnly.length} subnets`);
  for (const { o, picks } of serverOnly)
    console.log(`  SN${String(o.netuid).padStart(3)} ${String(o.subnetName).slice(0, 13).padEnd(13)} ${String(o.minVramGb).padStart(3)}GB ${String(o.recommendedGpu ?? "").slice(0, 34).padEnd(34)} | A: gated | W: gated | S: ${fmt(picks.S)} | ${seatFacts(o)}`);

  console.log(`\n### GROUP 4 — out of reach for all three (need 141–180GB H200/B200/B300) — ${unreachable.length} subnets`);
  console.log(`  ${unreachable.map((r) => `SN${r.o.netuid}(${r.o.minVramGb}GB)`).join(", ")}`);

  console.log(`\n### GROUP 5 — CPU-only subnets (use NO GPU) — ${cpuRows.length} subnets`);
  const cpuScored = cpuRows.map((r) => ({ ...r, best: r.picks.S })).sort((a, b) => b.best.conviction - a.best.conviction);
  console.log(`  ${cpuScored.filter((r) => r.best.verdict === "RUN").map((r) => `SN${r.o.netuid} ${r.o.subnetName} (${r.best.verdict} ${r.best.conviction})`).join(", ")}`);
  console.log(`  + ${cpuScored.length - cpuScored.filter((r) => r.best.verdict === "RUN").length} more CPU-only (AVOID) subnets`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
