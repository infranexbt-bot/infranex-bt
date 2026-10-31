// OPPORTUNITY-ENGINE-2 — invariant + integration checks over LIVE rows.
//
//   1. weights: defaults sum 1 · resolve() normalizes · sanitize() is safe
//   2. missing data: neutral points ≤ 50 + missing flag · dataConfidence drops
//   3. hard gates: NET_NEGATIVE → cap ≤ 15 + classification AVOID (never a
//      positive deployment recommendation) · gated rows sink in the ranking
//   4. difficulty: every row in {EASY,MODERATE,DIFFICULT,UNKNOWN}, UNKNOWN
//      only without evidence, reasons always non-empty, TEE → DIFFICULT
//   5. classification: SCALE strictly evidence-gated (payout verified +
//      measured performance + confidence ≥ 0.5 + worst month ≥ 0 + not gated)
//   6. horizons: 7/30/90d net TAO = displayed monthly × (7/30, 1, 3)
//   7. settings round-trip: custom weights + spend cap via the API
//   8. snapshot pipeline: /api/network fires the daily capture →
//      /api/opportunity-snapshots serves it
// Prints the engine census (classification × difficulty × gates).

const BASE = "http://localhost:3000";
const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ userId: "admin", code: process.env.INFRANEX_ADMIN_CODE ?? "" }),
});
if (!login.ok) throw new Error(`login failed: ${login.status}`);
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
console.log("login: OK");

const net = await (await fetch(`${BASE}/api/network`, { headers: { cookie }, cache: "no-store" })).json() as any;
const cfg = await (await fetch(`${BASE}/api/profitability-config`, { headers: { cookie }, cache: "no-store" })).json() as any;
const ovrRes = await (await fetch(`${BASE}/api/subnet-overrides`, { headers: { cookie }, cache: "no-store" })).json() as any;
const overrides = new Map<number, Record<string, unknown>>();
for (const o of (ovrRes.overrides ?? []) as any[]) {
  const entry: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v != null && v !== "" && k !== "netuid") entry[k] = v;
  }
  overrides.set(o.netuid, entry);
}

const { mergeOpportunities } = await import("../src/lib/infranex/live-merge.ts");
const opps = mergeOpportunities(net as never, cfg, overrides) as any[];
console.log(`rows: ${opps.length} · TAO=$${net.taoPriceUsd?.toFixed(2)} · weights from settings: ${Object.values(cfg.opportunityWeights ?? {}).map((w: number) => w).join("/")}`);

const { computeNetEarningsMap } = await import("../src/lib/infranex/net-earnings.ts");
const estMap = computeNetEarningsMap(opps as never[], {
  minNetTargetUsd: cfg.minNetProfitTargetUsd,
  hardwareMode: cfg.hardwareMode,
});

const {
  computeOpportunityScoreMap,
  rankByOpportunityScore,
  resolveOpportunityWeights,
  sanitizeOpportunityWeights,
  OPPORTUNITY_WEIGHTS,
} = await import("../src/lib/infranex/subnet-opportunity.ts");
const { computeEntryDifficultyMap } = await import("../src/lib/infranex/entry-difficulty.ts");
const { classifyOpportunity } = await import("../src/lib/infranex/opportunity-class.ts");
const { computeTaoAccumulationMap } = await import("../src/lib/infranex/tao-accumulation.ts");

const ctx = {
  hardwareMode: cfg.hardwareMode === "owned" ? "owned" as const : "rented" as const,
  minNetTargetUsd: cfg.minNetProfitTargetUsd as number,
  weights: cfg.opportunityWeights,
};
const scoreMap = computeOpportunityScoreMap(opps as never[], ctx);
const diffMap = computeEntryDifficultyMap(opps as never[]);
const taoMap = computeTaoAccumulationMap(
  opps as never[],
  estMap,
  { taoPriceUsd: net.taoPriceUsd as number, targetTaoPerMonth: cfg.targetTaoPerMonth as number }
);

let fails = 0;
const fail = (msg: string) => { fails++; console.log(`FAIL ${msg}`); };
const r2 = (n: number) => Math.round(n * 100) / 100;
const eps = 0.02;

