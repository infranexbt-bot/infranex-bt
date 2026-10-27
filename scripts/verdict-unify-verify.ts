// VERDICT-UNIFY-2 verify — the unified verdict rule + its hard contracts.
//
//   A. UNIT (pure rule): unifiedVerdict() classification→verdict matrix.
//   B. LIVE CONTRACT: on the real merged snapshot —
//        · every RUN row: eff ≥ 50, dataConfidence ≥ 0.5, positive net,
//          classification ∈ {SCALE, TEST}, payout verified
//        · every AVOID-classified row (incl. ALL negative-net rows) → AVOID
//        · the WATCH band is reachable (no more WATCH=0 pathology)
//        · determinism: two passes agree bit-for-bit.

import { fetchLiveSnapshot } from "../src/lib/infranex/chain";
import { loadOverrides } from "../src/lib/infranex/optimization";
import { loadProfitabilityConfig } from "../src/lib/infranex/trust";
import { mergeOpportunities } from "../src/lib/infranex/live-merge";
import {
  unifiedVerdict,
  computeVerdictMapFor,
  VERDICT_RUN_MIN_SCORE,
  VERDICT_MIN_CONFIDENCE,
} from "../src/lib/infranex/verdict";
import type { OpportunityClassification } from "../src/lib/infranex/opportunity-class";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function cls(action: OpportunityClassification["action"], netuid = 1): OpportunityClassification {
  return {
    id: `t${netuid}`,
    netuid,
    action,
    headline: "test",
    reasons: [],
    upgradePath: null,
  };
}

// --- A. UNIT: the classification→verdict matrix ------------------------------
console.log("=== A. UNIT — unifiedVerdict matrix ===");
check("SCALE → RUN", unifiedVerdict(cls("SCALE")) === "RUN");
check("AVOID → AVOID", unifiedVerdict(cls("AVOID")) === "AVOID");
check("WATCHLIST → WATCH", unifiedVerdict(cls("WATCHLIST")) === "WATCH");
check(
  `TEST eff=${VERDICT_RUN_MIN_SCORE} conf=0.5 → RUN`,
  unifiedVerdict(cls("TEST"), { effectiveScore: 50, dataConfidence: 0.5 }) === "RUN"
);
check(
  `TEST eff=${VERDICT_RUN_MIN_SCORE - 0.1} conf=0.9 → WATCH`,
  unifiedVerdict(cls("TEST"), { effectiveScore: 49.9, dataConfidence: 0.9 }) === "WATCH"
);
check(
  `TEST eff=90 conf=${VERDICT_MIN_CONFIDENCE - 0.01} → WATCH`,
  unifiedVerdict(cls("TEST"), { effectiveScore: 90, dataConfidence: 0.49 }) === "WATCH"
);
check("TEST no score → WATCH (missing data never promotes)", unifiedVerdict(cls("TEST")) === "WATCH");
check("undefined cls → WATCH (never AVOID by fiat)", unifiedVerdict(undefined) === "WATCH");

// --- B. LIVE CONTRACT --------------------------------------------------------
console.log("\n=== B. LIVE — verdict contracts on the real snapshot ===");
const snap = await fetchLiveSnapshot();
const [overrides, profConfig] = await Promise.all([
  loadOverrides(),
  loadProfitabilityConfig(),
]);
const rows = mergeOpportunities(snap, profConfig, overrides);
const verdictMap = computeVerdictMapFor(rows as never, profConfig);

// Determinism
const verdictMap2 = computeVerdictMapFor(rows as never, profConfig);
let deterministic = verdictMap.size === verdictMap2.size;
if (deterministic)
  for (const [k, v] of verdictMap) if (verdictMap2.get(k) !== v) { deterministic = false; break; }
check("determinism — two passes identical", deterministic, `${verdictMap.size} rows`);

// Imports for the contract inputs (same engines the views use)
const { computeOpportunityScoreMap } = await import("../src/lib/infranex/subnet-opportunity");
const { classifyOpportunityMap } = await import("../src/lib/infranex/opportunity-class");
const { computeNetEarningsMap } = await import("../src/lib/infranex/net-earnings");
const { computeEntryDifficultyMap } = await import("../src/lib/infranex/entry-difficulty");
const scoreMap = computeOpportunityScoreMap(rows as never[], {
  hardwareMode: profConfig?.hardwareMode === "owned" ? "owned" : "rented",
  minNetTargetUsd: profConfig?.minNetProfitTargetUsd,
  weights: profConfig?.opportunityWeights,
});
const estMap = computeNetEarningsMap(rows as never[], {
  minNetTargetUsd: profConfig?.minNetProfitTargetUsd,
  hardwareMode: profConfig?.hardwareMode,
});
const diffMap = computeEntryDifficultyMap(rows as never[]);
const clsMap = classifyOpportunityMap(rows as never, (o) => ({
  score: scoreMap.get(o.id),
  est: estMap.get(o.id) ?? null,
  difficulty: diffMap.get(o.id),
}));

