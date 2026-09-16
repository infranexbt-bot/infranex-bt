/**
 * Test the enhanced github-scraper against real subnet repos.
 * Verifies: GPU model parsing, multi-GPU counts, hosting constraints,
 * miner-repo discovery (identity -> miner repo one-hop).
 */
import { scrapeGithubMetadata, CURATED_MINER_REPOS } from "../src/lib/infranex/github-scraper";

const CASES: Array<{ netuid: number; url: string; label: string }> = [
  { netuid: 64, url: "https://github.com/chutesai/chutes", label: "SN64 Chutes (identity repo)" },
  { netuid: 0, url: "https://github.com/opentensor/text-prompting", label: "SN1 Text Prompting" },
  { netuid: 0, url: "https://github.com/macrocosm-os/pretraining", label: "SN9 Pretraining" },
  { netuid: 0, url: "https://github.com/UncleTensor/BittAudio", label: "SN11 BittAudio" },
];

async function main() {
  console.log("curated miner repos:", CURATED_MINER_REPOS);
  for (const c of CASES) {
    const r = await scrapeGithubMetadata(c.url, { netuid: c.netuid });
    console.log(`\n=== ${c.label} ===`);
    console.log(`  description   : ${r.description?.slice(0, 90) ?? "-"}`);
    console.log(`  recommendedGpu: ${r.recommendedGpu ?? "-"}`);
    console.log(`  gpuCount      : ${r.gpuCount ?? "-"}`);
    console.log(`  minVramGb     : ${r.minVramGb ?? "-"}`);
    console.log(`  hosting       : ${r.hosting ? JSON.stringify({ bm: r.hosting.bareMetalOnly, tee: r.hosting.teeRequired, ip: r.hosting.staticIpRequired }) : "-"}`);
    if (r.hosting?.notes?.length) console.log(`  evidence      : ${r.hosting.notes[0]!.slice(0, 160)}`);
    console.log(`  reqSource     : ${r.requirementsSource ?? "-"}`);
    console.log(`  source        : ${r.source}${r.error ? ` (${r.error})` : ""}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
