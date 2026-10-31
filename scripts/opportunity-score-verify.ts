// OPPORTUNITY-SCORE-VERIFY — run the new per-subnet Opportunity Score engine
// over the live snapshot exactly as the app does, and check the invariants:
//   1. weights sum to 1.0 and component weighted sums rebuild the raw score
//   2. hard gates fire on the right rows (bare-metal/TEE, payout-unverified,
//      net-negative) and cap the effective score
//   3. no gated row headlines the ranking while ungated rows exist
// Run: npx tsx scripts/opportunity-score-verify.ts

const BASE = "http://127.0.0.1:3000";

async function cookie(): Promise<string> {
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: process.env.INFRANEX_ADMIN_CODE ?? "" }),
  });
  if (!login.ok) throw new Error("login failed " + login.status);
  return (login.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function main() {
  const ck = await cookie();
  const api = async (p: string) => {
    const r = await fetch(BASE + p, { headers: { cookie: ck } });
    if (!r.ok) throw new Error(`${p} -> ${r.status}`);
    return r.json();
  };
  const snap = await api("/api/network");
  const profConfig = await api("/api/profitability-config");
  const ovrJson = await api("/api/subnet-overrides");
  const overrides = new Map<number, Record<string, unknown>>(
    Object.entries(ovrJson?.overrides ?? {}).map(([k, v]) => [Number(k), v as Record<string, unknown>])
  );

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const rows = mergeOpportunities(snap, profConfig, overrides) as any[];

  const eng = await import("../src/lib/infranex/subnet-opportunity");
  const ctx = { hardwareMode: profConfig?.hardwareMode === "owned" ? "owned" as const : "rented" as const, minNetTargetUsd: profConfig?.minNetProfitTargetUsd ?? 300 };
  const scores = eng.computeOpportunityScoreMap(rows, ctx);

  // --- Invariant 1: weights & arithmetic -------------------------------------
  const w = eng.OPPORTUNITY_WEIGHTS;
  const wsum = Object.values(w).reduce((a, b) => a + b, 0);
  console.log(`weights sum = ${wsum.toFixed(2)} ${wsum === 1 ? "OK" : "FAIL"}`);
  let arithFails = 0;
  for (const s of scores.values()) {
    const rebuilt = s.components.reduce((a, c) => a + c.weighted, 0);
    if (Math.abs(rebuilt - s.rawScore) > 0.2) arithFails++;
  }
  console.log(`arithmetic (Σ weighted = raw) fails: ${arithFails} ${arithFails === 0 ? "OK" : "FAIL"}`);

  // --- Invariant 2: gates ----------------------------------------------------
  const gateCensus: Record<string, number> = {};
  let capFails = 0;
  for (const s of scores.values()) {
    for (const g of s.gates) gateCensus[g.kind] = (gateCensus[g.kind] ?? 0) + 1;
    if (s.gated && s.effectiveScore > Math.min(...s.gates.map((g) => ({ HARDWARE_INCOMPATIBLE: 44, PAYOUT_UNVERIFIED: 49, NET_NEGATIVE: 15, NET_BELOW_TARGET: 35 } as any)[g.kind])) + 0.01) capFails++;
    if (!s.gated && s.effectiveScore !== s.rawScore) capFails++;
  }
  console.log(`gate census:`, gateCensus, `cap fails: ${capFails} ${capFails === 0 ? "OK" : "FAIL"}`);

  // --- Invariant 3: gated rows NEVER outrank ungated rows ----------------------
  // (uses the REAL ranker — gated sink is part of its sort key)
  const { rankByOpportunityScore: rank } = eng;
  const orderedRows = rank(rows as any[], scores);
  const ranked = orderedRows
    .map((r) => scores.get((r as any).id))
    .filter((s): s is any => Boolean(s));
  const top10 = ranked.slice(0, 10);
  const firstGated = ranked.findIndex((s) => s.gated);
  const ungatedAfterGate = firstGated >= 0 ? ranked.slice(firstGated).some((s) => !s.gated) : false;
  const ungatedCount = ranked.filter((s) => !s.gated).length;
  console.log(
    `ungated rows: ${ungatedCount}; ungated-below-gated violations: ${ungatedAfterGate} ${ungatedAfterGate ? "FAIL" : "OK"}`
  );

  // --- Show the leaderboard ----------------------------------------------------
  console.log("\n=== TOP 10 by Opportunity Score ===");
  for (const s of top10) {
    console.log(
      `#${ranked.indexOf(s) + 1} SN${String(s.netuid).padStart(3)} ${s.subnetName.slice(0, 22).padEnd(22)} ${String(s.effectiveScore).padStart(5)} (${s.band}) raw ${String(s.rawScore).padStart(5)}${s.gated ? " GATED " + s.gates.map((g) => g.label).join("+") : ""}`
    );
    console.log(
      `     components: ` +
        s.components.map((c) => `${c.key.slice(0, 8)} ${c.points}×${c.weight}=${c.weighted}`).join(" | ")
    );
  }

  // --- Spot checks -------------------------------------------------------------
  console.log("\n=== SPOT CHECKS ===");
  const spot = (pred: (s: any) => boolean, label: string) => {
    const hit = [...scores.values()].find(pred);
    console.log(`${label}: ${hit ? `SN${hit.netuid} ${hit.subnetName} eff ${hit.effectiveScore} gates [${hit.gates.map((g) => g.kind).join(",") || "none"}]` : "none found"}`);
    return hit;
  };
  spot((s) => s.gates.some((g) => g.kind === "HARDWARE_INCOMPATIBLE"), "hardware-gated row (expect 8-GPU/bare-metal/TEE subnet)");
  spot((s) => s.gates.some((g) => g.kind === "PAYOUT_UNVERIFIED"), "payout-unverified row (expect no mechanics + no repo source)");
  spot((s) => s.gates.some((g) => g.kind === "NET_NEGATIVE"), "net-negative row");
  const bitcast = [...scores.values()].find((s) => s.netuid === 82);
  if (bitcast) console.log(`SN82 Bitcast: eff ${bitcast.effectiveScore} raw ${bitcast.rawScore} gates [${bitcast.gates.map((g) => g.kind).join(",")}] — H200 (141GB) seat; payout unverified ⇒ gated, high raw must not headline`);

  // (rank-order already validated against the real ranker in invariant 3)
  const failed = wsum !== 1 || arithFails > 0 || capFails > 0 || ungatedAfterGate;
  console.log(`\n${failed ? "RESULT: FAIL" : "RESULT: ALL INVARIANTS PASS"}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("verify failed:", e);
  process.exit(1);
});
