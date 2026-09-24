import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  describeWinnerTrend,
  type OddsHistorySample,
  type WinnerTrend,
} from "@/lib/infranex/registration-odds";
import { requireActiveUserRequest } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

// GET /api/subnets/odds-history?netuid=N
//   → { netuid, trend, samples }   (one subnet)
// GET /api/subnets/odds-history
//   → { trends: { [netuid]: WinnerTrend } }   (ALL subnets, one call)
//
// Winner-stability trend: how many seats earned reward at each of the recent
// chain scans. Reads ChainSnapshot rows (the scanner persists one per scan)
// and extracts each subnet's rewardedMiners from subnetsJson — a faithful
// "how many seats are actually paid" proxy that doesn't require per-UID
// vectors to be persisted.
//
// Bounded on purpose: the last 90 scans (~1-3h at the current cadence),
// downsampled to at most 40 points per subnet, parsing only per-scan JSON.
// The batch shape exists so per-row odds chips (Opportunities table/grid)
// need ONE request instead of one per subnet row.

const MAX_SCANS = 90;
const MAX_POINTS = 40;
const BATCH_TTL_MS = 30_000;

/** Newest-first sample list → downsample keeping the newest points dense. */
function downsampleNewestFirst(all: OddsHistorySample[]): OddsHistorySample[] {
  const stride = all.length > MAX_POINTS ? Math.ceil(all.length / MAX_POINTS) : 1;
  return all.filter((_, i) => i % stride === 0).slice(0, MAX_POINTS);
}

/** Load rewarded/miner samples per netuid across the recent scan window. */
async function loadSamplesByNetuid(): Promise<Map<number, OddsHistorySample[]>> {
  const snapshots = await db.chainSnapshot.findMany({
    orderBy: { id: "desc" },
    take: MAX_SCANS,
    select: { createdAt: true, subnetsJson: true },
  });
  const byNetuid = new Map<number, OddsHistorySample[]>();
  for (const s of snapshots) {
    let subnets: Array<{
      netuid: number;
      rewardedMiners?: number | null;
      minersCount?: number | null;
    }>;
    try {
      subnets = JSON.parse(s.subnetsJson);
    } catch {
      // Corrupt/legacy row — skip it, the trend tolerates gaps.
      continue;
    }
    const t = s.createdAt.toISOString();
    for (const sub of subnets) {
      if (sub.rewardedMiners == null) continue;
      let arr = byNetuid.get(sub.netuid);
      if (!arr) {
        arr = [];
        byNetuid.set(sub.netuid, arr);
      }
      arr.push({
        t,
        rewarded: sub.rewardedMiners,
        miners: sub.minersCount ?? 0,
      });
    }
  }
  return byNetuid;
}

/** Batch cache — 129 subnets × 90 scan parses per call; a short TTL keeps
 *  repeat mounts (table + grid + refocuses) on one computation. */
let batchCache: { at: number; trends: Record<string, WinnerTrend> } | null = null;

export async function GET(request: Request) {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check),
  // not just the edge-proxy cookie check.
  const gate = await requireActiveUserRequest(request);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const url = new URL(request.url);
  const raw = url.searchParams.get("netuid");

  // ---- Batch mode: trends for every subnet in one response ---------------
  if (raw == null || raw === "") {
    if (batchCache && Date.now() - batchCache.at < BATCH_TTL_MS) {
      return NextResponse.json({ trends: batchCache.trends });
    }
    const byNetuid = await loadSamplesByNetuid();
    const trends: Record<string, WinnerTrend> = {};
    for (const [netuid, samples] of byNetuid) {
      const chronological = [...downsampleNewestFirst(samples)].reverse();
      trends[String(netuid)] = describeWinnerTrend(chronological);
    }
    batchCache = { at: Date.now(), trends };
    return NextResponse.json({ trends });
  }

  // ---- Single mode (dashboard seat panel, detail dialog) -----------------
  const netuid = Number.parseInt(raw, 10);
  if (!Number.isInteger(netuid) || netuid < 0 || netuid > 255) {
    return NextResponse.json({ error: "netuid must be 0-255" }, { status: 400 });
  }

  const byNetuid = await loadSamplesByNetuid();
  const all = byNetuid.get(netuid) ?? [];
  if (all.length === 0) {
    return NextResponse.json({
      netuid,
      trend: describeWinnerTrend([]),
      samples: [],
    });
  }

  const chronological = [...downsampleNewestFirst(all)].reverse();

  return NextResponse.json({
    netuid,
    trend: describeWinnerTrend(chronological),
    samples: chronological,
  });
}
