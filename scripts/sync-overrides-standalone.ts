/**
 * Standalone SubnetOverride sync — same logic as POST /api/subnets/sync-all
 * but runs as a plain bun process (no next-server, no OOM).
 * Run: bun scripts/sync-overrides-standalone.ts
 */

import { PrismaClient } from "@prisma/client";
import { curatedSubnetSeeds } from "../src/lib/infranex/data";
import { scrapeGithubMetadata } from "../src/lib/infranex/github-scraper";

const db = new PrismaClient();

// Same universe as runGithubWorker: curated ∪ existing overrides ∪ chain identity
const seen = new Map<number, string>();
for (const seed of curatedSubnetSeeds) {
  seen.set(seed.netuid, seed.githubUrl);
}
const existing = await db.subnetOverride.findMany();
for (const o of existing) {
  if (o.githubUrl && !seen.has(o.netuid)) seen.set(o.netuid, o.githubUrl);
}
const snapRow = await db.chainSnapshot.findFirst({ orderBy: { id: "desc" } });
if (snapRow?.subnetsJson) {
  try {
    const live = JSON.parse(snapRow.subnetsJson) as Array<{ netuid: number; identityGithub?: string | null; name?: string | null }>;
    for (const s of live) {
      if (s.identityGithub && !seen.has(s.netuid)) seen.set(s.netuid, s.identityGithub);
    }
  } catch {
    // corrupt snapshot JSON — curated + overrides still covered
  }
}
const toSync = [...seen.entries()].map(([netuid, githubUrl]) => ({ netuid, githubUrl }));
// Best-effort name map for derived-mechanics labels (curated > override > snapshot).
const nameByNetuid = new Map<number, string>();
for (const o of existing) {
  if (o.name && !nameByNetuid.has(o.netuid)) nameByNetuid.set(o.netuid, o.name);
}
console.log(`subnets to sync: ${toSync.length}`);

let scraped = 0;
let errored = 0;
for (const subnet of toSync) {
  const s = { netuid: subnet.netuid, githubUrl: subnet.githubUrl };
  try {
    const meta = await scrapeGithubMetadata(s.githubUrl, {
      netuid: s.netuid,
      subnetName: nameByNetuid.get(s.netuid) ?? null,
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
        githubUrl: s.githubUrl,
      };
      await db.subnetOverride.upsert({
        where: { netuid: s.netuid },
        create: { netuid: s.netuid, ...fields },
        update: fields,
      });
      scraped++;
      if (meta.recommendedGpu || meta.hosting || meta.mechanics) {
        const f = meta.hosting
          ? [meta.hosting.bareMetalOnly && "BARE", meta.hosting.teeRequired && "TEE", meta.hosting.staticIpRequired && "IP"]
              .filter(Boolean)
              .join("+") || "none-true"
          : "-";
        const m = meta.mechanics
          ? [
              meta.mechanics.rewardWindowDays != null && `${meta.mechanics.rewardWindowDays}d-window`,
              meta.mechanics.bountyQuote && "bounty",
              meta.mechanics.gpuVariety && "variety",
              meta.mechanics.operations.some((o) => /UID/i.test(o.title)) && "one-uid",
            ]
              .filter(Boolean)
              .join(",") || "ops-only"
          : "-";
        console.log(`#${String(s.netuid).padStart(3)} gpu=${meta.recommendedGpu ?? "-"}  hosting=[${f}]  mechanics=[${m}]`);
      }
    } else {
      errored++;
    }
  } catch {
    errored++;
  }
  await new Promise((r) => setTimeout(r, 250));
}

console.log(`\ndone: scraped=${scraped} errored=${errored}`);
await db.$disconnect();
