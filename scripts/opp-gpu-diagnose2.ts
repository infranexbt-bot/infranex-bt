// OPP-GPU-DIAGNOSE-2 — diligence detail for top GPU rows + OnSale puzzle + REAX history
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
    if (o.name) e.name = o.name;
    if (o.minVramGb != null) e.minVramGb = o.minVramGb;
    if (o.recommendedGpu) e.recommendedGpu = o.recommendedGpu;
    if (o.gpuCount != null) e.gpuCount = o.gpuCount;
    overrides.set(o.netuid, e);
  }
  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const { computeMinePickMap } = await import("../src/lib/infranex/mine-pick");
  const opps = mergeOpportunities(snap, profConfig, overrides);
  const basis = {
    ...profConfig,
    mode: "owned" as const,
    rigVramGb: 96,
    rigTeeCapable: true,
    electricityUsdPerKwh: 0.12,
  };
  const picks = computeMinePickMap(opps, basis);
  const rows = opps.map((o: any) => ({ o, p: picks.get(o.id)! })).filter((r: any) => r.p);
  const byConv = [...rows].sort((a: any, b: any) => b.p.conviction - a.p.conviction);

  // Diligence stage detail for every GPU row with conv >= 30
  console.log("=== GPU ROWS (owned/96GB/TEE): diligence stages + earns breakdown ===");
  for (const { o, p } of byConv.filter((r: any) => r.p.hardware === "GPU" && r.p.conviction >= 25) as any[]) {
    console.log(`\nSN${o.netuid} ${o.subnetName} — conv ${p.conviction} ${p.verdict}, EV $${Math.round(p.rent.expectedNetMonthlyUsd ?? 0)}/mo, rewarded ${(100 * (o.rewardedRatio ?? 0)).toFixed(0)}%, seats ${o.freeSlots}/${o.totalSlots}, top10 ${(100 * (o.top10IncentiveShare ?? 0)).toFixed(0)}%`);
    console.log(`  earnScore ${p.rent.score} | dilHealth ${p.diligenceHealth} | conf ${p.confidencePct} | meetsMin ${o.meetsMinimum} | rentable ${p.rent.rentable} | knifeFight ${p.rent.knifeFight}`);
    if (p.diligence?.stages) {
      for (const st of p.diligence.stages) {
        if (st.status !== "pass") console.log(`  DIL[${st.stage ?? st.name ?? "?"}] ${st.status}: ${st.reason ?? st.detail ?? ""}`);
      }
    }
  }

  // OnSale 86 puzzle: EV $1607 but capped — what gives?
  console.log("\n=== ONSALE SN86 DETAIL ===");
  const onsale = (rows as any[]).find((r) => r.o.netuid === 86);
  if (onsale) {
    const { o, p } = onsale;
    console.log(JSON.stringify({
      verdict: p.verdict, conviction: p.conviction, earnScore: p.rent.score,
      EV: p.rent.expectedNetMonthlyUsd, grossMonthly: o.grossMonthlyUsd, netMonthly: o.netMonthlyUsd,
      meetsMinimum: o.meetsMinimum, rewardedPct: Math.round(100 * (o.rewardedRatio ?? 0)),
      top10: Math.round(100 * (o.top10IncentiveShare ?? 0)), seats: `${o.freeSlots}/${o.totalSlots}`,
      price: o.alphaPriceUsd, realizable: o.realizableAlphaPriceUsd,
      rewardRealizability: o.rewardRealizability, slippagePct: o.slippagePct,
      dilVerdict: p.diligence?.verdict, reasons: p.reasons,
    }, null, 1));
  }

  // REAX: what changed? check snapshot history if available via API
  console.log("\n=== REAX SN92 RAW LIVE FIELDS ===");
  const reax = (rows as any[]).find((r) => r.o.netuid === 92);
  if (reax) {
    const { o } = reax;
    console.log(JSON.stringify({
      alphaPriceUsd: o.alphaPriceUsd, realizableAlphaPriceUsd: o.realizableAlphaPriceUsd,
      rewardRealizability: o.rewardRealizability, dilutionRatio: o.dilutionRatio,
      alphaChange24h: o.alphaChange24h, liquidityTao: o.liquidityTao, slippagePct: o.slippagePct,
      top10IncentiveShare: o.top10IncentiveShare, rewardMedianShare: o.rewardMedianShare,
      perEarningMeanDailyTao: o.perEarningMeanDailyTao, rewardedRatio: o.rewardedRatio,
      freeSlots: o.freeSlots, totalSlots: o.totalSlots, rampWeeks: o.rampWeeks,
      earnChance: o.earnChance, grossMonthlyUsd: o.grossMonthlyUsd, netMonthlyUsd: o.netMonthlyUsd,
      meetsMinimum: o.meetsMinimum, liveMiners: o.liveMiners,
    }, null, 1));
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
