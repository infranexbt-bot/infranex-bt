// analyze-iota.ts — run the app's own opportunity engine on the live
// snapshot and print the full verdict breakdown for subnet 9 (IOTA).
// Replicates exactly what OpportunitiesView computes in the browser.
import * as fs from "fs";

import { mergeOpportunities } from "../src/lib/infranex/live-merge";
import { computeVerdictMapFor } from "../src/lib/infranex/verdict";
import { computeMinePickMap } from "../src/lib/infranex/mine-pick";
import { costBasisFromConfig } from "../src/lib/infranex/rent-earn";
import { computeNetEarningsMap } from "../src/lib/infranex/net-earnings";
import { computeOpportunityScoreMap } from "../src/lib/infranex/subnet-opportunity";
import { classifyOpportunityMap } from "../src/lib/infranex/opportunity-class";
import { computeEntryDifficultyMap } from "../src/lib/infranex/entry-difficulty";
import { computeDiligence } from "../src/lib/infranex/diligence";
import type { ProfitabilityConfig } from "../src/lib/infranex/profitability";
import type { LiveNetworkSnapshot } from "../src/lib/infranex/live-merge";

const snap = JSON.parse(
  fs.readFileSync("/tmp/network.json", "utf8")
) as LiveNetworkSnapshot;

const rawOvr = JSON.parse(fs.readFileSync("/tmp/overrides.json", "utf8"));
const overrides = new Map<number, Record<string, unknown>>();
for (const o of rawOvr.overrides as Record<string, unknown>[]) {
  const entry: Record<string, unknown> = {};
  if (o.name) entry.name = o.name;
  if (o.description) entry.description = o.description;
  if (o.category) entry.category = o.category;
  if (o.minVramGb != null) entry.minVramGb = o.minVramGb;
  if (o.recommendedGpu) entry.recommendedGpu = o.recommendedGpu;
  if (o.gpuCount != null) entry.gpuCount = o.gpuCount;
  if (o.hostingRequirements) {
    try {
      entry.hosting = JSON.parse(o.hostingRequirements as string);
    } catch {
      /* corrupt JSON — ignore */
    }
  }
  if (o.mechanicsJson) {
    try {
      entry.mechanics = JSON.parse(o.mechanicsJson as string);
    } catch {
      /* ignore */
    }
  }
  if (o.requirementsSource) entry.requirementsSource = o.requirementsSource;
  overrides.set(Number(o.netuid), entry);
}

const profConfig = JSON.parse(
  fs.readFileSync("/tmp/profconfig.json", "utf8")
) as ProfitabilityConfig;

console.log(
  "CONFIG: hardwareMode=%s rigVram=%sGB electricity=$%s/kWh capex=$%s target=$%s/mo taoGoal=%s",
  profConfig.hardwareMode,
  (profConfig as unknown as { rigGpuVramGb?: number }).rigGpuVramGb,
  (profConfig as unknown as { electricityUsdPerKwh?: number })
    .electricityUsdPerKwh,
  (profConfig as unknown as { rigCapexUsd?: number }).rigCapexUsd,
  profConfig.minNetProfitTargetUsd,
  (profConfig as unknown as { targetTaoPerMonth?: number }).targetTaoPerMonth
);

const rows = mergeOpportunities(snap, profConfig, overrides);
const row = rows.find((r) => r.netuid === 9);
if (!row) {
  console.log("NO ROW for netuid 9 — total rows:", rows.length);
  process.exit(0);
}

const pick = computeMinePickMap(rows, costBasisFromConfig(profConfig)).get(
  row.id
);
const score = computeOpportunityScoreMap(rows as never[], {
  hardwareMode: profConfig.hardwareMode === "owned" ? "owned" : "rented",
  minNetTargetUsd: profConfig.minNetProfitTargetUsd,
  weights: profConfig.opportunityWeights,
}).get(row.id);
const est = computeNetEarningsMap(rows as never[], {
  minNetTargetUsd: profConfig.minNetProfitTargetUsd,
  hardwareMode: profConfig.hardwareMode,
}).get(row.id);
const diffMap = computeEntryDifficultyMap(rows as never[]);
const diff = diffMap.get(row.id) as
  | { difficulty: string; easeScore?: number; reasons: string[] }
  | undefined;
