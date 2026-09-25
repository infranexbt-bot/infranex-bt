/**
 * rescrape-requirements.ts — Task: requirements-rescrape-1
 *
 * One-off pass over ALL subnets (curated catalog ∪ existing overrides ∪
 * live chain identity repos): scrapes each subnet's GitHub README (plus the
 * discovered/curated MINER repo) and upserts SubnetOverride with the
 * extended requirements: recommendedGpu, gpuCount, hostingRequirements,
 * requirementsSource, requirementsScrapedAt.
 *
 * Run: bun scripts/rescrape-requirements.ts
 */

import { PrismaClient } from "@prisma/client";
import { scrapeGithubMetadata, type ScrapedMetadata } from "../src/lib/infranex/github-scraper";
import { curatedSubnetSeeds } from "../src/lib/infranex/data";

const db = new PrismaClient();
const DELAY_MS = 400;

interface Source {
  netuid: number;
  githubUrl: string;
  origin: string;
}

async function main() {
  // --- Build the universe: curated + overrides + live chain identities ----
  const map = new Map<number, Source>();

  for (const seed of curatedSubnetSeeds) {
    map.set(seed.netuid, { netuid: seed.netuid, githubUrl: seed.githubUrl, origin: "curated" });
  }

  const overrides = await db.subnetOverride.findMany();
  for (const o of overrides) {
    if (o.githubUrl && !map.has(o.netuid)) {
      map.set(o.netuid, { netuid: o.netuid, githubUrl: o.githubUrl, origin: "override" });
    }
  }

  const snap = await db.chainSnapshot.findFirst({ orderBy: { id: "desc" } });
  if (snap?.subnetsJson) {
    try {
      const live = JSON.parse(snap.subnetsJson) as Array<{ netuid: number; identityGithub?: string | null }>;
      for (const s of live) {
        if (s.identityGithub && !map.has(s.netuid)) {
          map.set(s.netuid, { netuid: s.netuid, githubUrl: s.identityGithub, origin: "chain-identity" });
        }
      }
    } catch {
      console.warn("[!] corrupt subnetsJson in latest snapshot — continuing without it");
    }
  }

  const all = [...map.values()].sort((a, b) => a.netuid - b.netuid);
  console.log(`Rescraping requirements for ${all.length} subnets...\n`);

  let scraped = 0, withGpu = 0, withHosting = 0, errors = 0;
  const rows: string[] = [];

  for (const src of all) {
    let r: ScrapedMetadata;
    try {
      r = await scrapeGithubMetadata(src.githubUrl, { netuid: src.netuid });
    } catch (e) {
      r = { source: "error", error: e instanceof Error ? e.message : String(e) } as ScrapedMetadata;
    }

    if (r.source === "github") {
      const hostingJson = r.hosting ? JSON.stringify(r.hosting) : null;
      await db.subnetOverride.upsert({
        where: { netuid: src.netuid },
        create: {
          netuid: src.netuid,
          description: r.description,
          minVramGb: r.minVramGb,
          recommendedGpu: r.recommendedGpu,
          gpuCount: r.gpuCount,
          hostingRequirements: hostingJson,
          requirementsSource: r.requirementsSource,
          requirementsScrapedAt: new Date(),
          githubUrl: src.githubUrl,
        },
        update: {
          description: r.description ?? undefined,
          // GPU-TAXONOMY: write nulls explicitly — a fresh scrape that finds
          // no GPU figure must CLEAR the stale previous value, not keep it.
          minVramGb: r.minVramGb ?? null,
          recommendedGpu: r.recommendedGpu ?? null,
          gpuCount: r.gpuCount ?? null,
          hostingRequirements: hostingJson ?? undefined,
          requirementsSource: r.requirementsSource ?? undefined,
          requirementsScrapedAt: new Date(),
          githubUrl: src.githubUrl,
        },
      });
      scraped++;
      if (r.recommendedGpu) withGpu++;
      if (r.hosting) withHosting++;
      rows.push(
        `SN${String(src.netuid).padStart(3)} │ ${String(r.recommendedGpu ?? "—").padEnd(18)} │ ${
          r.hosting
            ? [r.hosting.bareMetalOnly && "bare-metal", r.hosting.teeRequired && "TEE", r.hosting.staticIpRequired && "static-IP"].filter(Boolean).join(",") || "—"
            : "—"
        } │ ${src.githubUrl.replace("https://github.com/", "")}${r.requirementsSource && r.requirementsSource !== src.githubUrl ? " → " + r.requirementsSource.replace("https://github.com/", "") : ""}`
      );
    } else {
      errors++;
      rows.push(`SN${String(src.netuid).padStart(3)} │ ERROR: ${r.error ?? "unknown"} │ ${src.githubUrl}`);
    }
    await new Promise((res) => setTimeout(res, DELAY_MS));
  }

  console.log(rows.join("\n"));
  console.log(`\n=== Summary ===`);
  console.log(`subnets attempted : ${all.length}`);
  console.log(`scraped ok        : ${scraped}`);
  console.log(`with GPU reqs     : ${withGpu}`);
  console.log(`with hosting rules: ${withHosting}`);
  console.log(`errors            : ${errors}`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
