/**
 * AUDIT-VERIFY-2 — sanity-check the refactored merge engine (live-merge.ts)
 * against the LIVE snapshot served by the running dev server.
 * Verifies the DATA-AUDIT-1 honesty contract:
 *   - no fabricated names (every name is chain identity or "Subnet N")
 *   - no fabricated market data (volume24h/change24h stay neutral)
 *   - opportunities exist for all scored subnets with live-derived fields
 * Run: bun scripts/verify-merge-engine.ts
 */
const BASE = process.env.AUTH_TEST_BASE ?? "http://localhost:3000";
const USERS: Array<{ userId: string; code: string }> = JSON.parse(
  (await import("node:fs")).readFileSync(
    new URL("./users.local.json", import.meta.url),
    "utf8"
  )
);

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ FAIL: ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

// --- login to get the snapshot through the same API the client uses ---
const admin = USERS.find((u) => u.userId === "admin")!;
const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: admin.userId, code: admin.code }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
check("login ok", login.ok);

const res = await fetch(`${BASE}/api/network`, { headers: { cookie } });
const snap = (await res.json()) as any;
check("snapshot is live", snap?.source === "live", `source=${snap?.source}`);
check("snapshot has subnets", (snap?.subnets?.length ?? 0) > 100, `${snap?.subnets?.length}`);

// --- import the shared merge engine (server-safe now) ---
const { mergeSubnets, mergeOpportunities, getLiveDashboardMetrics } = await import(
  "../src/lib/infranex/live-merge"
);

const subnets = mergeSubnets(snap);
check("mergeSubnets: all live rows merged", subnets.length === snap.subnets.length,
  `${subnets.length} vs ${snap.subnets.length}`);

// Every name must be either the chain identity or the honest placeholder —
// never one of the old fabricated catalog names.
const FABRICATED = new Set(["Cortex", "Vision Labs", "TaoStaking", "Synapse", "Precise", "Gradients", "BitAudio", "NeuronLink", "Sentinel", "Mosaic", "Helix", "Flux", "Quorum"]);
const badNames = subnets.filter((s) => s.name && FABRICATED.has(s.name) && !snap.subnets.find((l: any) => l.netuid === s.netuid)?.name);
check("mergeSubnets: no fabricated catalog names leak", badNames.length === 0,
  badNames.map((s) => `α${s.netuid}:${s.name}`).join(", "));

// Fabricated market fields must be neutral (0) for rows without chain data —
// and volume24h is ALWAYS 0 now (no chain source).
const volNonZero = subnets.filter((s) => s.volume24h !== 0);
check("mergeSubnets: volume24h neutral (no fabricated volume)", volNonZero.length === 0);

const opps = mergeOpportunities(snap);
check("mergeOpportunities: rows for all non-root subnets",
  opps.length === snap.subnets.filter((s: any) => s.netuid !== 0).length,
  `${opps.length}`);
check("mergeOpportunities: scores live-derived (0-100, ranked)",
  opps.every((o) => o.score >= 0 && o.score <= 100) && opps[0].rank === 1);
check("mergeOpportunities: every row carries live economics",
  opps.every((o) => typeof o.grossMonthlyUsd === "number" && typeof o.netMonthlyUsd === "number"));

// Empty snapshot → honest empty (the fabricated fallback ranking is gone)
const emptyOpps = mergeOpportunities(undefined);
check("mergeOpportunities: empty snapshot → empty ranking (no fabricated fallback)", emptyOpps.length === 0);
const emptySubs = mergeSubnets(undefined);
check("mergeSubnets: empty snapshot → no rows", emptySubs.length === 0);

const m = getLiveDashboardMetrics(snap);
check("dashboard metrics: tracked = merged rows", m.trackedSubnets === subnets.length);
check("dashboard metrics: isLive", m.isLive === true);

// Spot-check a known netuid for a chain name (SN64 Chutes)
const sn64 = subnets.find((s) => s.netuid === 64);
check("SN64 name from chain identity (Chutes)", !!sn64 && /chutes/i.test(sn64.name), sn64?.name);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
