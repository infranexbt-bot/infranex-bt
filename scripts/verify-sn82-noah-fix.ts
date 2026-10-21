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

// 5. WORD-STEM-FIX regressions — dead stems must match suffixed forms now
const p5 = classifySubnetHardware("Hippius", "Blockchain-backed cloud: storage, VMs, and apps with unmatched transparency, trust, and power.", { fallbackMonthlyUsd: 3700 });
check("stem fix: 'storage' → Storage CPU (SN75)", p5.category === "Storage" && p5.minVramGb === 0, `${p5.category} gpu=${p5.recommendedGpu}`);
const p6 = classifySubnetHardware("SecNet", "Decentralized privacy and security verification network", {});
check("stem fix: 'privacy/security/verification' match", p6.category === "Verification & security", p6.category);
const p7 = classifySubnetHardware("CrawlNet", "Web scraping and data indexing network", {});
check("stem fix: 'scraping' → Data & scraping CPU", p7.category === "Data & scraping" && p7.minVramGb === 0, `${p7.category} gpu=${p7.recommendedGpu}`);
const p8 = classifySubnetHardware("SimNet", "Genomics simulation and research", {});
check("stem fix: 'genomics/simulation' → Science", p8.category === "Science & simulation", p8.category);

// 6. SCRAPED-VRAM-WINS regression (SN81 Reliquary): repo floor 24 GB beats tier's 141
const p9 = classifySubnetHardware("Reliquary", "Verifiable compute", {
  scraped: {
    recommendedGpu: "1–2× NVIDIA GPU ≥24 GB each (H100/H200 reference)",
    gpuCount: null,
    minVramGb: 24,
    hosting: null,
    requirementsSource: "https://github.com/reliquadotai/reliquary",
  },
});
check("vram-wins: scraped 24 GB kept, not tier 141", p9.minVramGb === 24, `minVramGb=${p9.minVramGb}`);

// 7. SCRAPED-VRAM-FLOOR regression (SN26 Perturb): model-less VRAM floor
//    must keep the scraped layer alive, not fall into the revenue guess.
const p10 = classifySubnetHardware("Perturb", "Adversarial robustness subnet", {
  fallbackMonthlyUsd: 5000, // would have produced "H200 141GB"
  scraped: {
    recommendedGpu: "NVIDIA GPU 12+ GB VRAM (recommended: 24+ GB)",
    gpuCount: null,
    minVramGb: 12,
    hosting: null,
    requirementsSource: "https://github.com/0xsigurd/Perturb",
  },
});
check("vram-floor: no more H200 from revenue", !/h200/i.test(p10.recommendedGpu), `gpu=${p10.recommendedGpu}`);
check("vram-floor: repo source kept", p10.requirementsSource === "https://github.com/0xsigurd/Perturb");
check("vram-floor: tier satisfies 12 GB floor", (p10.minVramGb ?? 0) >= 12, `minVramGb=${p10.minVramGb}`);

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