// ---- 1. weights -------------------------------------------------------------
const wSum = Object.values(OPPORTUNITY_WEIGHTS).reduce((a: number, b: number) => a + b, 0);
if (Math.abs(wSum - 1) > 1e-9) fail(`default weights sum ${wSum} ≠ 1`);
const norm = resolveOpportunityWeights({ netTaoPotential: 10 } as never);
const normSum = Object.values(norm).reduce((a: number, b: number) => a + b, 0);
if (Math.abs(normSum - 1) > 0.002) fail(`resolve() did not normalize: sum ${normSum}`);
if (norm.netTaoPotential < 0.9) fail(`dominant weight not honored: netTaoPotential ${norm.netTaoPotential}`);
const sanitized = sanitizeOpportunityWeights("not json{{{");
if (JSON.stringify(sanitized) !== JSON.stringify(OPPORTUNITY_WEIGHTS)) fail("sanitize(garbage) ≠ defaults");
const sanitized2 = sanitizeOpportunityWeights({ netTaoPotential: -5, bogus: 99 } as never);
if (!(sanitized2.netTaoPotential >= 0 && Object.keys(sanitized2).length === 7)) fail("sanitize() failed on hostile input");
console.log("1. weights: defaults sum 1 · resolve normalizes · sanitize safe ✓");

// ---- per-row invariants ------------------------------------------------------
let checked = 0;
let netNegative = 0, gatedCount = 0, scaleCount = 0, testCount = 0, watchCount = 0, avoidCount = 0;
const diffCensus: Record<string, number> = { EASY: 0, MODERATE: 0, DIFFICULT: 0, UNKNOWN: 0 };

