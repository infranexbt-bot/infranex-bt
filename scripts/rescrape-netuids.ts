/**
 * Re-scrape + upsert specific netuids (keeps existing rows, refreshes all
 * scraped fields incl. infraJson). Run: bun scripts/rescrape-netuids.ts 11 26
 */
import { PrismaClient } from "@prisma/client";
import { subnets } from "../src/lib/infranex/data";
import { scrapeGithubMetadata } from "../src/lib/infranex/github-scraper";

const db = new PrismaClient();
const targets = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
if (!targets.length) {
  console.error("usage: bun scripts/rescrape-netuids.ts <netuid...>");
  process.exit(1);
}

const nameByNetuid = new Map<number, string>();
for (const s of subnets) if (s.name) nameByNetuid.set(s.netuid, s.name);
for (const o of await db.subnetOverride.findMany()) {
  if (o.name && !nameByNetuid.has(o.netuid)) nameByNetuid.set(o.netuid, o.name);
}

for (const netuid of targets) {
  const row = await db.subnetOverride.findUnique({ where: { netuid } });
  const url = row?.githubUrl;
  if (!url || !/^https:\/\/github\.com\/[^/]+\/[^/]+/.test(url)) {
    console.log(`SN${netuid}: no scrapeable repo (${url ?? "none"}) — skipped`);
    continue;
  }
  const meta = await scrapeGithubMetadata(url, {
    netuid,
    subnetName: nameByNetuid.get(netuid) ?? null,
  });
  if (meta.source !== "github") {
    console.log(`SN${netuid}: scrape error — ${meta.error}`);
    continue;
  }
  await db.subnetOverride.update({
    where: { netuid },
    data: {
      hostingRequirements: meta.hosting ? JSON.stringify(meta.hosting) : null,
      mechanicsJson: meta.mechanics ? JSON.stringify(meta.mechanics) : null,
      infraJson: meta.infra ? JSON.stringify(meta.infra) : null,
      requirementsSource: meta.requirementsSource,
      requirementsScrapedAt: new Date(),
    },
  });
  console.log(
    `SN${netuid}: ok | services=${meta.infra?.services.map((s) => s.name).join(",") ?? "-"} | orch=${meta.infra?.orchestration ?? "-"} | ram=${!!meta.infra?.ramRule}`
  );
}
await db.$disconnect();
