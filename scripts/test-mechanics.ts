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
  noM.diag.rampWeeksSource === "bond-ema-heuristic" && noM.diag.rampWeeks > 8,
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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
