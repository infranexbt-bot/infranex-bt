// TAO-ACCUMULATION-1 — invariant checks over LIVE /api/network rows.
// Verifies the α→TAO re-denomination engine on real data:
//   1. bijection: every row with a net-earnings estimate yields accumulation
//   2. net = gross − costs (TAO), per row
//   3. netTao ≈ net-earnings base USD ÷ TAO price (consistency, no drift)
//   4. conservative ≤ base ≤ optimistic (netTao), each ≈ its USD ÷ price
//   5. goalRatio = net ÷ target (rounded), verdict mapping correct
//   6. thinPool ⇔ pool < 1000 TAO or slippage > 5%
//   7. provider rows carry no α figure but do carry the USD-income note
//   8. rankByTaoAccumulation sorts desc by netTao, missing rows last
// TAO-ACCUMULATION-2 — the long-term bet:
//   9. null assumption → all assumed-value fields null, taoPerYear still set
//  10. assumed=$500 → value = displayed net × assumption (no hidden precision),
//      upside % correct, and the RANKING IS BIT-IDENTICAL to the null run
// Prints the TAO accumulation ranking + goal census.

const BASE = "http://localhost:3000";
const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
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
console.log(`rows: ${opps.length} · targetTaoPerMonth=${cfg.targetTaoPerMonth} · TAO=$${net.taoPriceUsd?.toFixed(2)}`);

const { computeNetEarningsMap } = await import("../src/lib/infranex/net-earnings.ts");
const estMap = computeNetEarningsMap(opps as never[], {
  minNetTargetUsd: cfg.minNetProfitTargetUsd,
  hardwareMode: cfg.hardwareMode,
});

const { computeTaoAccumulationMap, rankByTaoAccumulation } = await import(
  "../src/lib/infranex/tao-accumulation.ts"
);
const ctx = { taoPriceUsd: net.taoPriceUsd as number, targetTaoPerMonth: cfg.targetTaoPerMonth as number };
const taoMap = computeTaoAccumulationMap(opps as never[], estMap, ctx);

let fails = 0;
const fail = (msg: string) => { fails++; console.log(`FAIL ${msg}`); };
const eps = 0.02; // TAO rounding tolerance (r2 on both sides)

let checked = 0;
let goalMet = 0, progress = 0, negative = 0, thin = 0;
const target = ctx.targetTaoPerMonth;

