import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subnets } from "@/lib/infranex/data";
import { scrapeGithubMetadata } from "@/lib/infranex/github-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SyncResult {
  netuid: number;
  name: string;
  githubUrl: string;
  status: "scraped" | "skipped" | "error";
  description: string | null;
  minVramGb: number | null;
  recommendedGpu: string | null;
  readmeUrl: string | null;
  error?: string;
}

/**
 * POST /api/subnets/sync-all
 *
 * Scrapes GitHub for all subnets that have a githubUrl and saves the
 * scraped metadata as overrides. Skips subnets that already have an
 * override (unless ?force=true).
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";

  // Get subnets with GitHub URLs
  const toSync = subnets.filter((s) => s.githubUrl);
  const existing = await db.subnetOverride.findMany();
  const existingNetuids = new Set(existing.map((o) => o.netuid));

  const results: SyncResult[] = [];

  // Scrape sequentially (GitHub rate-limits to 60 req/hr without auth)
  for (const subnet of toSync) {
    if (!force && existingNetuids.has(subnet.netuid)) {
      results.push({
        netuid: subnet.netuid,
        name: subnet.name,
        githubUrl: subnet.githubUrl!,
        status: "skipped",
        description: null,
        minVramGb: null,
        recommendedGpu: null,
        readmeUrl: null,
      });
      continue;
    }

    try {
      const scraped = await scrapeGithubMetadata(subnet.githubUrl!, {
        netuid: subnet.netuid,
        subnetName: subnet.name,
      });
      if (scraped.source === "github") {
        const scrapedFields = {
          description: scraped.description,
          minVramGb: scraped.minVramGb,
          recommendedGpu: scraped.recommendedGpu,
          gpuCount: scraped.gpuCount,
          hostingRequirements: scraped.hosting ? JSON.stringify(scraped.hosting) : null,
          mechanicsJson: scraped.mechanics ? JSON.stringify(scraped.mechanics) : null,
          requirementsSource: scraped.requirementsSource,
          requirementsScrapedAt: new Date(),
          githubUrl: subnet.githubUrl,
        };
        // Save as override
        await db.subnetOverride.upsert({
          where: { netuid: subnet.netuid },
          create: { netuid: subnet.netuid, ...scrapedFields },
          update: scrapedFields,
        });
        results.push({
          netuid: subnet.netuid,
          name: subnet.name,
          githubUrl: subnet.githubUrl!,
          status: "scraped",
          description: scraped.description,
          minVramGb: scraped.minVramGb,
          recommendedGpu: scraped.recommendedGpu,
          readmeUrl: scraped.readmeUrl,
        });
      } else {
        results.push({
          netuid: subnet.netuid,
          name: subnet.name,
          githubUrl: subnet.githubUrl!,
          status: "error",
          description: null,
          minVramGb: null,
          recommendedGpu: null,
          readmeUrl: null,
          error: scraped.error,
        });
      }
    } catch (e) {
      results.push({
        netuid: subnet.netuid,
        name: subnet.name,
        githubUrl: subnet.githubUrl!,
        status: "error",
        description: null,
        minVramGb: null,
        recommendedGpu: null,
        readmeUrl: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const scraped = results.filter((r) => r.status === "scraped").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  return NextResponse.json({
    total: results.length,
    scraped,
    skipped,
    errors,
    results,
  });
}
