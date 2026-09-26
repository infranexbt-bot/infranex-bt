/**
 * rescrape-parallel.ts — GPU-TAXONOMY: same upsert contract as
 * rescrape-requirements.ts but with concurrency 6 (raw.githubusercontent.com
 * tolerates it; the sequential 400ms-delay pass takes ~15 min for 129
 * subnets, this finishes in ~3).
 *
 * Run: npx tsx scripts/rescrape-parallel.ts
 */

import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { scrapeGithubMetadata, type ScrapedMetadata } from "../src/lib/infranex/github-scraper";
import { curatedSubnetSeeds } from "../src/lib/infranex/data";

const db = new PrismaClient();

interface Source {
  netuid: number;
  githubUrl: string;
  origin: string;
}

async function main() {
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
  console.log(`Rescraping requirements for ${all.length} subnets (concurrency 6)...`);

  let scraped = 0, withGpu = 0, withHosting = 0, errors = 0;
  const report: string[] = [];
  const queue = [...all];

  async function upsert(src: Source, r: ScrapedMetadata) {
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
        // GPU-TAXONOMY: write nulls explicitly — a fresh scrape that finds no
        // GPU figure must CLEAR the stale previous value, not keep it.
        minVramGb: r.minVramGb ?? null,
        recommendedGpu: r.recommendedGpu ?? null,
        gpuCount: r.gpuCount ?? null,
        hostingRequirements: hostingJson ?? undefined,
        requirementsSource: r.requirementsSource ?? undefined,
        requirementsScrapedAt: new Date(),
        githubUrl: src.githubUrl,
      },
    });
  }

  async function worker() {
    while (queue.length) {
      const src = queue.shift()!;
      let r: ScrapedMetadata;
      try {
        r = await scrapeGithubMetadata(src.githubUrl, { netuid: src.netuid });
      } catch (e) {
        r = { source: "error", error: e instanceof Error ? e.message : String(e) } as ScrapedMetadata;
      }
      if (r.source === "github") {
        await upsert(src, r);
        scraped++;
        if (r.recommendedGpu) withGpu++;
        if (r.hosting) withHosting++;
        report.push(
          `SN${String(src.netuid).padStart(3)} | gpu=${String(r.recommendedGpu ?? "-").padEnd(22)} vram=${String(r.minVramGb ?? "-").padEnd(4)} cdlspec=${r.gpuRequired == null ? "?" : r.gpuRequired} | ${src.githubUrl.replace("https://github.com/", "")}`
        );
      } else {
        errors++;
        report.push(`SN${String(src.netuid).padStart(3)} | ERROR: ${r.error ?? "unknown"} | ${src.githubUrl}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));

  writeFileSync("/home/z/my-project/scripts/gpu-audit/rescrape-report.txt", report.join("\n"));
  console.log(`scraped ok: ${scraped}, with GPU: ${withGpu}, with hosting: ${withHosting}, errors: ${errors}`);
  console.log("Full report: scripts/gpu-audit/rescrape-report.txt");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