for (const o of opps as any[]) {
  const est = estMap.get(o.id);
  const t = taoMap.get(o.id);
  if (!est) { if (t) fail(`${o.netuid}: accumulation without estimate`); continue; }
  if (!t) { fail(`${o.netuid}: estimate without accumulation (taoPrice=${ctx.taoPriceUsd})`); continue; }
  checked++;

  // 2. net = gross − costs
  const expectNet = t.grossTaoPerMonth - t.costsTaoPerMonth;
  if (Math.abs(expectNet - t.netTaoPerMonth) > eps)
    fail(`${o.netuid}: net ${t.netTaoPerMonth} ≠ gross−costs ${expectNet.toFixed(4)}`);

  // 3. consistency with the net-earnings USD months
  const usdNet = est.base.netMonthlyUsd / ctx.taoPriceUsd;
  if (Math.abs(usdNet - t.netTaoPerMonth) > eps)
    fail(`${o.netuid}: netTao ${t.netTaoPerMonth} drifts from USD/price ${usdNet.toFixed(4)}`);

  // 4. monotonic + consistency of the scenarios
  if (!(t.conservativeNetTaoPerMonth <= t.netTaoPerMonth + eps && t.netTaoPerMonth <= t.optimisticNetTaoPerMonth + eps))
    fail(`${o.netuid}: TAO scenarios not monotonic (${t.conservativeNetTaoPerMonth} / ${t.netTaoPerMonth} / ${t.optimisticNetTaoPerMonth})`);
  if (Math.abs(est.conservative.netMonthlyUsd / ctx.taoPriceUsd - t.conservativeNetTaoPerMonth) > eps)
    fail(`${o.netuid}: conservative TAO drifts from USD/price`);

  // 5. goal ratio + verdict mapping
  if (target > 0) {
    if (Math.abs(t.goalRatio! - Math.round((t.netTaoPerMonth / target) * 100) / 100) > eps)
      fail(`${o.netuid}: goalRatio ${t.goalRatio} wrong`);
    const want = t.netTaoPerMonth >= target ? "GOAL_MET" : t.netTaoPerMonth > 0 ? "PROGRESS" : "NEGATIVE";
    if (t.verdict !== want) fail(`${o.netuid}: verdict ${t.verdict} ≠ ${want}`);
  }

  // 6. thin-pool flag
  const wantThin = t.poolDepthTao != null && (t.poolDepthTao < 1000 || (o.slippagePct != null && o.slippagePct > 5));
  if (t.thinPool !== wantThin) fail(`${o.netuid}: thinPool ${t.thinPool} ≠ ${wantThin}`);

  // 7. provider rows: no α, USD note; emission rows: α present + hold note
  if (o.revenueBasis === "provider-marketplace") {
    if (t.alphaPerMonth != null) fail(`${o.netuid}: provider row must not carry α/mo`);
    if (!t.holdAlphaNote?.includes("USD")) fail(`${o.netuid}: provider row missing USD-income note`);
  } else if (t.alphaPerMonth != null && t.alphaPerMonth > 0 && !t.holdAlphaNote) {
    fail(`${o.netuid}: missing hold-α note`);
  }

  // 9. TAO-ACCUMULATION-2: null assumption → assumed-value fields all null,
  //    but the yearly roll-up is still populated.
  if (t.assumedTaoPriceUsd != null) fail(`${o.netuid}: assumedTaoPriceUsd ${t.assumedTaoPriceUsd} ≠ null (ctx has no assumption)`);
  if (t.assumedUpsidePct != null) fail(`${o.netuid}: assumedUpsidePct ${t.assumedUpsidePct} ≠ null`);
  if (t.valueAtAssumedMonthlyUsd != null) fail(`${o.netuid}: valueAtAssumedMonthlyUsd ${t.valueAtAssumedMonthlyUsd} ≠ null`);
  if (t.valueAtAssumedYearlyUsd != null) fail(`${o.netuid}: valueAtAssumedYearlyUsd ${t.valueAtAssumedYearlyUsd} ≠ null`);
  if (Math.abs(t.taoPerYear - Math.round(t.netTaoPerMonth * 12 * 100) / 100) > eps)
    fail(`${o.netuid}: taoPerYear ${t.taoPerYear} ≠ net×12 ${(t.netTaoPerMonth * 12).toFixed(2)}`);

  if (t.verdict === "GOAL_MET") goalMet++;
  else if (t.verdict === "PROGRESS") progress++;
  else negative++;
  if (t.thinPool) thin++;
}

// 8. ranking order
const ranked = rankByTaoAccumulation(opps as never[], taoMap);
let last = Infinity; let orderOk = true; let missingAtBottom = true;
const n = ranked.length;
ranked.forEach((r: any, i: number) => {
  const t = taoMap.get(r.id);
  if (!t) { if (i < n - 1 && taoMap.get(ranked[i + 1]?.id)) missingAtBottom = false; return; }
  if (t.netTaoPerMonth > last + eps) orderOk = false;
  last = t.netTaoPerMonth;
});
if (!orderOk) fail("rankByTaoAccumulation not sorted desc by netTao");
if (!missingAtBottom) fail("rows without accumulation did not sink to the bottom");

