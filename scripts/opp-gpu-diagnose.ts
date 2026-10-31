// OPP-GPU-DIAGNOSE — why does Opportunities show only 3 RUNs and no GPU RUN?
// Two passes:
//   PASS A: exact app pipeline (costBasisFromConfig of the SAVED config) — replicate what user sees
//   PASS B: corrected basis (owned / 96GB / TEE) — what verdicts SHOULD be on today's chain data
// Run: bun --smol scripts/opp-gpu-diagnose.ts

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

  console.log("=== SAVED PROFITABILITY CONFIG (what the app is using) ===");
  console.log(JSON.stringify(profConfig, null, 1));

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
  const { computeMinePickMap } = await import("../src/lib/infranex/mine-pick");
  const { costBasisFromConfig } = await import("../src/lib/infranex/rent-earn");

  const opps = mergeOpportunities(snap, profConfig, overrides);

  function runPass(label: string, basis: any) {
    console.log(`\n############ PASS ${label} ############`);
    console.log("basis:", JSON.stringify(basis));
    const picks = computeMinePickMap(opps, basis);
    const rows = opps
      .map((o: any) => ({ o, p: picks.get(o.id)! }))
      .filter((r: any) => r.p);
    const byConv = [...rows].sort((a: any, b: any) => b.p.conviction - a.p.conviction);

    const census: Record<string, number> = {};
    for (const r of rows as any[]) census[r.p.verdict] = (census[r.p.verdict] ?? 0) + 1;
    console.log("VERDICT CENSUS:", census);

    console.log("\nTOP 12 BY CONVICTION:");
    for (const { o, p } of byConv.slice(0, 12) as any[]) {
      const gpu = p.hardware === "GPU" ? "GPU" : "cpu";
      console.log(
        `SN${String(o.netuid).padStart(3)} ${String(o.subnetName ?? "").slice(0, 10).padEnd(10)} ` +
        `${gpu} conv ${String(p.conviction).padStart(3)} ${p.verdict.padEnd(5)} ` +
        `rentable ${String(p.rent.rentable).padEnd(5)} minOK ${String(o.meetsMinimum).padEnd(5)} ` +
        `EV $${String(Math.round(p.rent.expectedNetMonthlyUsd ?? 0)).padStart(6)}/mo ` +
        `rew ${(100 * (o.rewardedRatio ?? 0)).toFixed(0).padStart(3)}% seats ${o.freeSlots}/${o.totalSlots}`
      );
    }

    console.log("\nGPU ROWS conv >= 40 (gate breakdown):");
    for (const { o, p } of byConv.filter((r: any) => r.p.hardware === "GPU" && r.p.conviction >= 40) as any[]) {
      const gates: string[] = [];
      if (!p.rent.rentable) gates.push("NOT-RENTABLE(cap24)");
      if (o.meetsMinimum === false) gates.push("BELOW-MIN-PROFIT(cap20)");
      if (p.diligence?.verdict === "DO NOT PROVISION") gates.push("DILIGENCE-DNP(cap30)");
      else if (p.diligence?.verdict === "CONDITIONAL") gates.push("dilig-conditional");
      if (p.band === "MARGINAL") gates.push("MARGINAL-band(35-49)");
      if (!gates.length) gates.push("ungated, band=" + p.band);
      console.log(
        `SN${String(o.netuid).padStart(3)} ${String(o.subnetName ?? "").slice(0, 14).padEnd(14)} ` +
        `conv ${String(p.conviction).padStart(3)} ${p.verdict.padEnd(5)} ` +
        `earn ${String(p.rent.score).padStart(3)} dil ${String(p.diligenceHealth).padStart(3)} conf ${String(p.confidencePct).padStart(3)} ` +
        `EV $${String(Math.round(p.rent.expectedNetMonthlyUsd ?? 0)).padStart(6)}/mo :: ${gates.join(" + ")}`
      );
    }

    // SN92 REAX deep-dive
    const reax = (rows as any[]).find((r) => r.o.netuid === 92);
    if (reax) {
      const { o, p } = reax;
      console.log("\nREAX SN92:", JSON.stringify({
        verdict: p.verdict, band: p.band, conviction: p.conviction,
        earnScore: p.rent.score, diligenceHealth: p.diligenceHealth, confidence: p.confidencePct,
        rentable: p.rent.rentable, meetsMinimum: o.meetsMinimum,
        evMonthly: p.rent.expectedNetMonthlyUsd,
        rewardedPct: Math.round(100 * (o.rewardedRatio ?? 0)),
        freeSlots: o.freeSlots, totalSlots: o.totalSlots,
        minVramGb: o.minVramGb, dilVerdict: p.diligence?.verdict,
        reasons: p.reasons,
      }));
    }
    return byConv;
  }

  // PASS A — exactly what the app shows now
  runPass("A: app as-is (saved config)", costBasisFromConfig(profConfig));

  // PASS B — corrected owned profile
  const fixedBasis = {
    ...costBasisFromConfig(profConfig),
    mode: "owned" as const,
    rigVramGb: 96,
    rigTeeCapable: true,
    electricityUsdPerKwh: 0.12,
  };
  runPass("B: corrected (owned 96GB TEE)", fixedBasis);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
