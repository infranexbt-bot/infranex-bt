/**
 * Retry the failed scrapes with verbose error output + backoff.
 * Only targets subnets whose githubUrl looks like a real repo —
 * "0x" placeholders are skipped (nothing to scrape on-chain).
 * Run: bun scripts/retry-failed-scrapes.ts
 */
import { PrismaClient } from "@prisma/client";
import { scrapeGithubMetadata } from "../src/lib/infranex/github-scraper";

const db = new PrismaClient();

// Real-URL candidates (from find-failed-scrapes.ts + HTML probing):
// fixable: SN120 (AGENTS.md), SN97 (docs/MINING.md) — after fetchReadme patch.
// unfixable (repo 404 on github.com): SN39, SN47, SN95, SN126; SN122 (no public repos).
const CANDIDATES: Array<{ netuid: number; githubUrl: string }> = [
  { netuid: 97, githubUrl: "https://github.com/unarbos/albedo" },
  { netuid: 120, githubUrl: "https://github.com/AffineFoundation/affine" },
];

// Best-effort name map (curated > override > snapshot) — same as sync script.
const nameByNetuid = new Map<number, string>();
for (const o of await db.subnetOverride.findMany()) {
  if (o.name && !nameByNetuid.has(o.netuid)) nameByNetuid.set(o.netuid, o.name);
}
const snapRow = await db.chainSnapshot.findFirst({ orderBy: { id: "desc" } });
if (snapRow?.subnetsJson) {
  try {
    const live = JSON.parse(snapRow.subnetsJson) as Array<{ netuid: number; name?: string | null }>;
    for (const s of live) if (s.name && !nameByNetuid.has(s.netuid)) nameByNetuid.set(s.netuid, s.name);
  } catch { /* ignore */ }
}

const MAX_ATTEMPTS = 3;
let scraped = 0;

for (const c of CANDIDATES) {
  const label = `SN${String(c.netuid).padStart(3)} (${c.githubUrl})`;
  let done = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !done; attempt++) {
    try {
      const meta = await scrapeGithubMetadata(c.githubUrl, {
        netuid: c.netuid,
        subnetName: nameByNetuid.get(c.netuid) ?? null,
      });
      if (meta.source === "github") {
        const fields = {
          description: meta.description,
          minVramGb: meta.minVramGb,
          recommendedGpu: meta.recommendedGpu,
          gpuCount: meta.gpuCount,
          hostingRequirements: meta.hosting ? JSON.stringify(meta.hosting) : null,
          mechanicsJson: meta.mechanics ? JSON.stringify(meta.mechanics) : null,
          infraJson: meta.infra ? JSON.stringify(meta.infra) : null,
          requirementsSource: meta.requirementsSource,
          requirementsScrapedAt: new Date(),
          githubUrl: c.githubUrl,
        };
        await db.subnetOverride.upsert({
          where: { netuid: c.netuid },
          create: { netuid: c.netuid, ...fields },
          update: fields,
        });
        scraped++;
        console.log(`OK    ${label} -> src=${meta.requirementsSource} gpu=${meta.recommendedGpu ?? "-"} mechanics=${meta.mechanics ? "yes" : "none"}`);
        if (meta.mechanics) {
          console.log(`      mechanics: window=${meta.mechanics.rewardWindowDays ?? "-"}d bounty=${!!meta.mechanics.bountyQuote} variety=${!!meta.mechanics.gpuVariety} ops=${meta.mechanics.operations.length}`);
        }
        done = true;
      } else {
        console.log(`ERR   ${label} attempt ${attempt}/${MAX_ATTEMPTS}: ${meta.error}`);
        if (attempt < MAX_ATTEMPTS) {
          const waitMs = 3000 * attempt;
          console.log(`      waiting ${waitMs / 1000}s before retry...`);
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
    } catch (e) {
      console.log(`THROW ${label} attempt ${attempt}/${MAX_ATTEMPTS}: ${e instanceof Error ? e.message : e}`);
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  await new Promise((r) => setTimeout(r, 1500)); // inter-subnet spacing
}

console.log(`\ndone: scraped=${scraped}/${CANDIDATES.length}`);
await db.$disconnect();
