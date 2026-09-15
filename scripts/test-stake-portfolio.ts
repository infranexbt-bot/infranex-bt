/**
 * STAKE-PORTFOLIO-1 — read-only hotkey stake portfolio, unit + live + API.
 *
 *   1. UNIT — buildHotkeyPortfolio aggregation math (no network).
 *   2. LIVE — fetchStakePortfolio against Finney with a real hotkey.
 *   3. API  — GET /api/wallets/stake-portfolio against the running server.
 *
 * Usage:
 *   bun scripts/test-stake-portfolio.ts              (unit + live)
 *   BASE=http://localhost:3000 bun scripts/test-stake-portfolio.ts --api
 */
import { buildHotkeyPortfolio, fetchStakePortfolio } from "../src/lib/infranex/stake-portfolio";
import { SS58_RE } from "../src/lib/infranex/runway";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`PASS — ${name}`);
  } else {
    fail++;
    console.log(`FAIL — ${name}${detail ? ` (${detail})` : ""}`);
  }
}

// --- 1. UNIT -----------------------------------------------------------------
const HK = "5EKtvzbEvYZPRJdo42ug7mWrHdt4AurCNMs5CAefuBHfQmhq";
const COLD = "5HDgs3ThsX8SoNFqVJUgbdqAZRJX9B6KR7QUbSmLFAfdFYJK";

{
  const p = buildHotkeyPortfolio({
    hotkey: HK,
    coldkey: COLD,
    taoPriceUsd: 200,
    coldFreeTao: 0.5,
    coldReservedTao: 0.1,
    label: "Test wallet",
    lifetimeEarnedTao: 1.23456,
    lifetimeEarnedUsd: 246.91,
    linkedDeployments: 2,
    rawPositions: [
      // 1,233,492,912 rao = 1.233492912 α (the live probe value) @ 0.02
      { netuid: 64, rawAlpha: "1233492912", alphaPriceTao: 0.02, alphaChange24hPct: 5.1, subnetName: "Chutes" },
      // 2 whole alpha @ 0.005 → 0.01 TAO
      { netuid: 4, rawAlpha: "2000000000", alphaPriceTao: 0.005, alphaChange24hPct: -2.0, subnetName: "Targon" },
      // zero-alpha row must be dropped
      { netuid: 68, rawAlpha: "0", alphaPriceTao: 0.01, alphaChange24hPct: null, subnetName: "NOVA" },
    ],
  });

  check("unit: rao→alpha conversion", Math.abs(p.positions[0].alpha - 1.233493) < 1e-5, String(p.positions[0].alpha));
  check("unit: zero-alpha positions dropped", p.positions.length === 2, String(p.positions.length));
  check("unit: sorted by TAO value desc", p.positions[0].netuid === 64, String(p.positions[0].netuid));
  check("unit: taoEquivalent = α × price", Math.abs(p.positions[0].taoEquivalent - 0.02467) < 1e-4, String(p.positions[0].taoEquivalent));
  check("unit: usd = tao × price", Math.abs(p.positions[0].usd - 4.934) < 0.01, String(p.positions[0].usd));
  check("unit: stakedTao = Σ", Math.abs(p.stakedTao - 0.03467) < 1e-3, String(p.stakedTao));
  check("unit: stakedUsd", Math.abs(p.stakedUsd - 6.934) < 0.02, String(p.stakedUsd));
  check("unit: coldkey + balances carried", p.coldkey === COLD && p.coldFreeTao === 0.5 && p.coldReservedTao === 0.1);
  check("unit: metadata carried", p.label === "Test wallet" && p.linkedDeployments === 2 && Math.abs(p.lifetimeEarnedTao - 1.23456) < 1e-4);
  check("unit: 24h drift carried", p.positions[0].alphaChange24hPct === 5.1 && p.positions[1].alphaChange24hPct === -2.0);
  check("unit: empty portfolio is honest zero", (() => {
    const e = buildHotkeyPortfolio({ hotkey: HK, coldkey: null, rawPositions: [], taoPriceUsd: 0 });
    return e.positions.length === 0 && e.stakedTao === 0 && e.stakedUsd === 0 && e.coldFreeTao === null;
  })());
}

