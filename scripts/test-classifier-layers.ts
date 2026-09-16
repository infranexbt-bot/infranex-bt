/** Unit-verify the layered classifier: hosting-only / gpu+hosting / multi-GPU. */
import { classifySubnetHardware } from "../src/lib/infranex/miner-score";

const hosting = { bareMetalOnly: false, teeRequired: true, staticIpRequired: false, notes: ["TEE Attestation"] };
const p = classifySubnetHardware("Leadpoet", "lead scoring marketplace", {
  scraped: { recommendedGpu: null, gpuCount: null, hosting, requirementsSource: "https://github.com/leadpoet/leadpoet" },
});
console.log("SN71 hosting-only:", p.tier.label, "|", p.recommendedGpu, "| category:", p.category, "| hosting:", !!p.hosting);

const p2 = classifySubnetHardware("Chutes", "Serverless Compute for AI", {
  scraped: { recommendedGpu: "H200", gpuCount: 1, hosting: { bareMetalOnly: true, teeRequired: true, staticIpRequired: true, notes: [] }, requirementsSource: "x" },
});
console.log("SN64 gpu+hosting :", p2.tier.label, "|", p2.recommendedGpu, "| category:", p2.category, "| cost:", p2.monthlyCostUsd);

const p3 = classifySubnetHardware("X", "y", {
  scraped: { recommendedGpu: "8x H200", gpuCount: 8, hosting: null, requirementsSource: "x" },
});
console.log("8x H200 case     :", p3.tier.label, "|", p3.recommendedGpu, "| gpuCount:", p3.gpuCount, "| cost:", p3.monthlyCostUsd);

const p4 = classifySubnetHardware("Plain", "no scraped data", {});
console.log("no-scraped       :", p4.tier.label, "|", p4.recommendedGpu, "| category:", p4.category);
