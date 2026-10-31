// NET-EARNINGS-1 — invariant checks over LIVE /api/network rows.
// Verifies the estimate engine on real data:
//   1. every row with a P&L yields an estimate; rows without yield none
//   2. gross monotonic: conservative ≤ base ≤ optimistic
//   3. net = gross − cost stack (rounded), per scenario
//   4. conservative gross = base gross × ramp × uptime × competition × alpha
//   5. optimistic gross = max(bull gross, base gross)
//   6. confidence ∈ [0.05, 0.95], band consistent, drivers non-empty
//   7. verdict mapping matches thresholds (LOSS_MAKING ⇔ base < 0, etc.)
//   8. rented basis → cooling/maintenance/recovery lines are exactly 0
//   9. meetsTarget mirrors net ≥ target
// Prints the top ranking by base net + verdict/confidence census.

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

// Build rows the SAME way the app does (opportunities-view → mergeOpportunities).
const { mergeOpportunities } = await import("../src/lib/infranex/live-merge.ts");
const opps = mergeOpportunities(net as never, cfg, overrides) as any[];
console.log(`rows: ${opps.length} · config mode=${cfg.hardwareMode} target=$${cfg.minNetProfitTargetUsd}`);

// Import the engine directly (bun runs TS).
const { computeNetEarningsMap } = await import("../src/lib/infranex/net-earnings.ts");

const estMap = computeNetEarningsMap(opps as never[], {
  minNetTargetUsd: cfg.minNetProfitTargetUsd,
  hardwareMode: cfg.hardwareMode,
});

let fails = 0;
const fail = (msg: string) => { fails++; console.log(`FAIL ${msg}`); };
const eps = 1.5; // rounding tolerance on $ figures

let withPnl = 0, withoutPnl = 0;
const verdictCensus: Record<string, number> = {};
const confCensus: Record<string, number> = {};

