// GPU-COMPARE — model three owned-GPU profiles (RTX 6000 Ada 48GB / PRO 6000
// Blackwell Workstation 96GB / PRO 6000 Blackwell Server 96GB) through the app's
// exact conviction engine, list rentable subnets per card, gated-out subnets,
// and which subnets recommend each card class.
// Run: bun --smol scripts/gpu-compare.ts

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
  { key: "ada-48", label: "RTX 6000 Ada (48GB, no TEE)", vram: 48, tee: false },
  { key: "pro6000-ws", label: "PRO 6000 Blackwell Workstation (96GB, no TEE per NVIDIA matrix)", vram: 96, tee: false },
  { key: "pro6000-srv", label: "PRO 6000 Blackwell Server (96GB, TEE SPT-CC)", vram: 96, tee: true },
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
    if (o.gpuCount != null) entry.gpuCount = o.gpuCount;
    overrides.set(o.netuid, entry);
  }

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const { computeMinePick } = await import("../src/lib/infranex/mine-pick");
  const { costBasisFromConfig } = await import("../src/lib/infranex/rent-earn");

  const opps = mergeOpportunities(snap, profConfig, overrides);

  // Distinct recommended-GPU strings (what the ledger recommends per subnet)
  console.log("=== SUBNET -> RECOMMENDED GPU (from ledger overrides) ===");
  const gpuMap = (opps as any[])
    .filter((o) => o.recommendedGpu)
    .map((o) => `SN${o.netuid} ${String(o.subnetName).slice(0, 14).padEnd(14)} minVram=${String(o.minVramGb).padStart(3)}GB -> ${o.recommendedGpu}${o.gpuCount > 1 ? " x" + o.gpuCount : ""}`);
  console.log(gpuMap.join("\n"));

  for (const prof of PROFILES) {
    const basis = { ...costBasisFromConfig(profConfig), mode: "owned" as const, rigVramGb: prof.vram, rigTeeCapable: prof.tee };
    const scored = (opps as any[]).map((o) => ({ o, p: computeMinePick(o, basis) }));
    const rentable = scored.filter((r) => r.p.rent.rentable);
    const blocked = scored.filter((r) => !r.p.rent.rentable);
    const vramBlocked = blocked.filter((r) => (r.p.rent.rentBlock ?? "").includes("VRAM") || (r.p.rent.rentBlock ?? "").toLowerCase().includes("gb"));
    const teeBlocked = blocked.filter((r) => !vramBlocked.includes(r));

    const counts = { RUN: 0, WATCH: 0, AVOID: 0 } as Record<string, number>;
    for (const r of rentable) counts[r.p.verdict] = (counts[r.p.verdict] ?? 0) + 1;

    console.log(`\n${"=".repeat(84)}\nPROFILE: ${prof.label}\n  rentable ${rentable.length}/${scored.length} subnets | RUN ${counts.RUN} · WATCH ${counts.WATCH} · AVOID ${counts.AVOID}`);
    console.log(`  VRAM-blocked (${vramBlocked.length}): ${vramBlocked.map((r) => `SN${r.o.netuid} needs ${r.o.minVramGb}GB`).join(", ") || "(none)"}`);
    console.log(`  TEE-blocked (${teeBlocked.length}): ${teeBlocked.map((r) => `SN${r.o.netuid} ${String(r.o.subnetName).slice(0, 10)}`).join(", ") || "(none)"}`);

    const top = rentable.sort((a, b) => b.p.conviction - a.p.conviction).slice(0, 12);
    console.log(`  TOP PICKS (conviction desc):`);
    for (const { o, p } of top) {
      console.log(
        `    SN${String(o.netuid).padStart(3)} ${String(o.subnetName).slice(0, 12).padEnd(12)} ` +
        `${String(p.conviction).padStart(3)} ${p.verdict.padEnd(6)} EV $${String(Math.round(p.rent.expectedNetMonthlyUsd ?? 0)).padStart(5)}/mo ` +
        `netP&L $${String(Math.round(o.netMonthlyUsd)).padStart(5)}/mo rewarded ${(o.rewardedRatio * 100).toFixed(0).padStart(3)}% ` +
        `seats ${o.freeSlots}/${o.totalSlots} top10 ${(o.top10IncentiveShare * 100).toFixed(0)}% minVram ${o.minVramGb}GB`
      );
    }
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
