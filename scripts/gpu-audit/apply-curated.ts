/**
 * apply-curated.ts — GPU-TAXONOMY 2 write-back.
 *
 * Persists the hand-verified CURATED_GPU_SPECS into:
 *   1. SubnetOverride rows  — what the Subnet Ledger / opportunity views show
 *      (minVramGb / recommendedGpu / gpuCount / requirementsSource, plus
 *      requirementsScrapedAt bump so cached requirement profiles rebuild).
 *   2. SubnetRequirements cache invalidation — rows for the touched netuids
 *      are deleted so the next dialog open rebuilds via the (now
 *      curated-aware) scraper and re-caches with full notes.
 *
 * Values come ONLY from CURATED_GPU_SPECS (verified quotes) — no inference.
 * Run: npx tsx scripts/gpu-audit/apply-curated.ts
 */

import { PrismaClient } from "@prisma/client";
import { CURATED_GPU_SPECS } from "../../src/lib/infranex/github-scraper";

const db = new PrismaClient();

async function main() {
  const entries = Object.entries(CURATED_GPU_SPECS).map(([n, s]) => ({ netuid: Number(n), ...s }));
  console.log(`applying ${entries.length} curated GPU specs ...`);

  let wrote = 0;
  for (const spec of entries) {
    const existing = await db.subnetOverride.findUnique({ where: { netuid: spec.netuid } });
    const now = new Date();

    // SN103: identity URL is an org page — point the override at the real
    // repo the research verified (Capcomp-AI/capability-composition-subnet).
    const patchGithub =
      spec.netuid === 103 &&
      (!existing?.githubUrl || existing.githubUrl.includes("/orgs/"))
        ? "https://github.com/Capcomp-AI/capability-composition-subnet"
        : null;

    const data = {
      minVramGb: spec.minVramGb,
      recommendedGpu: spec.recommendedGpu,
      gpuCount: spec.gpuCount,
      requirementsSource: `https://github.com repo docs (${spec.sourceFile}) — hand-verified quote`,
      requirementsScrapedAt: now,
      updatedAt: now,
      ...(patchGithub ? { githubUrl: patchGithub } : {}),
    };

    if (existing) {
      await db.subnetOverride.update({ where: { netuid: spec.netuid }, data });
    } else {
      await db.subnetOverride.create({
        data: {
          netuid: spec.netuid,
          name: `Subnet ${spec.netuid}`,
          ...data,
        },
      });
    }
    await db.subnetRequirements.deleteMany({ where: { netuid: spec.netuid } });
    wrote++;
  }

  const counts = {
    cpuOnly: entries.filter((e) => e.minVramGb === 0).length,
    gpuSpec: entries.filter((e) => (e.minVramGb ?? 0) > 0).length,
    gpuUnspecifiedVram: entries.filter((e) => e.minVramGb == null).length,
  };
  console.log(`done: ${wrote} override rows written, cache invalidated`);
  console.log("breakdown:", JSON.stringify(counts));
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
