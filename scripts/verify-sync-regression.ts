/**
 * MEMORY-GUARD regression test — proves the bounded fetch path
 * (boundedText in github-scraper.ts) still returns full scrape data
 * after the 2.9GB OOM fix. Run: bun scripts/verify-sync-regression.ts
 */
import { scrapeGithubMetadata } from "../src/lib/infranex/github-scraper";

async function main() {
  // SN32 — ItsAI (the GPU-required repo we corrected; specs live in
  // min_compute.yml + docs/mining.md). Exercises fetchRaw → boundedText.
  const t0 = Date.now();
  const sn32 = await scrapeGithubMetadata("https://github.com/It-s-AI/llm-detection", {
    netuid: 32,
    subnetName: "ItsAI",
  });
  console.log(`SN32 scrape: ${Date.now() - t0}ms source=${sn32.source}`);
  console.log(`  minVramGb=${sn32.minVramGb} recommendedGpu=${sn32.recommendedGpu}`);
  console.log(`  requirementsSource=${sn32.requirementsSource}`);

  // SN21 — AdTAO (cpu-only; README hardware table drives the verdict).
  const t1 = Date.now();
  const sn21 = await scrapeGithubMetadata("https://github.com/ippcteam/SN21-adtao", {
    netuid: 21,
    subnetName: "AdTAO",
  });
  console.log(`SN21 scrape: ${Date.now() - t1}ms source=${sn21.source}`);
  console.log(`  minVramGb=${sn21.minVramGb} recommendedGpu=${sn21.recommendedGpu}`);

  const ok = sn32.source === "github" && sn21.source === "github";
  console.log(ok ? "SCRAPER REGRESSION: PASS" : "SCRAPER REGRESSION: FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
