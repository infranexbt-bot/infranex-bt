/**
 * e2e-curated.ts — direct scraper-layer check for curated netuids.
 * (pullSubnetRequirements full path hangs on live chain fetches in this
 * environment — the scraper is where the curated spec logic lives.)
 * Run: npx tsx scripts/gpu-audit/e2e-curated.ts
 */
import { scrapeGithubMetadata } from "../../src/lib/infranex/github-scraper";

const CASES: Array<{ netuid: number; name: string; repo: string }> = [
  { netuid: 2, name: "DSperse", repo: "https://github.com/inference-labs-inc/subnet-2" },
  { netuid: 4, name: "Targon", repo: "https://github.com/manifold-inc/targon" },
  { netuid: 26, name: "Perturb", repo: "https://github.com/0xsigurd/Perturb" },
  { netuid: 103, name: "Capcomp", repo: "https://github.com/Capcomp-AI/capability-composition-subnet" },
];

async function main() {
  for (const c of CASES) {
    const m = await scrapeGithubMetadata(c.repo, { netuid: c.netuid, subnetName: c.name });
    console.log(
      `SN${c.netuid} ${c.name}\n` +
        `  minVramGb=${m.minVramGb}  gpu="${m.recommendedGpu}"  count=${m.gpuCount}  gpuRequired=${m.gpuRequired}`
    );
    if (m.curatedGpuNote) console.log(`  note: ${m.curatedGpuNote.slice(0, 150)}`);
    else console.log("  note: (none — non-curated evidence won)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
