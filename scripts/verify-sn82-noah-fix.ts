/**
 * verify-sn82-noah-fix.ts — NOAH-FIX regression check.
 *
 * SN82 changed identity (Compelle → Noah). The classifier must resolve it to
 * the CPU tier, never the revenue-based "H200 141GB" guess.
 */
import { classifySubnetHardware } from "../src/lib/infranex/miner-score";

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const NOAH_DESC =
  "Noah scores registered miners on eligible NOAH earnings and qualifying contributions to the Ark.";

// 1. Classifier-only path (live-merge call site WITHOUT scraped data)
const p1 = classifySubnetHardware("Noah", NOAH_DESC, {
  fallbackMonthlyUsd: 20600, // what used to trigger the H200 revenue guess
});
check("rule path: classified", p1.classified === true, `classified=${p1.classified}`);
check("rule path: CPU tier", p1.minVramGb === 0 && p1.isGpuWorkload === false, `minVramGb=${p1.minVramGb} isGpu=${p1.isGpuWorkload}`);
check("rule path: NOT H200", !/h200/i.test(p1.recommendedGpu), `gpu=${p1.recommendedGpu}`);
check("rule path: category", p1.category === "Earnings-contribution (financial)", p1.category);

// 2. Scraped-layer path (call site WITH repo scrape: "None (CPU-only)", vram=0)
const p2 = classifySubnetHardware("Noah", NOAH_DESC, {
  fallbackMonthlyUsd: 20600,
  scraped: {
    recommendedGpu: "None (CPU-only)",
    gpuCount: null,
    minVramGb: 0,
    hosting: null,
    requirementsSource: "https://github.com/Vora-Inc/NOAH",
  },
});
check("scraped path: CPU respected", p2.minVramGb === 0 && p2.isGpuWorkload === false, `minVramGb=${p2.minVramGb} gpu=${p2.recommendedGpu}`);
check("scraped path: source kept", p2.requirementsSource === "https://github.com/Vora-Inc/NOAH", String(p2.requirementsSource));
check("scraped path: sourceScraped", p2.sourceScraped === true);

// 3. Regression: a real GPU scrape must still win (SN51 lium 8x B300)
const p3 = classifySubnetHardware("lium.io", "GPU rental marketplace", {
  scraped: { recommendedGpu: "8x B300", gpuCount: 8, minVramGb: null, hosting: null, requirementsSource: "repo" },
});
check("regression: B300 scrape still GPU", p3.isGpuWorkload === true && /B300/i.test(p3.recommendedGpu), `gpu=${p3.recommendedGpu} vram=${p3.minVramGb}`);

// 4. Regression: Compelle debate description still CPU (old rule intact)
const p4 = classifySubnetHardware("Compelle", "Adversarial-persuasion debate subnet with LLM debates", { fallbackMonthlyUsd: 20000 });
check("regression: debate rule still CPU", p4.minVramGb === 0, `gpu=${p4.recommendedGpu}`);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