const dist = { RUN: 0, WATCH: 0, AVOID: 0 } as Record<string, number>;
for (const v of verdictMap.values()) dist[v] = (dist[v] ?? 0) + 1;
console.log(`distribution: RUN=${dist.RUN} WATCH=${dist.WATCH} AVOID=${dist.AVOID} (rows=${rows.length})`);

// Contract 1 — every RUN row is fully evidence-backed
let runOk = true;
const runBad: string[] = [];
const runList: string[] = [];
for (const o of rows) {
  const v = verdictMap.get(o.id);
  if (v !== "RUN") continue;
  const ro = o as never as Record<string, unknown>;
  const s = scoreMap.get(o.id);
  const c = clsMap.get(o.id);
  const net = ro.netMonthlyUsd as number | null;
  const payoutVerified = Boolean(ro.mechanics || ro.requirementsSource);
  if (!c || (c.action !== "SCALE" && c.action !== "TEST")) runOk = false, runBad.push(`SN${ro.netuid} cls=${c?.action}`);
  if (!s || s.effectiveScore < VERDICT_RUN_MIN_SCORE) runOk = false, runBad.push(`SN${ro.netuid} eff=${s?.effectiveScore}`);
  if (!s || s.dataConfidence < VERDICT_MIN_CONFIDENCE) runOk = false, runBad.push(`SN${ro.netuid} conf=${s?.dataConfidence}`);
  if (net != null && net <= 0) runOk = false, runBad.push(`SN${ro.netuid} net=${net}`);
  if (!payoutVerified) runOk = false, runBad.push(`SN${ro.netuid} payout-unverified`);
  runList.push(`SN${ro.netuid} ${ro.subnetName} eff=${s?.effectiveScore} conf=${Math.round((s?.dataConfidence ?? 0) * 100)}% cls=${c?.action} net=$${Math.round(net ?? 0)}/mo`);
}
check("every RUN: cls∈{SCALE,TEST} · eff≥50 · conf≥0.5 · net>0 · payout verified", runOk, runBad.join(" | "));
console.log("  RUN rows:");
for (const l of runList) console.log(`    ${l}`);

// Contract 2 — AVOID classification ⇒ AVOID verdict, incl. every negative-net row
let avoidOk = true;
const avoidBad: string[] = [];
for (const o of rows) {
  const c = clsMap.get(o.id);
  if (c?.action !== "AVOID") continue;
  if (verdictMap.get(o.id) !== "AVOID") {
    avoidOk = false;
    avoidBad.push(`${(o as never as Record<string, unknown>).netuid}`);
  }
}
check("AVOID classification ⇒ AVOID verdict (all rows)", avoidOk, avoidBad.join(","));
let negOk = true;
const negBad: string[] = [];
for (const o of rows) {
  const net = (o as never as Record<string, unknown>).netMonthlyUsd as number | null;
  if (net != null && net <= 0 && verdictMap.get(o.id) === "RUN") {
    negOk = false;
    negBad.push(`${(o as never as Record<string, unknown>).netuid}`);
  }
}
check("negative-net row NEVER reads RUN", negOk, negBad.join(","));

// Contract 3 — payout-unverified rows never RUN (cap 49 < 50 by construction)
let payoutOk = true;
const payoutBad: string[] = [];
for (const o of rows) {
  const ro = o as never as Record<string, unknown>;
  const verified = Boolean(ro.mechanics || ro.requirementsSource);
  if (!verified && verdictMap.get(o.id) === "RUN") {
    payoutOk = false;
    payoutBad.push(`${ro.netuid}`);
  }
}
check("payout-unverified row NEVER reads RUN", payoutOk, payoutBad.join(","));

// Contract 4 — the WATCH band is reachable (killed the WATCH=0 pathology)
check("WATCH band non-empty (WATCH=0 pathology gone)", dist.WATCH > 0, `WATCH=${dist.WATCH}`);

console.log(
  failures === 0
    ? "\nALL VERDICT-UNIFY-2 CHECKS PASS"
    : `\n${failures} CHECK(S) FAILED`
);
process.exit(failures === 0 ? 0 : 1);
