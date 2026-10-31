// CHUTES-EXPLAIN — why does SN64 Chutes show AVOID in Opportunities while the
// Profitability engine shows net $3,765/mo PASSED?
// Replays the app's EXACT client path (live-merge → profitability → mine-pick
// conviction) with the user's persisted config, then prints every number that
// separates "mid-pack P&L" from "new-entrant conviction".
// Run: bun --smol scripts/chutes-explain.ts

const BASE = "http://127.0.0.1:3000";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

async function main() {
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: process.env.INFRANEX_ADMIN_CODE ?? "" }),
  });
  if (!login.ok) throw new Error("login failed");
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const snap = await api<any>("/api/network", { headers: { cookie } });
  const profConfig = await api<any>("/api/profitability-config", { headers: { cookie } });
  const ovrJson = await api<any>("/api/subnet-overrides", { headers: { cookie } });

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
  const basis = costBasisFromConfig(profConfig); // EXACTLY what the UI passes
  const basisFull = { ...basis, mode: "owned" as const, rigVramGb: 96, rigTeeCapable: true }; // persisted rig profile (OWNED-RIG-1)

  const cfg = profConfig?.config ?? profConfig;
  console.log("=== YOUR PERSISTED CONFIG (/api/profitability-config) ===");
  console.log(JSON.stringify({
    hardwareMode: cfg?.hardwareMode, electricityUsdPerKwh: cfg?.electricityUsdPerKwh,
    rigGpuVramGb: cfg?.rigGpuVramGb, rigTeeCapable: cfg?.rigTeeCapable,
    minNetProfitTargetUsd: cfg?.minNetProfitTargetUsd, storageMonthlyUsd: cfg?.storageMonthlyUsd,
    infraMonthlyUsd: cfg?.infraMonthlyUsd, otherOpexMonthlyUsd: cfg?.otherOpexMonthlyUsd,
    includeRegistrationBurn: cfg?.includeRegistrationBurn, riskAdjustment: cfg?.riskAdjustment,
  }, null, 2));

  const target = opps.find((o: any) => o.netuid === 64);
  if (!target) { console.log("SN64 not found among", opps.length, "rows"); return; }
  const o: any = target;

  console.log(`\n=== SN64 ${o.subnetName} — CHAIN + LEDGER FACTS ===`);
  console.log(`liveMiners=${o.liveMiners} freeSlots=${o.freeSlots} totalSlots=${o.totalSlots} minVram=${o.minVramGb}GB gpu=${o.recommendedGpu} ×${o.gpuCount ?? 1}`);
  console.log(`rewardedRatio=${o.rewardedRatio != null ? (o.rewardedRatio * 100).toFixed(2) + "%" : "?"}  top10IncentiveShare=${o.top10IncentiveShare != null ? (o.top10IncentiveShare * 100).toFixed(1) + "%" : "?"}  rewardMedianShare=${o.rewardMedianShare}`);
  console.log(`earnChance=${o.earnChance?.pct}%  earnChance factors: ${(o.earnChance?.factors ?? []).join(" | ") || "(none)"}`);
  console.log(`revenueBasis=${o.revenueBasis} (${o.revenueBasisSource ?? "?"})`);
  console.log(`grossMonthlyUsd=$${Math.round(o.grossMonthlyUsd)}  perEarningMeanDailyTao=${o.perEarningMeanDailyTao}  rampWeeks=${o.rampWeeks}`);

  console.log(`\n=== PROFITABILITY ENGINE (the card you pasted) — basis: ${cfg?.hardwareMode} ===`);
  const pr = o.profitability;
  console.log(`Expected revenue      $${pr.expectedRevenueUsd}`);
  console.log(`GPU line (elec/rent)  -$${pr.gpuRentalUsd}`);
  console.log(`Storage               -$${pr.storageUsd}`);
  console.log(`Infrastructure        -$${pr.infrastructureUsd}`);
  console.log(`Other operating       -$${pr.otherOperatingUsd} (incl. amortized burn $${pr.amortizedBurnUsd})`);
  console.log(`= NET PROFIT          $${pr.netMonthlyUsd}/mo  target $${pr.targetUsd} → ${pr.meetsMinimum ? "PASSED" : "FAIL"}  verdict=${pr.verdict}`);
  console.log(`risk factor=${pr.riskFactor}  risk-adjusted=$${pr.riskAdjustedMonthlyUsd}/mo  margin=${pr.profitMarginPct}%`);
  console.log(`scenarios: bear=$${pr.scenarios.bear.netMonthlyUsd} (net) "${pr.scenarios.bear.note}" | base=$${pr.scenarios.base.netMonthlyUsd} | bull=$${pr.scenarios.bull.netMonthlyUsd}`);
  console.log(`row.meetsMinimum=${o.meetsMinimum}  row.netMonthlyUsd=$${Math.round(o.netMonthlyUsd)}`);

  console.log(`\n=== CONVICTION ENGINE (the Opportunities verdict) — owned basis, weights 55/25/20 ===`);
  const p = computeMinePick(o, basisFull);
  console.log(`rentable=${p.rent.rentable} gate=${p.rent.rentBlock ?? "(none)"} source=${p.rent.rentBlockSource ?? "-"}`);
  console.log(`knifeFight=${p.rent.knifeFight} whaleMean=${p.rent.whaleMean} entry=${p.rent.entry}`);
  console.log(`rent-earn score=${p.rent.score}/100 band=${p.rent.band}`);
  console.log(`  sub-scores: earn-chance ${o.earnChance?.pct}% × 0.55 = ${(o.earnChance?.pct ?? 0) * 0.55} | rig-fit 10 | EV $${p.rent.expectedNetMonthlyUsd}/500 × 25 = ${((p.rent.expectedNetMonthlyUsd ?? 0) / 500 * 25).toFixed(1)} | distribution ${p.rent.knifeFight ? 0 : p.rent.whaleMean ? 4 : 10}`);
  console.log(`  EV math: net $${Math.round(o.netMonthlyUsd)} × rewarded ${(o.rewardedRatio * 100).toFixed(2)}% × medianShare ${o.rewardMedianShare} = $${p.rent.expectedNetMonthlyUsd}/mo ← what a NEW seat can actually expect`);
  console.log(`diligence: verdict=${p.diligence.verdict} health=${p.diligenceHealth}/100 fails=${p.diligence.failCount} warns=${p.diligence.warnCount}`);
  for (const st of p.diligence.stages) {
    if (st.status !== "pass")
      console.log(`  [${st.status.toUpperCase()}] #${st.n} ${st.label}: ${st.value} — ${st.detail}`);
  }
  console.log(`confidence=${p.confidencePct}/100 (ledger composite ${(o.confidence * 100).toFixed(0)})`);
  console.log(`CONVICTION = 0.55×${p.rent.score} + 0.25×${p.diligenceHealth} + 0.20×${p.confidencePct} = ${p.conviction}`);
  console.log(`band=${p.band} verdict=${p.verdict}`);
  console.log(`reasons: ${p.reasons.map((r) => "• " + r).join("\n         ")}`);

  console.log(`\n=== RECONCILE: what conviction would the P&L alone give? ===`);
  const hypotheticalEarn = 60; // if 60% of slots earned with broad distribution
  const evHyp = Math.round(o.netMonthlyUsd * 0.6 * Math.min(o.rewardMedianShare ?? 1, 1.2));
  console.log(`If SN64's seats were broad (60% rewarded, EV $${evHyp}/mo): rent ≈ 33+10+25+10 = 78 → conviction ≈ ${Math.round(0.55 * 78 + 0.25 * p.diligenceHealth + 0.2 * p.confidencePct)} (RUN)`);
  console.log(`Difference is ENTIRELY seat competition, not economics.`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