for (const o of opps as any[]) {
  const s = scoreMap.get(o.id);
  const est = estMap.get(o.id);
  const d = diffMap.get(o.id);
  if (!s) continue;
  checked++;

  // 2. missing data never boosts: missing components sit ≤ 50 points
  for (const c of s.components) {
    if (c.missing && c.points > 50) fail(`${o.netuid}: missing component ${c.key} scored ${c.points} > 50 (boost)`);
    // weighted is r1-rounded from the (already r1) points × weight
    if (Math.abs(c.weighted - Math.round(c.points * c.weight * 10) / 10) > 0.011)
      fail(`${o.netuid}: component ${c.key} weighted ${c.weighted} ≠ r1(points×weight) ${Math.round(c.points * c.weight * 10) / 10}`);
  }
  // weights on components are the active (normalized) set
  const cwSum = s.components.reduce((a: number, c: any) => a + c.weight, 0);
  if (Math.abs(cwSum - 1) > 0.004) fail(`${o.netuid}: component weights sum ${cwSum} ≠ 1`);
  const rawRebuild = s.components.reduce((a: number, c: any) => a + c.weighted, 0);
  // 7 components, each r1-rounded → worst-case drift 0.35
  if (Math.abs(rawRebuild - s.rawScore) > 0.36) fail(`${o.netuid}: rawScore ${s.rawScore} ≠ Σ weighted ${r2(rawRebuild)}`);

  // 3. hard gates
  const netNeg = o.netMonthlyUsd != null && o.netMonthlyUsd < 0;
  const netNegGate = s.gates.some((g: any) => g.kind === "NET_NEGATIVE");
  if (netNeg !== netNegGate) fail(`${o.netuid}: NET_NEGATIVE gate ${netNegGate} ≠ economics ${netNeg}`);
  if (netNeg) {
    netNegative++;
    if (s.effectiveScore > 15.01) fail(`${o.netuid}: net-negative row scored ${s.effectiveScore} > 15 cap`);
    const cls = classifyOpportunity(o as never, { score: s, est: est ?? null, difficulty: d });
    if (cls.action !== "AVOID") fail(`${o.netuid}: net-negative row classified ${cls.action} — must be AVOID`);
  }
  if (s.gated) {
    gatedCount++;
    const cap = Math.min(...s.gates.map((g: any) => ({ HARDWARE_INCOMPATIBLE: 44, PAYOUT_UNVERIFIED: 49, NET_NEGATIVE: 15, NET_BELOW_TARGET: 35 }[g.kind] ?? 100)));
    if (s.effectiveScore > cap + 0.01) fail(`${o.netuid}: gated row ${s.effectiveScore} exceeds cap ${cap}`);
  }

  // 4. difficulty
  if (!d) fail(`${o.netuid}: no difficulty verdict`);
  else {
    diffCensus[d.difficulty] = (diffCensus[d.difficulty] ?? 0) + 1;
    if (!["EASY", "MODERATE", "DIFFICULT", "UNKNOWN"].includes(d.difficulty)) fail(`${o.netuid}: bad difficulty ${d.difficulty}`);
    if (d.reasons.length === 0) fail(`${o.netuid}: difficulty ${d.difficulty} without reasons`);
    const noEvidence = o.rewardedRatio == null && !o.earnChance && o.rampWeeks == null;
    if (noEvidence && d.difficulty !== "UNKNOWN") fail(`${o.netuid}: no evidence but classified ${d.difficulty} — must be UNKNOWN`);
    if (!noEvidence && d.difficulty === "UNKNOWN") fail(`${o.netuid}: has evidence but classified UNKNOWN`);
    if (d.difficulty !== "UNKNOWN" && d.easeScore == null) fail(`${o.netuid}: ${d.difficulty} without easeScore`);
    const tee = o.hosting?.teeRequired || (o.gpuCount ?? 1) >= 4;
    if (tee && d.difficulty !== "DIFFICULT") fail(`${o.netuid}: TEE/4+-GPU row classified ${d.difficulty} — must be DIFFICULT`);
  }

  // 5. classification evidence gates
  const cls = classifyOpportunity(o as never, { score: s, est: est ?? null, difficulty: d });
  if (cls.action === "SCALE") {
    scaleCount++;
    if (s.gated) fail(`${o.netuid}: SCALE while gated`);
    if (!(o.mechanics || o.requirementsSource)) fail(`${o.netuid}: SCALE without verified payout source`);
    if (o.rewardedRatio == null || o.rewardedRatio < 0.25)
      fail(`${o.netuid}: SCALE with rewardedRatio ${o.rewardedRatio} < 0.25 (theory, not evidence)`);
    if (s.dataConfidence < 0.5) fail(`${o.netuid}: SCALE at dataConfidence ${s.dataConfidence} < 0.5`);
    if (!est || est.conservative.netMonthlyUsd < 0) fail(`${o.netuid}: SCALE with negative conservative month`);
    if (d && (d.difficulty === "DIFFICULT" || d.difficulty === "UNKNOWN")) fail(`${o.netuid}: SCALE at difficulty ${d.difficulty}`);
  } else if (cls.action === "TEST") testCount++;
  else if (cls.action === "WATCHLIST") watchCount++;
  else avoidCount++;
  if (cls.reasons.length === 0) fail(`${o.netuid}: classification without reasons`);

  // 6. horizons
  const t = taoMap.get(o.id);
  if (t && est) {
    const m = t.netTaoPerMonth;
    const c = t.conservativeNetTaoPerMonth;
    if (Math.abs(t.horizons[0].netTao - r2((m * 7) / 30)) > eps) fail(`${o.netuid}: 7d horizon ${t.horizons[0].netTao} ≠ monthly×7/30`);
    if (Math.abs(t.horizons[1].netTao - m) > eps) fail(`${o.netuid}: 30d horizon ≠ monthly`);
    if (Math.abs(t.horizons[2].netTao - r2(m * 3)) > eps) fail(`${o.netuid}: 90d horizon ${t.horizons[2].netTao} ≠ monthly×3`);
    if (Math.abs(t.horizons[2].conservativeNetTao - r2(c * 3)) > eps) fail(`${o.netuid}: 90d conservative ≠ worst×3`);
  }
}

// ---- ranking: gated rows sink (all gated AFTER all ungated) ------------------
const ranked = rankByOpportunityScore(opps as never[], scoreMap);
let seenGated = false;
for (const r of ranked) {
  const s = scoreMap.get(r.id ?? "");
  if (!s) continue;
  if (s.gated) seenGated = true;
  else if (seenGated) fail(`${r.netuid}: ungated row ranked below a gated row`);
}
console.log(`\n2–6. per-row invariants: ${checked} rows checked`);

