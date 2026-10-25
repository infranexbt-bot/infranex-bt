/**
 * rescrape-from-snapshot.ts — restore the wiped SubnetOverride requirement
 * rows by scraping the LIVE chain identity repos (from the fresh
 * tmp-network.json fixture) + the 5 audit-pinned repos (rent-earn.ts
 * CURATED_RENT_BLOCKS subnets: 64, 4, 28, 90 + 51 lium).
 * Upserts the same fields the hourly github-analyzer worker writes.
 */

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { scrapeGithubMetadata, type ScrapedMetadata } from "../src/lib/infranex/github-scraper";

const db = new PrismaClient();
const DELAY_MS = 350;

// Audit-pinned repos (worklog subnet-hosting-audit-1) — used when the chain
// identity has no repo or points at the org root instead of the miner docs.
const PINNED: Record<number, string> = {
  64: "https://github.com/chutesai/chutes",
  4: "https://github.com/manifold-inc/targon",
  28: "https://github.com/taostat/gm-miner",
  51: "https://github.com/Datura-ai/lium-io",
  90: "https://github.com/KubeTEE-AI/kubetee-subnet",
};

interface Source {
  netuid: number;
  githubUrl: string;
  origin: string;
}

async function main() {
  const map = new Map<number, Source>();
  const snap = JSON.parse(
    readFileSync("/home/z/my-project/scripts/tmp-network.json", "utf8")
  ) as {
    subnets: Array<{ netuid: number; name?: string | null; identityGithub?: string | null }>;
  };
  for (const s of snap.subnets) {
    const url = PINNED[s.netuid] ?? s.identityGithub ?? null;
    if (url) map.set(s.netuid, { netuid: s.netuid, githubUrl: url, origin: PINNED[s.netuid] ? "audit-pinned" : "chain-identity" });
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
          mechanicsJson: r.mechanics ? JSON.stringify(r.mechanics) : null,
          infraJson: r.infra ? JSON.stringify(r.infra) : null,
          requirementsSource: r.requirementsSource,
          requirementsScrapedAt: new Date(),
          githubUrl: src.githubUrl,
        },
        update: {
          description: r.description ?? undefined,
          minVramGb: r.minVramGb ?? null,
          recommendedGpu: r.recommendedGpu ?? null,
          gpuCount: r.gpuCount ?? null,
          hostingRequirements: hostingJson ?? undefined,
          mechanicsJson: r.mechanics ? JSON.stringify(r.mechanics) : undefined,
          infraJson: r.infra ? JSON.stringify(r.infra) : undefined,
          requirementsSource: r.requirementsSource ?? undefined,
          requirementsScrapedAt: new Date(),
          githubUrl: src.githubUrl,
        },
      });
      scraped++;
      if (r.recommendedGpu) withGpu++;
      if (r.hosting) withHosting++;
      rows.push(
        `SN${String(src.netuid).padStart(3)} │ ${String(r.recommendedGpu ?? "—").padEnd(30)} │ ${
          r.hosting
            ? [r.hosting.bareMetalOnly && "bare-metal", r.hosting.teeRequired && "TEE", r.hosting.staticIpRequired && "static-IP"].filter(Boolean).join(",") || "—"
            : "—"
        } │ ${src.githubUrl.replace("https://github.com/", "")}`
      );
    } else {
      errors++;
      rows.push(`SN${String(src.netuid).padStart(3)} │ ERROR: ${r.error ?? "unknown"} │ ${src.githubUrl}`);
    }
    await new Promise((res) => setTimeout(res, DELAY_MS));
  }
  console.log(rows.join("\n"));
  console.log(`\n=== Summary === attempted=${all.length} scraped=${scraped} withGpu=${withGpu} withHosting=${withHosting} errors=${errors}`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