// --- 2. LIVE -----------------------------------------------------------------
// First non-flag argument is the hotkey to probe live.
const LIVE_HK =
  process.argv.slice(2).find((a) => !a.startsWith("-")) ?? HK;
{
  console.log(`\nlive: reading portfolio for ${LIVE_HK}`);
  const t0 = Date.now();
  const report = await fetchStakePortfolio([LIVE_HK, "not-a-valid-address"]);
  const ms = Date.now() - t0;
  console.log(`  block ${report.blockNumber} · source ${report.source} · ${ms}ms · tao $${report.taoPriceUsd}`);
  for (const hk of report.hotkeys) {
    console.log(`  ${hk.hotkey.slice(0, 12)}… cold=${hk.coldkey?.slice(0, 10) ?? "null"} free=${hk.coldFreeTao} staked=${hk.stakedTao} TAO`);
    for (const p of hk.positions) {
      console.log(`    α${p.netuid} ${p.subnetName}: ${p.alpha} α @ ${p.alphaPriceTao} = ${p.taoEquivalent} TAO ($${p.usd}) 24h ${p.alphaChange24hPct ?? "—"}%`);
    }
  }
  check("live: block number present", (report.blockNumber ?? 0) > 9_000_000, String(report.blockNumber));
  check("live: one portfolio returned", report.hotkeys.length === 1, String(report.hotkeys.length));
  check("live: invalid address flagged", report.invalidHotkeys.length === 1, JSON.stringify(report.invalidHotkeys));
  check("live: owner resolved to SS58 coldkey", SS58_RE.test(report.hotkeys[0]?.coldkey ?? ""), String(report.hotkeys[0]?.coldkey));
  check("live: coldkey balance read", (report.hotkeys[0]?.coldFreeTao ?? -1) >= 0, String(report.hotkeys[0]?.coldFreeTao));
  check("live: no error", report.source !== "error", report.error);
  check("live: notes populated", report.notes.length >= 2, String(report.notes.length));
}

// --- 3. API ------------------------------------------------------------------
if (process.argv.includes("--api")) {
  const BASE = process.env.BASE ?? "http://localhost:3000";
  const fs = await import("node:fs");
  const path = await import("node:path");
  const users = JSON.parse(
    fs.readFileSync(new URL("./users.local.json", import.meta.url), "utf8")
  ) as Array<{ userId: string; code: string }>;
  const admin = users.find((u) => u.userId === "admin")!;
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: admin.userId, code: admin.code }),
  });
  const cookie = (login.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("infranex_session=")) ?? "";
  check("api: admin login", login.status === 200 && cookie.length > 0, `status ${login.status}`);

  const noAuth = await fetch(`${BASE}/api/wallets/stake-portfolio`, { cache: "no-store" });
  check("api: unauthenticated -> 401", noAuth.status === 401, String(noAuth.status));

  const withQ = await fetch(`${BASE}/api/wallets/stake-portfolio?hotkey=${LIVE_HK}`, {
    headers: { cookie }, cache: "no-store",
  });
  const j = await withQ.json().catch(() => null);
  check("api: ?hotkey= -> 200 live", withQ.status === 200 && j?.source !== "error", JSON.stringify(j?.error ?? withQ.status));
  check("api: query-resolved hotkey echoed", j?.hotkeys?.[0]?.hotkey === LIVE_HK);
  check("api: resolvedBy=query", j?.resolvedBy === "query", String(j?.resolvedBy));

  const registry = await fetch(`${BASE}/api/wallets/stake-portfolio`, {
    headers: { cookie }, cache: "no-store",
  });
  const jr = await registry.json().catch(() => null);
  check("api: registry resolution -> 200", registry.status === 200, String(registry.status));
  check("api: resolvedBy=registry", jr?.resolvedBy === "registry", String(jr?.resolvedBy));
  console.log(`  registry hotkeys: ${(jr?.hotkeys ?? []).length} · totals staked ${jr?.totals?.stakedTao} TAO`);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