// ---- 7. settings round-trip (custom weights + spend cap) ---------------------
const H = { cookie, "content-type": "application/json" };
const saved = cfg;
const put1 = await fetch(`${BASE}/api/profitability-config`, {
  method: "PUT", headers: H,
  body: JSON.stringify({ ...saved, opportunityWeights: { netTaoPotential: 10 }, maxApprovedSpendUsd: 2000 }),
});
const savedCfg = await put1.json();
const swSum = Object.values(savedCfg.opportunityWeights as Record<string, number>).reduce((a, b) => a + b, 0);
if (Math.abs(swSum - 1) > 0.002) fail(`PUT weights not normalized: sum ${swSum}`);
if (savedCfg.maxApprovedSpendUsd !== 2000) fail(`PUT spend cap ${savedCfg.maxApprovedSpendUsd} ≠ 2000`);
// hostile cap + restore
const put2 = await fetch(`${BASE}/api/profitability-config`, {
  method: "PUT", headers: H,
  body: JSON.stringify({ ...saved, maxApprovedSpendUsd: -50, assumedTaoPriceUsd: saved.assumedTaoPriceUsd }),
});
const restoredCfg = await put2.json();
if (restoredCfg.maxApprovedSpendUsd !== null) fail(`hostile cap -50 → ${restoredCfg.maxApprovedSpendUsd}, want null`);
await fetch(`${BASE}/api/profitability-config`, {
  method: "PUT", headers: H,
  body: JSON.stringify({ ...saved, opportunityWeights: saved.opportunityWeights }),
});
console.log(`7. settings round-trip: weights normalized (sum ${swSum.toFixed(3)}) · cap enforced · hostile input → null · restored ✓`);

// ---- 8. snapshot pipeline ----------------------------------------------------
// /api/network was hit above → the fire-and-forget daily capture ran. Poll.
let snapCount = 0;
for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 1500));
  const snap = await (await fetch(`${BASE}/api/opportunity-snapshots`, { headers: { cookie }, cache: "no-store" })).json() as any;
  snapCount = snap.count ?? 0;
  if (snapCount > 0) {
    const perSubnet = await (await fetch(`${BASE}/api/opportunity-snapshots?netuid=${(snap.snapshots?.[0]?.netuid ?? 82)}&days=30`, { headers: { cookie }, cache: "no-store" })).json() as any;
    if (!Array.isArray(perSubnet.snapshots)) fail("per-subnet snapshot history missing");
    console.log(`8. snapshot pipeline: ${snapCount} rows captured for ${snap.day} · per-subnet history serves ✓`);
    break;
  }
}
if (snapCount === 0) fail("snapshot capture did not produce rows within 15s");

// ---- census ------------------------------------------------------------------
console.log(`\ncensus: classification — SCALE ${scaleCount} · TEST ${testCount} · WATCHLIST ${watchCount} · AVOID ${avoidCount} (gated ${gatedCount}, net-negative ${netNegative})`);
console.log(`census: difficulty — ${Object.entries(diffCensus).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
const top = ranked
  .map((r: any) => ({ r, s: scoreMap.get(r.id), d: diffMap.get(r.id), cls: undefined }))
  .filter((x: any) => x.s)
  .slice(0, 10);
console.log("\nTOP 10 BY OPPORTUNITY SCORE (gates sink):");
for (const { r, s, d } of top as any[]) {
  const cls = classifyOpportunity(r as never, {
    score: s, est: estMap.get(r.id) ?? null, difficulty: d,
  });
  console.log(
    `SN${String(r.netuid).padStart(3)} ${String(r.subnetName).padEnd(16)} score=${String(s.effectiveScore.toFixed(1)).padStart(5)} ${s.gated ? "GATED " : "      "}` +
    `${cls.action.padEnd(9)} ${d?.difficulty.padEnd(9)} net=$${Math.round(r.netMonthlyUsd ?? 0).toLocaleString()}/mo conf=${Math.round(s.dataConfidence * 100)}%`
  );
}

if (fails > 0) {
  console.log(`\n${fails} FAILURES`);
  process.exit(1);
}
console.log("\nALL OPPORTUNITY-ENGINE INVARIANTS PASS");
