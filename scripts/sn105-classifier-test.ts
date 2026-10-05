// Prove it: run the app's ACTUAL classifier on SN105's on-chain text.
import { classifySubnetHardware } from "../src/lib/infranex/miner-score";

const beamName = "Beam";
const beamDesc = "Decentralized bandwidth. A global network. Powering the open internet.";

const profile = classifySubnetHardware(beamName, beamDesc, {
  fallbackMonthlyUsd: 0,
});

console.log("INPUT  :", JSON.stringify({ name: beamName, description: beamDesc }));
console.log("OUTPUT :", JSON.stringify({
  category: profile.category,
  recommendedGpu: profile.recommendedGpu,
  minVramGb: profile.minVramGb,
  monthlyCostUsd: profile.monthlyCostUsd,
  classified: profile.classified,
}, null, 2));

// Control: same text minus the word 'bandwidth' → falls to revenue fallback (CPU)
const noBw = classifySubnetHardware(beamName, "A global network. Powering the open internet.", { fallbackMonthlyUsd: 0 });
console.log("\nCONTROL (text without 'bandwidth'):", JSON.stringify({
  category: noBw.category,
  recommendedGpu: noBw.recommendedGpu,
  minVramGb: noBw.minVramGb,
  classified: noBw.classified,
}));
