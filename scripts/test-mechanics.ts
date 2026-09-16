// ---------------------------------------------------------------------------
// MECHANICS-1 test — verifies the per-subnet mechanics knowledge layer:
//   1. rampWeeks override (official 7-day window vs bond-EMA heuristic)
//   2. bare-metal cost class (hosting-aware unit rent + control plane)
//   3. earn-chance ramp-penalty removal
//   4. keyword extractor precision
// Run: bun scripts/test-mechanics.ts
// ---------------------------------------------------------------------------

import {
  getMechanics,
  listCuratedMechanics,
  extractMechanicsFromText,
  mechanicsOverridesRamp,
} from "../src/lib/infranex/mechanics";
import {
  classifySubnetHardware,
  scoreMinersLedger,
  computeEarnChance,
  GPU_TIERS,
} from "../src/lib/infranex/miner-score";
import type { HostingRequirements } from "../src/lib/infranex/github-scraper";
import type { LiveSubnetMetrics } from "../src/lib/infranex/chain";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

// --- Synthetic SN64-shaped live metrics (not chain-dependent) --------------
const live: LiveSubnetMetrics = {
  netuid: 64,
  name: "Chutes",
  minersCount: 256,
  validatorsCount: 12,
  subnetTao: 1_400_000,
  alphaIn: 0,
  alphaOut: 1_000_000,
  tempo: 360,
  emissionEnabled: true,
  movingPrice: 0.0000072,
  emission: 0.9,
  emissionTaoPerDay: 648,
  minerEmissionTaoPerDay: 265.7,
  rewardedMiners: 17,
  top10IncentiveShare: 1.0,
  incentiveMedianShare: 0.0,
  burnCostTao: 0.0005,
  immunityBlocks: 7200,
  alphaPriceChange24h: -2.1,
  maxUids: 256,
  owner: "root",
  registeredAt: 7_100_000,
  identityGithub: "https://github.com/chutesai/chutes",
  identityDescription: "Serverless AI compute — chutes.ai",
};

const chutesHosting: HostingRequirements = {
  bareMetalOnly: true,
  teeRequired: true,
  staticIpRequired: true,
  notes: [
    "ALL servers must be bare metal/VM, meaning it will not work on Runpod, Vast, etc.",
  ],
};

const scraped = {
  recommendedGpu: "8x H200",
  gpuCount: 8,
  minVramGb: 141,
  hosting: chutesHosting,
  requirementsSource: "https://github.com/chutesai/chutes-miner",
};

console.log("\n== 1. Curated map ==");
const m64 = getMechanics(64);
check("getMechanics(64) returns Chutes entry", m64?.subnetName === "Chutes");
check(
  "reward window = 7 days",
  m64?.rewardWindowDays === 7,
  `got ${m64?.rewardWindowDays}`
);
check("getMechanics(1) returns null (no curated entry)", getMechanics(1) === null);
check("listCuratedMechanics has ≥1 entry", listCuratedMechanics().length >= 1);
check(
  "mechanicsOverridesRamp true for SN64",
  mechanicsOverridesRamp(m64) === true
);
check(
  "optimization targets ≥ 5",
  (m64?.optimizationTargets.length ?? 0) >= 5,
  `${m64?.optimizationTargets.length} targets`
);

console.log("\n== 2. Classifier — bare-metal cost class ==");
const hwBare = classifySubnetHardware("Chutes", "Serverless AI compute", {
  scraped,
  mechanics: m64,
});
check("costClass = bare-metal", hwBare.costClass === "bare-metal");
check(
  "unitRent = H200 bare-metal rate ($7000)",
  hwBare.unitRentUsd === GPU_TIERS.h200.bareMetalMonthlyUsd && hwBare.unitRentUsd === 7000,
  `$${hwBare.unitRentUsd}/mo per GPU`
);
check(
  "monthlyCost = 8×7000 + infra(40) + control plane(120)",
  hwBare.monthlyCostUsd === 7000 * 8 + 40 + 120,
  `$${hwBare.monthlyCostUsd}`
);