const cls = classifyOpportunityMap(rows as never, (o) => ({
  score: scoreMapGet(o.id),
  est: estMapGet(o.id) ?? null,
  difficulty: diffMap.get(o.id) as never,
})).get(row.id) as
  | { action: string; headline: string; reasons: string[]; upgradePath?: string }
  | undefined;
// helpers referencing the maps built above (hoisted access for the closure)
function scoreMapGet(id: string) {
  return score;
}
function estMapGet(id: string) {
  return est;
}
const verdict = computeVerdictMapFor(rows as never[], profConfig).get(row.id);

console.log("\n=== ROW (netuid 9 · IOTA) ===");
console.log(
  JSON.stringify(
    {
      id: row.id,
      name: row.subnetName,
      symbol: row.subnetSymbol,
      minVramGb: row.minVramGb,
      recommendedGpu: row.recommendedGpu,
      gpuCount: row.gpuCount,
      hosting: row.hosting,
      requirementsSource: row.requirementsSource,
      hardwareClassified: row.hardwareClassified,
      netMonthlyUsd: row.netMonthlyUsd,
      estimatedMonthlyRewardUsd: row.estimatedMonthlyRewardUsd,
      grossMonthlyUsd: row.grossMonthlyUsd,
      gpuCostMonthlyUsd: row.gpuCostMonthlyUsd,
      infraCostMonthlyUsd: row.infraCostMonthlyUsd,
      meetsMinimum: row.meetsMinimum,
      riskLevel: row.riskLevel,
      rewardRealizability: row.rewardRealizability,
      totalSlots: row.totalSlots,
      freeSlots: row.freeSlots,
      rewardedRatio: row.rewardedRatio,
      burnCostTao: row.burnCostTao,
      payoutVerified: row.payoutVerified ?? row.rewardVerifiable ?? "n/a",
    },
    null,
    1
  )
);

console.log("\n=== VERDICT ===", verdict);
console.log("\n=== SCORE ===");
console.log(
  JSON.stringify(
    score
      ? {
          effectiveScore: score.effectiveScore,
          rawScore: score.rawScore,
          dataConfidence: score.dataConfidence,
          band: score.band,
          gates: score.gates,
          factors: score.factors ?? score.factorScores,
        }
      : null,
    null,
    1
  )
);

console.log("\n=== CLASSIFICATION ===");
console.log(
  JSON.stringify(
    cls
      ? {
          action: cls.action,
          headline: cls.headline,
          reasons: cls.reasons,
          upgradePath: cls.upgradePath,
        }
      : null,
    null,
    1
  )
);

console.log("\n=== MINE PICK (conviction lens) ===");
console.log(
  JSON.stringify(
    pick
      ? {
          band: pick.band,
          conviction: pick.conviction,
          verdict: pick.verdict,
          reasons: pick.reasons,
          rent: pick.rent,
        }
      : null,
    null,
    1
  )
);

console.log("\n=== NET EARNINGS ===");
console.log(
  JSON.stringify(
    est
      ? {
          base: est.base,
          conservative: {
            netMonthlyUsd: est.conservative.netMonthlyUsd,
            note: est.conservative.note,
          },
          optimistic: {
            netMonthlyUsd: est.optimistic.netMonthlyUsd,
            note: est.optimistic.note,
          },
          conservativeVerdict: est.conservativeVerdict,
        }
      : null,
    null,
    1
  )
);

console.log("\n=== PROFITABILITY (row-level P&L) ===");
console.log(JSON.stringify(row.profitability ?? null, null, 1));

console.log("\n=== ENTRY DIFFICULTY ===");
console.log(
  JSON.stringify(
    diff
      ? { difficulty: diff.difficulty, easeScore: diff.easeScore, reasons: diff.reasons }
      : null,
    null,
    1
  )
);

console.log("\n=== DILIGENCE (14 stages) ===");
const dil = computeDiligence(row as never, null, {
  hardwareMode: profConfig.hardwareMode === "owned" ? "owned" : "rent",
});
console.log("verdict:", dil.verdict, "| fails:", dil.failCount, "| warns:", dil.warnCount, "| passes:", dil.passCount);
for (const s of dil.stages) {
  if (s.status === "fail" || s.status === "warn") {
    console.log(` [${s.status.toUpperCase()}] #${s.n} ${s.label}: ${s.value} — ${s.detail}`);
  }
}
