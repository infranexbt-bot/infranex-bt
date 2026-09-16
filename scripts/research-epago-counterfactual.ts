// Counterfactual: score SN36 with emissionEnabled=true (matching its actual
// on-chain emission of 55.6 TAO/day) to quantify the flag's impact.
import { readFileSync } from "fs";
import { scoreMinersLedger, totalScore } from "../src/lib/infranex/miner-score";
import { classifySubnetHardware } from "../src/lib/infranex/miner-score";
import { computeProfitabilityReport, DEFAULT_PROFITABILITY_CONFIG } from "../src/lib/infranex/profitability";
import type { LiveNetworkSnapshot } from "../src/lib/infranex/use-network";

const snap: LiveNetworkSnapshot = JSON.parse(readFileSync("/tmp/network.json", "utf8"));
const live = snap.subnets.find((s) => s.netuid === 36)!;
console.log("flag as scanned:", live.emissionEnabled, "| actual emissionTaoPerDay:", live.emissionTaoPerDay);

const usd = snap.taoPriceUsd;
for (const flag of [false, true]) {
  const hw = classifySubnetHardware(live.name, live.identityDescription);
  const { components, diag } = scoreMinersLedger({
    live: { ...live, emissionEnabled: flag },
    taoUsd: usd,
    hardware: hw,
    liveAgeBlocks: snap.blockNumber - (live.registeredAt ?? 0),
    costs: {
      hardwareMode: DEFAULT_PROFITABILITY_CONFIG.hardwareMode,
      electricityUsdPerKwh: DEFAULT_PROFITABILITY_CONFIG.electricityUsdPerKwh,
      storageMonthlyUsd: DEFAULT_PROFITABILITY_CONFIG.storageMonthlyUsd,
      infraMonthlyUsd: DEFAULT_PROFITABILITY_CONFIG.infraMonthlyUsd,
      otherOpexMonthlyUsd: DEFAULT_PROFITABILITY_CONFIG.otherOpexMonthlyUsd,
      includeBurnAmortization: DEFAULT_PROFITABILITY_CONFIG.includeRegistrationBurn,
      amortizeBurnMonths: DEFAULT_PROFITABILITY_CONFIG.amortizeBurnMonths,
    },
  });
  const score = totalScore(components);
  const band = score >= 60 ? "RUN" : score >= 40 ? "WATCH" : "AVOID";
  console.log(`\nemissionEnabled=${flag} → composite ${score} → ${band}`);
  console.log("  pillars:", JSON.stringify(components));
  const prof = computeProfitabilityReport({
    grossMonthlyUsd: diag.grossMonthlyUsd,
    gpuRentMonthlyUsd: hw.tier.monthlyRentUsd,
    gpuPowerWatts: diag.gpuPowerWatts,
    autoInfraMonthlyUsd: Math.max(hw.monthlyCostUsd - hw.tier.monthlyRentUsd, 0),
    burnCostTao: live.burnCostTao,
    rampWeeks: diag.rampWeeks,
    bullGrossMonthlyUsd: diag.perEarningDailyTao > 0 ? diag.perEarningDailyTao * 30 * usd : undefined,
    taoUsd: usd,
    score: components,
    config: DEFAULT_PROFITABILITY_CONFIG,
  });
  console.log("  net $", prof.netMonthlyUsd, "/mo | ROI", prof.roiMonthlyPct + "%/mo | meetsMinimum", prof.meetsMinimum);
}