const hwContainer = classifySubnetHardware("Chutes", "Serverless AI compute", {
  scraped: { ...scraped, hosting: null },
});
check(
  "hosting null → container class + container rent",
  hwContainer.costClass === "container" &&
    hwContainer.monthlyCostUsd === GPU_TIERS.h200.monthlyRentUsd * 8 + 40,
  `$${hwContainer.monthlyCostUsd}`
);

console.log("\n== 3. Ledger — ramp override + costs ==");
const withM = scoreMinersLedger({ live, taoUsd: 215, hardware: hwBare, mechanics: m64 });
const noM = scoreMinersLedger({ live, taoUsd: 215, hardware: hwBare });
const containerM = scoreMinersLedger({ live, taoUsd: 215, hardware: hwContainer });

check(
  "rampWeeks = 1.0 (official 7-day window)",
  withM.diag.rampWeeks === 1,
  `${withM.diag.rampWeeks} wk`
);
check(
  "rampWeeksSource = official-reward-window",
  withM.diag.rampWeeksSource === "official-reward-window"
);
check(
  "mechanicsApplied lists the official repos",
  (withM.diag.mechanicsApplied ?? []).some((s) => s.includes("chutes-miner"))
);
check(
  "without mechanics: heuristic ramp (~13.6 wk for these vecs)",
  noM.diag.rampWeeksSource === "bond-ema-heuristic" && (noM.diag.rampWeeks ?? 0) > 8,
  `${noM.diag.rampWeeks} wk`
);
check(
  "scoreRamp improved: 90−5×ramp → earning reality up",
  withM.components.earning_reality > noM.components.earning_reality,
  `${withM.components.earning_reality} vs ${noM.components.earning_reality}`
);
check(
  "bare-metal GPU cost = $56,000/mo (8×$7000)",
  withM.diag.gpuCostMonthlyUsd === 56000,
  `$${withM.diag.gpuCostMonthlyUsd}`
);
check(
  "infra includes control plane ($160)",
  withM.diag.infraCostMonthlyUsd === 160,
  `$${withM.diag.infraCostMonthlyUsd}`
);
check(
  "container path unchanged: 8×$2500",
  containerM.diag.gpuCostMonthlyUsd === 20000,
  `$${containerM.diag.gpuCostMonthlyUsd}`
);
check(
  "costClass surfaces in diag",
  withM.diag.costClass === "bare-metal" && containerM.diag.costClass === "container"
);

console.log("\n== 4. Earn chance — ramp penalty removed ==");
const fastRamp = computeEarnChance({
  rewardedRatio: 17 / 256,
  freeSlots: 0,
  top10IncentiveShare: 1.0,
  rampWeeks: 1,
});
const slowRamp = computeEarnChance({
  rewardedRatio: 17 / 256,
  freeSlots: 0,
  top10IncentiveShare: 1.0,
  rampWeeks: 13.6,
});
check(
  "no ramp-penalty factor when ramp ≤ 8wk",
  !fastRamp.note.includes("wk ramp") && slowRamp.note.includes("wk ramp"),
  `fast note: "${fastRamp.note}"`
);
check(
  "odds stay LOW honestly (17/256, whale-dominated)",
  fastRamp.level === "low" || fastRamp.level === "none",
  `${fastRamp.level} · ${fastRamp.note}`
);

console.log("\n== 5. Keyword extractor — precision ==");
const tldr = `
Incentives are based on total compute time (including bounties given from being first to provide inference on code app).
You should probably run a wide variety of GPUs, from very cheap (a10, a5000, t4, etc.) to very powerful (8x h100 nodes).
Incentives/weights are calculated from 7 day sum of compute, so be patient when you start mining.
`;
const ex = extractMechanicsFromText(tldr);
check("extracts 7-day window", ex.rewardWindowDays === 7, `${ex.rewardWindowDays}`);
check("detects bounty program", ex.bountyProgram);
check("detects GPU-variety guidance", ex.gpuVarietyGuidance);
check("evidence lines ≥ 3", ex.evidence.length >= 3, `${ex.evidence.length} quotes`);

