// Research script: why does the Dashboard say "Mine Epago α36" while the
// Opportunities page shows Epago at 46 / WATCH?
// Runs BOTH engines (dashboard's computeOpportunityScore + Opportunities'
// mergeOpportunities → Miner's Ledger) on the same live snapshot.
import { readFileSync } from "fs";
import { mergeOpportunities, type LiveNetworkSnapshot } from "../src/lib/infranex/use-network";
import { computeOpportunityScore } from "../src/lib/infranex/opportunity-score";
import { DEFAULT_PROFITABILITY_CONFIG } from "../src/lib/infranex/profitability";

const snap: LiveNetworkSnapshot = JSON.parse(readFileSync("/tmp/network.json", "utf8"));
const profConfig = DEFAULT_PROFITABILITY_CONFIG;

// ---------- Opportunities page engine (Miner's Ledger v2) ----------
const opps = mergeOpportunities(snap, profConfig);
const e = opps.find((o) => o.netuid === 36);
if (e) {
  console.log("=== OPPORTUNITIES PAGE — Miner's Ledger v2 (SN36 Epago) ===");
  console.log("score:", e.score, "| rank:", e.rank, "| riskLevel:", e.riskLevel);
  console.log("meetsMinimum:", e.meetsMinimum, "| verdict:", e.verdict);
  console.log("pillars:", JSON.stringify(e.factors?.map((f) => ({ name: f.name, raw: f.raw, weighted: f.value, weight: f.weight })), null, 1));
  const p = e.profitability!;
  console.log("profitability: gross $", p.expectedRevenueUsd, "| costs $", p.totalCostsUsd, "| net $", p.netMonthlyUsd, "| ROI", p.roiMonthlyPct + "%/mo", "| margin", p.profitMarginPct + "%");
  console.log("diag: perEarningDailyTao", e.perEarningMeanDailyTao, "| expectedDailyTao(newcomer)", e.estimatedDailyReward, "| rewardedRatio", e.rewardedRatio, "| top10Share", e.top10IncentiveShare, "| rampWeeks", e.rampWeeks, "| earnChance", JSON.stringify(e.earnChance));
  console.log("alpha: price $", e.alphaPriceUsd, "| 24h", e.alphaChange24h + "%", "| liq TAO", e.liquidityTao, "| slippage", e.slippagePct + "%");
  console.log("seats: total", e.totalSlots, "| free", e.freeSlots, "| util", e.utilization);
}

// ---------- Dashboard engine (TAO Opportunity Score) ----------
const score = computeOpportunityScore(snap, { capitalTao: 10, profConfig });
console.log("\n=== DASHBOARD — TAO Opportunity Score ===");
console.log("score:", score.score, "| confidence:", score.confidence, "| closeCall:", score.closeCall);
console.log("recommended:", score.recommended.strategy, score.recommended.title, "α" + score.recommended.netuid, "| ROI", score.recommended.roiMonthlyPct + "%/mo | net $", score.recommended.netMonthlyUsd + "/mo");
console.log("alternative:", score.alternative.strategy, score.alternative.title, "| ROI", score.alternative.roiMonthlyPct + "%/mo");
console.log("mining candidates (net-positive, ranked by ROI%/mo):");
score.alternatives.mining.forEach((m) => console.log("  ", m.netuid, m.name, m.roiMonthlyPct + "%/mo", "net $" + m.netMonthlyUsd, m.gpu));

// Where does Epago rank on the DASHBOARD's metric vs the OPPORTUNITIES metric?
const byRoi = [...opps].filter((o) => o.netuid !== 0 && o.meetsMinimum !== false && (o.netMonthlyUsd ?? 0) > 0)
  .sort((a, b) => (b.profitability?.roiMonthlyPct ?? 0) - (a.profitability?.roiMonthlyPct ?? 0));
console.log("\nEpago rank by dashboard metric (ROI%/mo):", byRoi.findIndex((o) => o.netuid === 36) + 1, "of", byRoi.length);
console.log("Epago rank by opportunities metric (composite score):", opps.findIndex((o) => o.netuid === 36) + 1, "of", opps.length);
console.log("\nTop-5 by composite score (what Opportunities ranks on):");
opps.slice(0, 5).forEach((o) => console.log("  ", o.netuid, o.subnetName, "score", o.score, "| ROI", o.profitability?.roiMonthlyPct + "%/mo"));
