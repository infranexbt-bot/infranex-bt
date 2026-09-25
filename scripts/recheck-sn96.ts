/**
 * recheck-sn96.ts — SN96-VERIFY-1
 *
 * Re-verify SN96 Verathos GPU requirements against the official repo
 * (verathos-ai/verathos — min_compute.yml is the ground truth: RTX 4090
 * recommended, 24 GB min / 48 GB rec VRAM — NOT H100).
 *
 * 1. scrapeGithubMetadata live (identity repo) — must pick up the
 *    min_compute.yml spec now that the scraper parses it.
 * 2. Upsert SubnetOverride requirements fields (mirrors rescrape-requirements.ts).
 * 3. pullSubnetRequirements(96, refresh) — rebuild + recache the install
 *    profile so the UI serves the corrected GPU tier.
 *
 * Run: bun scripts/recheck-sn96.ts
 */

import { PrismaClient } from "@prisma/client";
import { scrapeGithubMetadata } from "../src/lib/infranex/github-scraper";
import { pullSubnetRequirements } from "../src/lib/devops/subnet-requirements";

const db = new PrismaClient();
const NETUID = 96;
const REPO = "https://github.com/verathos-ai/verathos";

async function main() {
  console.log(`[1/3] Live scrape ${REPO} ...`);
  const r = await scrapeGithubMetadata(REPO, { netuid: NETUID });
  console.log(
    JSON.stringify(
      {
        source: r.source,
        minVramGb: r.minVramGb,
        recommendedGpu: r.recommendedGpu,
        gpuCount: r.gpuCount,
        hosting: r.hosting,
        requirementsSource: r.requirementsSource,
        requirementsUrl: r.requirementsUrl,
        error: r.error,
      },
      null,
      1
    )
  );
  if (r.source !== "github") {
    throw new Error(`scrape failed: ${r.error ?? r.source}`);
  }
  if (r.minVramGb !== 24 || !(r.recommendedGpu ?? "").includes("4090")) {
    throw new Error(
      `unexpected spec — minVramGb=${r.minVramGb}, recommendedGpu=${r.recommendedGpu} (official: 24 GB / RTX 4090)`
    );
  }

  console.log("[2/3] Upserting SubnetOverride requirements fields ...");
  await db.subnetOverride.upsert({
    where: { netuid: NETUID },
    create: {
      netuid: NETUID,
      description: r.description,
      minVramGb: r.minVramGb,
      recommendedGpu: r.recommendedGpu,
      gpuCount: r.gpuCount,
      hostingRequirements: r.hosting ? JSON.stringify(r.hosting) : null,
      requirementsSource: r.requirementsSource,
      requirementsScrapedAt: new Date(),
      githubUrl: REPO,
    },
    update: {
      description: r.description ?? undefined,
      minVramGb: r.minVramGb ?? undefined,
      recommendedGpu: r.recommendedGpu ?? undefined,
      gpuCount: r.gpuCount ?? undefined,
      hostingRequirements: r.hosting ? JSON.stringify(r.hosting) : undefined,
      requirementsSource: r.requirementsSource ?? undefined,
      requirementsScrapedAt: new Date(),
      githubUrl: REPO,
    },
  });

  console.log("[3/3] Rebuilding requirements profile (refresh) ...");
  const { profile, cached } = await pullSubnetRequirements(NETUID, { refresh: true });
  console.log(
    JSON.stringify(
      {
        cached,
        minVramGb: profile.minVramGb,
        recommendedGpu: profile.recommendedGpu,
        gpuSource: profile.gpuSource,
        cudaMinVersion: profile.cudaMinVersion,
        repoUrl: profile.repoUrl,
        confidence: profile.confidence,
      },
      null,
      1
    )
  );
  if (profile.minVramGb !== 24 || profile.recommendedGpu !== "RTX 4090") {
    throw new Error(
      `profile still wrong — minVramGb=${profile.minVramGb}, recommendedGpu=${profile.recommendedGpu}`
    );
  }
  console.log("\nOK — SN96 now serves RTX 4090 / 24 GB (official min_compute.yml spec).");
}

main()
  .catch((e) => {
    console.error("FAIL:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