const benign = extractMechanicsFromText(
  "Miners should provide uptime for the API. Rewards are distributed by the validator daily."
);
check("benign text → no window extracted", benign.rewardWindowDays === null);
check("benign text → no variety false-positive", !benign.gpuVarietyGuidance);

console.log("\n== 6. Honest verdict stays AVOID for SN64 ==");
// Bare-metal reality: $56k+/mo GPU cost vs ~$19k/mo mid-pack gross → net negative.
check(
  "SN64 net stays negative under bare-metal pricing",
  withM.diag.netMonthlyUsd < 0,
  `−$${Math.abs(withM.diag.netMonthlyUsd).toLocaleString()}/mo`
);
check(
  "AVOID verdict preserved (seat safety still low)",
  withM.components.seat_safety < 40,
  `seat ${withM.components.seat_safety}`
);

// ---------------------------------------------------------------------------
// MECHANICS-ALL — derived mechanics tier (README-extracted, provenance tag)
// ---------------------------------------------------------------------------

import { buildDerivedMechanics } from "../src/lib/infranex/mechanics";

console.log("\n== 7. Extractor — new window phrasings ==");
const winVariants: [string, number][] = [
  ["Weights are computed over a 10-day window.", 10],
  ["The scoring window of 14 days keeps churn low.", 14],
  ["Rewards use a 5 day rolling window of inference.", 5],
  ["Scores consider the past 21 days lookback of serving.", 21],
];
for (const [txt, expected] of winVariants) {
  const r = extractMechanicsFromText(txt);
  check(`window "${txt.slice(0, 38)}…" → ${expected}d`, r.rewardWindowDays === expected, `${r.rewardWindowDays}`);
}
// 30+ days must be rejected as out-of-band (d>30 guard).
const tooLong = extractMechanicsFromText("Weights consider a 90 day window of compute.");
check("90-day window rejected (guard 1-30)", tooLong.rewardWindowDays === null);

// Decay-family phrasing (EMA/half-life) = same class the generic bond-EMA
// heuristic models, and payout-cadence phrasing (installments/persistence)
// is release timing, not weight buildup — neither may become a fixed window.
const ema = extractMechanicsFromText(
  "Scores enter a 12-day half-life moving average (your standing), weighted by miner rank."
);
check("half-life moving average → NO fixed window", ema.rewardWindowDays === null);
const ema2 = extractMechanicsFromText("Incentives are an exponential moving average over 21 days of serving.");
check("exponential moving average → NO fixed window", ema2.rewardWindowDays === null);
const payout = extractMechanicsFromText(
  "Each reward releases in installments over a 30-day persistence window before full liquidity."
);
check("payout-cadence installments → NO fixed window", payout.rewardWindowDays === null);
const stillFixed = extractMechanicsFromText("Weights are computed over a 10-day window.");
check("plain fixed window still extracted after guards", stillFixed.rewardWindowDays === 10);

console.log("\n== 8. Extractor — one-UID policy ==");
const oneUidA = extractMechanicsFromText(
  "Never register more than one UID, since it will just reduce your total compute time."
);
check("detects 'never register more than one UID'", oneUidA.oneUidRule);
check("UID evidence line captured", oneUidA.evidence.some((e) => /UID/i.test(e)));
const oneUidB = extractMechanicsFromText("Run exactly one UID per miner hotkey for best results.");
check("detects 'one UID per hotkey'", oneUidB.oneUidRule);
const uidBenign = extractMechanicsFromText(
  "Each UID is assigned a slot by the metagraph. UID ordering is deterministic."
);
check("prose 'UID' mentions → no false positive", !uidBenign.oneUidRule);

