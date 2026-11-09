// GPU-RESEARCH-2 — live layer for the Subnet GPU Requirements Research page.
//
// The seed (gpu-research-seed.ts) is a repo-level tarball audit frozen at
// auditedAt. This module adds the *live* layer on top of it:
//   • mergeLiveRows() — joins the seed rows with the SubnetOverride scrape
//     layer (requirementsScrapedAt / recommendedGpu / gpuCount / minVramGb)
//     and flags a delta whenever today's live scan contradicts the seed.
//   • sweepBatch() — bounded incremental re-scan: picks the subnets whose
//     live scrape is oldest (or missing), re-scrapes their GitHub repos via
//     scrapeGithubMetadata (raw.githubusercontent — no API quota), and
//     upserts the result. The page's 60s polling drives it, so no
//     persistent background worker is needed (this host is 4 GB RAM — the
//     worker system is RAM-gated off).
//
// Both /api/gpu-research (GET) and /api/gpu-research/rescan (POST) import
// from here, so the lazy auto-sweep and the manual button share one cursor.

import { db } from "@/lib/db";
import { scrapeGithubMetadata } from "./github-scraper";
import { GPU_RESEARCH_ROWS, type GpuResearchRow } from "./gpu-research-seed";

// ---------------------------------------------------------------------------
// Canonical GPU vocabulary — identical to github-scraper's GPU_MODEL_PATTERNS
// plus the datacenter tokens the seed audit uses (GH200 / MI325X / H20).
// The live layer never invents a model name: a raw scrape string like
// "NVIDIA RTX 4090" or "8x H200" must map onto one of these tokens before it
// is compared against the seed.
// ---------------------------------------------------------------------------
const CANONICAL_TOKENS = [
  "B300", "B200", "H200", "H100", "GH200", "MI300X", "MI325X", "H20", "H800/A800",
  "RTX Pro 6000", "RTX 6000 Ada", "A100", "A40", "L40S", "L40", "L4", "A10", "T4",
  "RTX A6000", "RTX A5000",
  "RTX 5090", "RTX 4090", "RTX 4070", "RTX 3090 Ti", "RTX 3090", "RTX 3080",
  "GTX 1660 Super", "GTX 1660 Ti", "GTX 1660", "GTX 1650", "GTX 1080 Ti", "GTX 1080",
] as const;

