// VERDICT-EXPLAIN — replay the app's EXACT client-side scoring (live-merge →
// mine-pick conviction) against a SAVED /api/network snapshot (/tmp/net.json
// + /tmp/pc.json + /tmp/ovr.json), then dump:
//   1. verdict counts
//   2. every RUN pick with full factor breakdown
//   3. every GPU row: verdict, conviction, and the blocking reason
//   4. blocker histogram for GPU rows
// Run: bun --smol scripts/verdict-explain.ts [--live]  (live = hit the API)

const BASE = "http://127.0.0.1:3000";
const LIVE = process.argv.includes("--live");

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

async function main() {
  let snap: any, profConfig: any, ovrJson: any;
  if (LIVE) {
    const login = await fetch(BASE + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
    });
    if (!login.ok) throw new Error("login failed");
    const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    snap = await api<any>("/api/network", { headers: { cookie } });
    profConfig = await api<any>("/api/profitability-config", { headers: { cookie } });
    ovrJson = await api<any>("/api/subnet-overrides", { headers: { cookie } });
  } else {
    const fs = await import("fs");
    snap = JSON.parse(fs.readFileSync("/tmp/net.json", "utf8"));
    profConfig = JSON.parse(fs.readFileSync("/tmp/pc.json", "utf8"));
    ovrJson = JSON.parse(fs.readFileSync("/tmp/ovr.json", "utf8"));
  }

  const overrides = new Map<number, Record<string, unknown>>();
  for (const o of ovrJson.overrides as any[]) {
    const entry: Record<string, unknown> = {};
    if (o.name) entry.name = o.name;
    if (o.description) entry.description = o.description;
    if (o.category) entry.category = o.category;
    if (o.minVramGb != null) entry.minVramGb = o.minVramGb;
    if (o.recommendedGpu) entry.recommendedGpu = o.recommendedGpu;
    if (o.gpuCount != null) entry.gpuCount = o.gpuCount;
    if (o.hostingRequirements) { try { entry.hosting = JSON.parse(o.hostingRequirements); } catch {} }
    if (o.mechanicsJson) { try { entry.mechanics = JSON.parse(o.mechanicsJson); } catch {} }
    if (o.requirementsSource) entry.requirementsSource = o.requirementsSource;
    if (o.githubUrl) entry.githubUrl = o.githubUrl;
    if (o.website) entry.website = o.website;
    overrides.set(o.netuid, entry);
  }

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const { computeMinePick } = await import("../src/lib/infranex/mine-pick");
  const { costBasisFromConfig } = await import("../src/lib/infranex/rent-earn");

  const opps = mergeOpportunities(snap, profConfig, overrides);
  // OWNED-RIG-1 — simulate the user's owned rig (RTX PRO 6000 96GB, TEE-capable)
  const basis = {
    ...costBasisFromConfig(profConfig),
    mode: "owned" as const,
    rigVramGb: 96,
    rigTeeCapable: true,
  };
  const picks = opps.map((o) => computeMinePick(o, basis));

  const count = { RUN: 0, WATCH: 0, AVOID: 0 } as Record<string, number>;
  for (const p of picks) count[p.verdict]++;

  const hw = (o: any) =>
    o.minVramGb <= 0 || (o.workType ?? "").toLowerCase().includes("cpu") || /cpu/i.test(o.recommendedGpu ?? "") ? "CPU" : "GPU";

  console.log("=== SNAPSHOT ===");
  console.log(`block ${snap.blockNumber} · TAO $${snap.taoPriceUsd} · rows scored: ${picks.length} · basis: owned + rig 96GB TEE (weights 55/25/20)`);
  console.log(`verdicts: RUN ${count.RUN} · WATCH ${count.WATCH} · AVOID ${count.AVOID}\n`);

  console.log("=== ALL RUN/WATCH PICKS (full factor breakdown) ===");
  const good = picks.filter((p) => p.verdict !== "AVOID").sort((a, b) => b.conviction - a.conviction);
  for (const p of good) {
    const o: any = p.o;
    console.log(
      `SN${o.netuid} ${o.subnetName} [${p.hardware}] verdict=${p.verdict} conviction=${p.conviction}\n` +
      `   rent-earn: score=${p.rent.score} band=${p.rent.band} | diligence health=${p.diligenceHealth} (${p.diligence.verdict}, ${p.diligence.failCount}F/${p.diligence.warnCount}W) | confidence=${p.confidencePct}\n` +
      `   earn-chance=${o.earnChance?.pct ?? "?"}% rewardedRatio=${o.rewardedRatio != null ? (o.rewardedRatio * 100).toFixed(1) : "?"}% top10Take=${o.top10IncentiveShare != null ? (o.top10IncentiveShare * 100).toFixed(0) : "?"}% freeSlots=${o.freeSlots ?? "?"} net/mo=$${Math.round(o.netMonthlyUsd ?? 0)} EV=$${p.rent.expectedNetMonthlyUsd ?? "?"}\n` +
      `   reasons: ${p.reasons.join(" | ")}`
    );
  }

  console.log("\n=== TOP 15 GPU ROWS BY CONVICTION (why not RUN) ===");
  const gpu = picks.filter((p) => p.hardware === "GPU").sort((a, b) => b.conviction - a.conviction);
  for (const p of gpu.slice(0, 15)) {
    const o: any = p.o;
    const gap = p.conviction >= 65 ? "RUN ok" : `needs +${Math.max(0, (p.band === "PRIME" ? 0 : 50 - p.conviction))} to reach READY/RUN(50), +${Math.max(0, 65 - p.conviction)} for PRIME`;
    console.log(
      `SN${o.netuid} ${o.subnetName} verdict=${p.verdict} conv=${p.conviction} band=${p.band} (${gap})\n` +
      `   rent=${p.rent.score}/${p.rent.band} dilig=${p.diligenceHealth} conf=${p.confidencePct} | rewarded=${o.rewardedRatio != null ? (o.rewardedRatio * 100).toFixed(1) + "%" : "?"} top10=${o.top10IncentiveShare != null ? (o.top10IncentiveShare * 100).toFixed(0) + "%" : "?"} slots=${o.freeSlots ?? "?"}/? net=$${Math.round(o.netMonthlyUsd ?? 0)}/mo minVram=${o.minVramGb ?? "?"}GB\n` +
      `   block/reasons: ${(p.rent.rentBlock ? "[GATE] " + p.rent.rentBlock : "")} ${p.reasons.slice(0, 3).join(" | ")}`
    );
  }

  console.log("\n=== GPU BLOCKER HISTOGRAM ===");
  const hist: Record<string, number> = {};
  for (const p of gpu) {
    const tags: string[] = [];
    if (p.rent.rentBlock) tags.push(p.rent.rentBlock.includes("TEE") || p.rent.rentBlock.includes("TDX") || p.rent.rentBlock.includes("Confidential") ? "TEE/bare-metal gate" : "hosting gate");
    if (p.o.meetsMinimum === false) tags.push("below $300/mo min-profit rule");
    if (p.rent.knifeFight) tags.push("knife-fight seats");
    else if (p.rent.whaleMean) tags.push("whale-mean (<15% slots earn)");
    if (p.diligence.verdict === "DO NOT PROVISION") tags.push("diligence DO-NOT-PROVISION");
    if (tags.length === 0) tags.push("low conviction (score alone)");
    for (const t of tags) hist[t] = (hist[t] ?? 0) + 1;
  }
  for (const [k, v] of Object.entries(hist).sort((a, b) => b[1] - a[1])) console.log(`  ${v}\t${k}`);

  console.log("\n=== WHAT WOULD MOVE A GPU ROW TO RUN ===");
  for (const p of gpu.slice(0, 3)) {
    const o: any = p.o;
    const rentPts = p.rent.score;
    const need = 65 - p.conviction;
    console.log(
      `SN${o.netuid}: conv=${p.conviction}, needs +${need}. Rent-earn=${rentPts}/100 → every +10 rewarded-% of slots ≈ +5 pts (earn 50%), a free slot with broad rewards ≈ +20 (rentable) — the drivers are seat reality (${o.rewardedRatio != null ? (o.rewardedRatio * 100).toFixed(1) : "?"}% earn now) and the $300/mo min-profit gate (net=$${Math.round(o.netMonthlyUsd ?? 0)}/mo).`
    );
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