console.log("\n== 9. Derived builder — sparse entry + null gating ==");
const nothing = buildDerivedMechanics({
  netuid: 42,
  subnetName: "Generic",
  sourceUrl: "https://github.com/example/repo",
  extracted: { rewardWindowDays: null, bountyProgram: false, gpuVarietyGuidance: false, oneUidRule: false, evidence: [] },
  hosting: null,
});
check("nothing detected → null (no empty blocks)", nothing === null);

const hostingOnly = buildDerivedMechanics({
  netuid: 7,
  subnetName: "BareSub",
  sourceUrl: "https://github.com/example/baresub",
  extracted: { rewardWindowDays: null, bountyProgram: false, gpuVarietyGuidance: false, oneUidRule: false, evidence: [] },
  hosting: { bareMetalOnly: true, teeRequired: false, staticIpRequired: true, notes: ["Nodes must run on dedicated hardware with a static IP."] },
});
check("hosting-only → entry with ops, no window", hostingOnly !== null && hostingOnly.rewardWindowDays == null);
check(
  "hosting ops = bare-metal + static IP",
  (hostingOnly?.operations.some((o) => o.title.includes("Bare-metal")) ?? false) &&
    (hostingOnly?.operations.some((o) => o.title.includes("Static IP")) ?? false)
);
check("provenance = derived", hostingOnly?.provenance === "derived");

const full = buildDerivedMechanics({
  netuid: 99,
  subnetName: "FullSpec",
  sourceUrl: "https://github.com/example/fullspec",
  extracted: extractMechanicsFromText(
    "Weights are computed over a 10-day window. Bounties are paid for first-to-serve. " +
      "Run a variety of GPUs for coverage. Never register more than one UID."
  ),
  hosting: { bareMetalOnly: false, teeRequired: true, staticIpRequired: false, notes: ["Workers must run inside a TEE with attestation."] },
});
check("full text → 10-day window", full?.rewardWindowDays === 10);
check("window quote is verbatim evidence", /10-day window/i.test(full?.rewardWindowQuote ?? ""));
check("bounty + variety captured", full?.bountyQuote != null && full?.gpuVariety != null);
check(
  "ops = one-UID + TEE",
  (full?.operations.some((o) => o.title.includes("One UID")) ?? false) &&
    (full?.operations.some((o) => o.title.includes("TEE")) ?? false)
);
check("no catalog for derived variety", full?.gpuVariety?.catalog.length === 0);
check("no control-plane cost on derived (curated-only)", full?.controlPlaneMonthlyUsd == null);

console.log("\n== 10. Ledger — derived mechanics drive ramp + label ==");
const derivedM = buildDerivedMechanics({
  netuid: 99,
  subnetName: "FullSpec",
  sourceUrl: "https://github.com/example/fullspec",
  extracted: extractMechanicsFromText("Weights are computed over a 10-day window of compute."),
  hosting: null,
});
const derivedLedger = scoreMinersLedger({
  live: { ...live, netuid: 99, name: "FullSpec" },
  taoUsd: 215,
  hardware: hwContainer,
  mechanics: derivedM,
});
check(
  "derived 10-day window → ramp ≈ 1.4 wk",
  derivedLedger.diag.rampWeeks != null &&
    Math.abs(derivedLedger.diag.rampWeeks - 10 / 7) < 0.05,
  `${derivedLedger.diag.rampWeeks} wk`
);
check(
  "rampWeeksSource = readme-derived (NOT official)",
  derivedLedger.diag.rampWeeksSource === "readme-derived"
);
check(
  "curated path unchanged: SN64 still official-reward-window",
  withM.diag.rampWeeksSource === "official-reward-window"
);
check(
  "derived no control plane → infra stays base",
  derivedLedger.diag.infraCostMonthlyUsd === withM.diag.infraCostMonthlyUsd - 120,
  `infra $${derivedLedger.diag.infraCostMonthlyUsd} (no $120 control plane)`
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
