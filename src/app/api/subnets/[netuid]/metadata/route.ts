import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { scrapeGithubMetadata } from "@/lib/infranex/github-scraper";
import { curatedGithubUrl } from "@/lib/infranex/data";
import { fetchLiveSnapshot } from "@/lib/infranex/chain";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/subnets/[netuid]/metadata — scrape GitHub + probe metadata APIs
// for real descriptions and GPU requirements.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ netuid: string }> }
) {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check),
  // not just the edge-proxy cookie check.
  const gate = await requireActiveUser(_req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { netuid } = await params;
  const n = parseInt(netuid, 10);

  // DATA-AUDIT-1 — identity comes from the chain registry (or an honest
  // placeholder), never from the removed fabricated catalog.
  let chainName: string | null = null;
  let chainDescription: string | null = null;
  try {
    const snap = await fetchLiveSnapshot();
    const live = snap.subnets.find((s) => s.netuid === n);
    if (live?.name) chainName = live.name;
    if (live?.identityDescription) chainDescription = live.identityDescription;
  } catch {
    // chain unavailable — placeholders apply
  }
  const fallbackName = chainName ?? `Subnet ${n}`;

  // Check for user override (may have a githubUrl), then the curated seed.
  const override = await db.subnetOverride.findUnique({ where: { netuid: n } });
  const seedUrl = override?.githubUrl ?? curatedGithubUrl(n);

  const result: {
    netuid: number;
    curated: { name: string; description: string; minVramGb: number; recommendedGpu: string; githubUrl: string | null };
    override: typeof override;
    github: Awaited<ReturnType<typeof scrapeGithubMetadata>> | null;
    metadataApi: { probed: string[]; found: boolean; data: Record<string, unknown> | null };
  } = {
    netuid: n,
    curated: {
      name: fallbackName,
      description: chainDescription ?? "",
      minVramGb: (override?.minVramGb as number) ?? 0,
      recommendedGpu: override?.recommendedGpu ?? "",
      githubUrl: seedUrl,
    },
    override,
    github: null,
    metadataApi: { probed: [], found: false, data: null },
  };

  // 1. Scrape GitHub if we have a URL
  if (seedUrl) {
    result.github = await scrapeGithubMetadata(seedUrl);
  }

  // 2. Probe common subnet metadata API endpoints
  // Some subnets expose metadata at predictable URLs
  const probeUrls = [
    `https://subnets.network/api/subnet/${n}`,
    `https://api.taostats.io/api/v2/subnet/${n}`,
  ];
  for (const url of probeUrls) {
    result.metadataApi.probed.push(url);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "infranex-bt/1.0", Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const j = await res.json();
        result.metadataApi.found = true;
        result.metadataApi.data = j;
        break;
      }
    } catch {
      // continue probing
    }
  }

  return NextResponse.json(result);
}