// 10. TAO-ACCUMULATION-2: the $500 long-term bet — value math must equal
//     displayed-net × assumption (no hidden precision), and the assumption
//     must be a pure re-valuation: the ranking is bit-identical to the null run.
const ASSUMED = 500;
const map500 = computeTaoAccumulationMap(opps as never[], estMap, { ...ctx, assumedTaoPriceUsd: ASSUMED });
let assumedChecked = 0;
for (const o of opps as any[]) {
  const t = taoMap.get(o.id);
  const a = map500.get(o.id);
  if (!t || !a) { if (a) fail(`${o.netuid}: $500 run lost/gained accumulation membership`); continue; }
  assumedChecked++;
  if (a.assumedTaoPriceUsd !== ASSUMED) fail(`${o.netuid}: assumedTaoPriceUsd ${a.assumedTaoPriceUsd} ≠ ${ASSUMED}`);
  if (Math.abs(a.valueAtAssumedMonthlyUsd! - Math.round(t.netTaoPerMonth * ASSUMED * 100) / 100) > eps)
    fail(`${o.netuid}: $${ASSUMED} monthly ${a.valueAtAssumedMonthlyUsd} ≠ net×${ASSUMED} ${(t.netTaoPerMonth * ASSUMED).toFixed(2)}`);
  if (Math.abs(a.valueAtAssumedYearlyUsd! - Math.round(a.taoPerYear * ASSUMED * 100) / 100) > eps)
    fail(`${o.netuid}: $${ASSUMED} yearly ${a.valueAtAssumedYearlyUsd} ≠ taoPerYear×${ASSUMED} ${(a.taoPerYear * ASSUMED).toFixed(2)}`);
  const wantUpside = Math.round(((ASSUMED / ctx.taoPriceUsd - 1) * 100) * 100) / 100;
  if (Math.abs(a.assumedUpsidePct! - wantUpside) > eps)
    fail(`${o.netuid}: upside ${a.assumedUpsidePct} ≠ ${(wantUpside).toFixed(2)}`);
  // the re-valuation must not touch the TAO quantities or the verdict
  if (a.netTaoPerMonth !== t.netTaoPerMonth || a.taoPerYear !== t.taoPerYear || a.verdict !== t.verdict)
    fail(`${o.netuid}: assumption mutated quantities/verdict`);
}
const ranked500 = rankByTaoAccumulation(opps as never[], map500);
const idsNull = ranked.map((r: any) => r.id).join(",");
const ids500 = ranked500.map((r: any) => r.id).join(",");
if (idsNull !== ids500) fail("ranking changed under the $500 assumption — re-valuation must be rank-neutral");
console.log(`\nTAO-ACCUMULATION-2: assumption $${ASSUMED}/TAO checked on ${assumedChecked} rows · ranking bit-identical: ${idsNull === ids500 ? "YES" : "NO"}`);
const aTop = ranked500
  .map((r: any) => ({ r, a: map500.get(r.id) }))
  .filter((x: any) => x.a)
  .slice(0, 5);
console.log("TOP 5 AT THE ASSUMPTION (what the banked TAO is worth):");
for (const { r, a } of aTop as any[]) {
  console.log(
    `SN${String(r.netuid).padStart(3)} ${String(r.subnetName).padEnd(14)} net=${a.netTaoPerMonth.toFixed(2)} TAO/mo ` +
    `→ $${a.valueAtAssumedMonthlyUsd?.toFixed(0)}/mo · $${a.valueAtAssumedYearlyUsd?.toFixed(0)}/yr ` +
    `(${a.assumedUpsidePct! >= 0 ? "+" : ""}${a.assumedUpsidePct!.toFixed(1)}% vs live $${ctx.taoPriceUsd.toFixed(0)})`
  );
}

console.log(`\ninvariants: checked ${checked} rows · ${fails} failures`);
console.log(`census: GOAL_MET ${goalMet} · PROGRESS ${progress} · NEGATIVE ${negative} · thin-pool flagged ${thin}`);

const top = ranked
  .map((r: any) => ({ r, t: taoMap.get(r.id) }))
  .filter((x: any) => x.t)
  .slice(0, 12);
console.log("\nTOP BY NET TAO/MO (the accumulation ranking):");
for (const { r, t } of top as any[]) {
  const goal = t.goalRatio != null ? (t.goalRatio >= 1 ? `✓${t.goalRatio.toFixed(1)}×` : `${Math.round(t.goalRatio * 100)}%`) : "—";
  console.log(
    `SN${String(r.netuid).padStart(3)} ${String(r.subnetName).padEnd(14)} net=${String(t.netTaoPerMonth.toFixed(2)).padStart(8)} TAO/mo ` +
    `gross=${t.grossTaoPerMonth.toFixed(2)} costs=${t.costsTaoPerMonth.toFixed(2)} goal=${goal} ` +
    `worst=${t.conservativeNetTaoPerMonth.toFixed(2)} haircut=${t.conversionHaircutPct != null ? "−" + t.conversionHaircutPct.toFixed(1) + "%" : "n/a"} ${t.thinPool ? "THIN" : ""}`
  );
}

if (fails > 0) process.exit(1);
console.log("\nALL INVARIANTS PASS");
