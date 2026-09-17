/**
 * Re-derive mechanics for specific subnets with the CURRENT extractor —
 * avoids a full 104-repo re-sync when only extraction patterns change.
 * Run: bun scripts/rederive-mechanics.ts 64 21 69
 */

import { PrismaClient } from "@prisma/client";
import { scrapeGithubMetadata } from "../src/lib/infranex/github-scraper";

const db = new PrismaClient();
const netuids = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
if (netuids.length === 0) {
  console.error("usage: bun scripts/rederive-mechanics.ts <netuid...>");
  process.exit(1);
}

for (const netuid of netuids) {
  const row = await db.subnetOverride.findUnique({ where: { netuid } });
  if (!row?.githubUrl) {
    console.log(`#${netuid}: no override/githubUrl — skipped`);
    continue;
  }
  const meta = await scrapeGithubMetadata(row.githubUrl, {
    netuid,
    subnetName: row.name,
  });
  if (meta.source !== "github") {
    console.log(`#${netuid}: scrape error — ${meta.error}`);
    continue;
  }
  await db.subnetOverride.update({
    where: { netuid },
    data: {
      hostingRequirements: meta.hosting ? JSON.stringify(meta.hosting) : null,
      mechanicsJson: meta.mechanics ? JSON.stringify(meta.mechanics) : null,
      requirementsScrapedAt: new Date(),
    },
  });
  const m = meta.mechanics;
  console.log(
    `#${netuid}: window=${m?.rewardWindowDays ?? "-"} bounty=${m?.bountyQuote ? "y" : "-"} ops=${m?.operations.length ?? 0} provenance=${m?.provenance ?? "-"}`
  );
  await new Promise((r) => setTimeout(r, 400));
}

await db.$disconnect();