for (const o of opps as any[]) {
  const e = estMap.get(o.id);
  if (!o.profitability) { withoutPnl++; if (e) fail(`${o.id}: estimate without P&L`); continue; }
  withPnl++;
  if (!e) { fail(`${o.id}: P&L present but no estimate`); continue; }

  const target = cfg.minNetProfitTargetUsd ?? 300;
  const { conservative: c, base: b, optimistic: u, costs } = e;

  // 2. monotonic gross
  if (!(c.grossMonthlyUsd <= b.grossMonthlyUsd + eps && b.grossMonthlyUsd <= u.grossMonthlyUsd + eps))
    fail(`${o.netuid}: gross not monotonic cons=${c.grossMonthlyUsd} base=${b.grossMonthlyUsd} opt=${u.grossMonthlyUsd}`);

  // 3. net = gross − costs
  for (const sc of [c, b, u] as const) {
    const expect = Math.round((sc.grossMonthlyUsd > 0 ? sc.grossMonthlyUsd : 0) - costs.totalUsd);
    if (Math.abs(sc.netMonthlyUsd - expect) > eps)
      fail(`${o.netuid} ${sc.key}: net ${sc.netMonthlyUsd} ≠ gross ${sc.grossMonthlyUsd} − costs ${costs.totalUsd} (expect ${expect})`);
    // 9. meetsTarget mirror
    if (sc.meetsTarget !== (sc.netMonthlyUsd >= target))
      fail(`${o.netuid} ${sc.key}: meetsTarget mismatch`);
  }

  // 4. factor product
  const prod = c.factors.ramp * c.factors.uptime * c.factors.competition * c.factors.alpha;
  if (b.grossMonthlyUsd > 0 && Math.abs(c.grossMonthlyUsd - b.grossMonthlyUsd * prod) > eps)
    fail(`${o.netuid}: cons gross ${c.grossMonthlyUsd} ≠ base ${b.grossMonthlyUsd} × ${prod.toFixed(3)}`);

  // 5. optimistic = max(bull, base)
  if (Math.abs(u.grossMonthlyUsd - Math.max(o.profitability.scenarios.bull.grossMonthlyUsd, o.profitability.expectedRevenueUsd)) > eps)
    fail(`${o.netuid}: optimistic gross mismatch`);

  // 6. confidence bounds + band + drivers
  for (const sc of [c, b, u] as const) {
    if (sc.confidence < 0.05 || sc.confidence > 0.95) fail(`${o.netuid} ${sc.key}: confidence ${sc.confidence} out of range`);
    const expectBand = sc.confidence >= 0.7 ? "HIGH" : sc.confidence >= 0.45 ? "MEDIUM" : "LOW";
    if (sc.confidenceBand !== expectBand) fail(`${o.netuid} ${sc.key}: band ${sc.confidenceBand} ≠ ${expectBand}`);
    if (!sc.confidenceDrivers.length) fail(`${o.netuid} ${sc.key}: no confidence drivers`);
  }
  if (b.confidence < c.confidence - 0.001) fail(`${o.netuid}: base confidence below conservative (modifier inversion)`);

  // 7. verdict mapping
  const expectVerdict =
    b.netMonthlyUsd < 0 ? "LOSS_MAKING"
    : c.netMonthlyUsd >= target ? "RESILIENT"
    : c.netMonthlyUsd >= 0 ? "CASH_POSITIVE"
    : "RAMP_LOSS";
  if (e.conservativeVerdict !== expectVerdict) fail(`${o.netuid}: verdict ${e.conservativeVerdict} ≠ ${expectVerdict}`);
  verdictCensus[e.conservativeVerdict] = (verdictCensus[e.conservativeVerdict] ?? 0) + 1;
  confCensus[b.confidenceBand] = (confCensus[b.confidenceBand] ?? 0) + 1;

  // 8. rented basis → reality lines 0
  if (cfg.hardwareMode !== "owned") {
    const zero = (v: number) => Math.abs(v) < 0.05;
    if (!zero(costs.coolingUsd) || !zero(costs.maintenanceUsd) || !zero(costs.hardwareRecoveryUsd))
      fail(`${o.netuid}: rented basis charges cooling/maintenance/recovery (${costs.coolingUsd}/${costs.maintenanceUsd}/${costs.hardwareRecoveryUsd})`);
  }

  // cost stack total consistency
  const sum = costs.gpuOrElectricityUsd + costs.coolingUsd + costs.storageUsd + costs.infrastructureUsd +
    costs.maintenanceUsd + costs.registrationUsd + costs.hardwareRecoveryUsd + costs.otherUsd;
  if (Math.abs(sum - costs.totalUsd) > 0.5)
    fail(`${o.netuid}: cost lines sum ${sum.toFixed(1)} ≠ total ${costs.totalUsd}`);
}

console.log(`estimates: ${estMap.size} built · ${withPnl} rows with P&L · ${withoutPnl} without`);
console.log(`verdict census: ${JSON.stringify(verdictCensus)}`);
console.log(`base confidence census: ${JSON.stringify(confCensus)}`);

const ranked = [...estMap.values()].sort((a, b) => b.base.netMonthlyUsd - a.base.netMonthlyUsd);
console.log("\nTop 8 by BASE net earnings:");
for (const e of ranked.slice(0, 8)) {
  console.log(
    `  SN${String(e.netuid).padStart(3, "0")} ${e.subnetName.slice(0, 22).padEnd(22)} base ${e.base.netMonthlyUsd >= 0 ? " " : ""}$${e.base.netMonthlyUsd.toLocaleString()}/mo [${e.base.confidenceBand}] worst $${e.conservative.netMonthlyUsd.toLocaleString()} best $${e.optimistic.netMonthlyUsd.toLocaleString()} → ${e.conservativeVerdict}`
  );
}
console.log("\nWorst 3 by BASE net earnings:");
for (const e of ranked.slice(-3)) {
  console.log(`  SN${String(e.netuid).padStart(3, "0")} ${e.subnetName.slice(0, 22).padEnd(22)} base $${e.base.netMonthlyUsd.toLocaleString()}/mo [${e.base.confidenceBand}] → ${e.conservativeVerdict}`);
}

console.log(fails === 0 ? "\nALL INVARIANTS PASS" : `\n${fails} INVARIANT FAILURES`);
process.exit(fails === 0 ? 0 : 1);
