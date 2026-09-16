// Audit: what hardware does our classifier assign SN64 (Chutes)?
import { classifySubnetHardware } from "../src/lib/infranex/miner-score";

const r = classifySubnetHardware({
  netuid: 64,
  name: "Chutes",
  symbol: "d64",
  category: "Compute sharing",
  description: "Breakthrough Serverless Compute for AI, At Scale.",
} as never);
console.log(JSON.stringify({
  category: r.category,
  minVramGb: r.minVramGb,
  recommendedGpu: r.recommendedGpu,
  tier: r.tier?.label,
  monthlyCostUsd: r.monthlyCostUsd,
  classified: r.classified,
}, null, 1));