const TOKEN_RES: RegExp[] = CANONICAL_TOKENS.map((t) => {
  // "H800/A800" → /(H800|A800)/ ; others → word-boundary literal (allow spaces).
  const alt = t.split("/").map(escapeRe).join("|");
  return new RegExp(`\\b(${alt})\\b`, "i");
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

/** Map a raw scrape string ("NVIDIA RTX 4090", "8x H200") to a canonical token. */
export function canonicalGpuToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (let i = 0; i < CANONICAL_TOKENS.length; i++) {
    if (TOKEN_RES[i].test(raw)) return CANONICAL_TOKENS[i];
  }
  return null;
}

/** Case-insensitive membership — the seed writes "RTX PRO 6000", the scraper "RTX Pro 6000". */
function seedHasModel(models: string[], token: string): boolean {
  const t = token.toLowerCase();
  return models.some((m) => m.toLowerCase() === t);
}

// ---------------------------------------------------------------------------
// Merge — seed rows + DB scrape layer
// ---------------------------------------------------------------------------

/** delta is only computed when the live scan actually FOUND a signal. */
export type LiveDelta = "match" | "differs" | "cpu-only";

export interface LiveLayer {
  scrapedAt: string | null;
  model: string | null;
  modelRaw: string | null;
  gpuCount: number | null;
  minVramGb: number | null;
  requirementsSource: string | null;
  delta: LiveDelta | null;
  /** live scrape younger than FRESH_MS */
  fresh: boolean;
}

export type LiveGpuResearchRow = GpuResearchRow & { live: LiveLayer | null };

export const FRESH_MS = 60 * 60_000; // 60 min
export const STALE_MS = 30 * 60_000; // sweep trigger threshold
const FAILURE_TTL_MS = 6 * 60 * 60_000; // don't re-pick a dead repo for 6h

export interface GpuResearchMeta {
  auditedAt: string;
  totalSubnets: number;
  reposScanned: number;
  noRepo: number;
  repoOffline: number;
  readmeHits: number;
  minComputeHits: number;
  dockerHits: number;
  /** newest requirementsScrapedAt across the audit universe */
  lastScrapeAt: string | null;
  /** audit rows with a live scrape timestamp */
  liveRows: number;
  /** live universe (rows with a scannable repo) */
  liveUniverse: number;
  stale: boolean;
  sweepInFlight: boolean;
}

export function mergeLiveRows(
  overrides: Array<{
    netuid: number;
    recommendedGpu: string | null;
    gpuCount: number | null;
    minVramGb: number | null;
    requirementsSource: string | null;
    requirementsScrapedAt: Date | null;
  }>
): LiveGpuResearchRow[] {
  const byNetuid = new Map(overrides.map((o) => [o.netuid, o]));
  const now = Date.now();
  return GPU_RESEARCH_ROWS.map((row) => {
    const o = byNetuid.get(row.netuid);
    if (!o?.requirementsScrapedAt) return { ...row, live: null };
    const token = canonicalGpuToken(o.recommendedGpu ?? null);
    let delta: LiveDelta | null = null;
    if (token) {
      delta = seedHasModel(row.models, token) ? "match" : "differs";
    } else if (o.recommendedGpu === null && row.models.length > 0) {
      // The scrape succeeded but found no model in README/min_compute — the
      // seed may have found one in a Docker file, so this is NOT a delta.
      delta = null;
    }
    const age = now - new Date(o.requirementsScrapedAt).getTime();
    return {
      ...row,
      live: {
        scrapedAt: new Date(o.requirementsScrapedAt).toISOString(),
        model: token,
        modelRaw: o.recommendedGpu ?? null,
        gpuCount: o.gpuCount ?? null,
        minVramGb: o.minVramGb ?? null,
        requirementsSource: o.requirementsSource ?? null,
        delta,
        fresh: age >= 0 && age < FRESH_MS,
      },
    };
  });
}

export function computeMeta(rows: LiveGpuResearchRow[], sweepInFlight: boolean): GpuResearchMeta {
  const scraped = rows.filter((r) => r.live?.scrapedAt != null);
  const lastScrapeAt = scraped.length
    ? scraped
        .map((r) => r.live!.scrapedAt!)
        .reduce((acc, cur) => (cur > acc ? cur : acc))
    : null;
  return {
    ...GPU_RESEARCH_META_FIELDS,
    lastScrapeAt,
    liveRows: scraped.length,
    liveUniverse: rows.filter((r) => r.repo && r.status !== "no-repo" && r.status !== "root").length,
    stale: !lastScrapeAt || Date.now() - new Date(lastScrapeAt).getTime() > STALE_MS,
    sweepInFlight,
  };
}

// auditedAt + coverage counters, taken from the seed meta (typed copy so the
// route can spread it without `as const` freezing the object shape).
const GPU_RESEARCH_META_FIELDS = {
  auditedAt: "2026-11-09",
  totalSubnets: GPU_RESEARCH_ROWS.length,
  reposScanned: 111,
  noRepo: 15,
  repoOffline: 2,
  readmeHits: 28,
  minComputeHits: 11,
  dockerHits: 3,
} as const;

// ---------------------------------------------------------------------------
// Sweep — bounded incremental re-scan
// ---------------------------------------------------------------------------

export interface SweepItemResult {
  netuid: number;
  repo: string | null;
  status: "scraped" | "error";
  model: string | null;
  delta: LiveDelta | null;
  error?: string;
}

export interface SweepResult {
  scanned: number;
  updated: number;
  failed: number;
  remaining: number;
  universe: number;
  done: boolean;
  results: SweepItemResult[];
}

interface OverrideLite {
  netuid: number;
  recommendedGpu: string | null;
  gpuCount: number | null;
  minVramGb: number | null;
  requirementsSource: string | null;
  requirementsScrapedAt: Date | null;
}

let sweepInFlight = false;
let lastSweepAt = 0;
const failureCache = new Map<number, number>(); // netuid → failedAt ms

export function isSweepInFlight(): boolean {
  return sweepInFlight;
}

/**
 * Re-scrape a bounded batch of the audit universe. Candidates are the rows
 * whose live scrape is oldest (missing = oldest). A single netuid can be
 * forced for a targeted refresh. Sequential scraping (~2-4s per repo) keeps
 * GitHub raw fetches polite and the memory footprint flat.
 */
export async function sweepBatch(opts?: { limit?: number; netuid?: number }): Promise<SweepResult> {
  const limit = Math.min(opts?.limit ?? 8, 16);
  const rows = GPU_RESEARCH_ROWS;
  const universe = rows.filter((r) => r.repo && r.status !== "no-repo" && r.status !== "root");
  const overrides = (await db.subnetOverride.findMany({
    select: {
      netuid: true,
      recommendedGpu: true,
      gpuCount: true,
      minVramGb: true,
      requirementsSource: true,
      requirementsScrapedAt: true,
    },
  })) as OverrideLite[];
  const byNetuid = new Map(overrides.map((o) => [o.netuid, o]));

  let candidates: GpuResearchRow[];
  if (opts?.netuid != null) {
    candidates = universe.filter((r) => r.netuid === opts.netuid);
  } else {
    const now = Date.now();
    candidates = universe
      .filter((r) => {
        const failedAt = failureCache.get(r.netuid);
        return !failedAt || now - failedAt > FAILURE_TTL_MS;
      })
      .sort((a, b) => {
        const ta = byNetuid.get(a.netuid)?.requirementsScrapedAt?.getTime() ?? 0;
        const tb = byNetuid.get(b.netuid)?.requirementsScrapedAt?.getTime() ?? 0;
        return ta - tb;
      })
      .slice(0, limit);
  }

  const results: SweepItemResult[] = [];
  let updated = 0;
  let failed = 0;

  for (const row of candidates) {
    const repo = row.repo!;
    try {
      const scraped = await scrapeGithubMetadata(repo, { netuid: row.netuid, subnetName: row.name });
      if (scraped.source === "github") {
        const fields = {
          recommendedGpu: scraped.recommendedGpu,
          gpuCount: scraped.gpuCount,
          minVramGb: scraped.minVramGb,
          requirementsSource: scraped.requirementsSource,
          requirementsScrapedAt: new Date(),
        };
        await db.subnetOverride.upsert({
          where: { netuid: row.netuid },
          create: { netuid: row.netuid, ...fields },
          update: fields,
        });
        failureCache.delete(row.netuid);
        updated++;
        const token = canonicalGpuToken(scraped.recommendedGpu ?? null);
        results.push({
          netuid: row.netuid,
          repo,
          status: "scraped",
          model: token,
          delta: token ? (seedHasModel(row.models, token) ? "match" : "differs") : null,
        });
      } else {
        // Repo deleted/offline/no README — cache the failure so the sweep
        // cursor moves on instead of spinning on the same dead repo.
        failureCache.set(row.netuid, Date.now());
        failed++;
        results.push({ netuid: row.netuid, repo, status: "error", model: null, delta: null, error: scraped.error });
      }
    } catch (e) {
      failureCache.set(row.netuid, Date.now());
      failed++;
      results.push({
        netuid: row.netuid,
        repo,
        status: "error",
        model: null,
        delta: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  lastSweepAt = Date.now();
  // remaining = universe rows still without a live scrape timestamp
  const freshOverrides = (await db.subnetOverride.findMany({
    select: { netuid: true, requirementsScrapedAt: true },
  })) as Array<{ netuid: number; requirementsScrapedAt: Date | null }>;
  const scrapedSet = new Set(freshOverrides.filter((o) => o.requirementsScrapedAt).map((o) => o.netuid));
  const remaining = universe.filter((r) => !scrapedSet.has(r.netuid)).length;

  return {
    scanned: results.length,
    updated,
    failed,
    remaining,
    universe: universe.length,
    done: remaining === 0,
    results,
  };
}

/** Serialized sweep runner — never two sweeps at once in one process. */
export async function runSweepExclusive(opts?: { limit?: number; netuid?: number }): Promise<SweepResult | null> {
  if (sweepInFlight) return null;
  sweepInFlight = true;
  try {
    return await sweepBatch(opts);
  } finally {
    sweepInFlight = false;
  }
}

/**
 * Lazy auto-sweep: fire-and-forget a small batch when the live layer is
 * stale. Called from the GET route — the page's 60s polling keeps driving
 * it forward, so a full universe refresh completes passively in ~15-20 min
 * of page-open time without any persistent worker.
 */
export function maybeAutoSweep(): boolean {
  if (sweepInFlight) return false;
  if (Date.now() - lastSweepAt < STALE_MS) return false;
  void runSweepExclusive({ limit: 5 }).catch(() => {});
  return true;
}
