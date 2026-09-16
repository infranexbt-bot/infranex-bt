import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  describeWinnerTrend,
  type OddsHistorySample,
} from "@/lib/infranex/registration-odds";

export const dynamic = "force-dynamic";

// GET /api/subnets/odds-history?netuid=N
//
// Winner-stability trend for one subnet: how many seats earned reward at
// each of the recent chain scans. Reads ChainSnapshot rows (the scanner
// persists one per scan) and extracts that subnet's rewardedMiners from
// subnetsJson — a faithful "how many seats are actually paid" proxy that
// doesn't require per-UID vectors to be persisted.
//
// Bounded on purpose: the last 90 scans (~1-3h at the current cadence),
// downsampled to at most 40 points, parsing only the per-scan JSON.

const MAX_SCANS = 90;
const MAX_POINTS = 40;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const netuid = Number.parseInt(url.searchParams.get("netuid") ?? "", 10);
  if (!Number.isInteger(netuid) || netuid < 0 || netuid > 255) {
    return NextResponse.json({ error: "netuid must be 0-255" }, { status: 400 });
  }

  const snapshots = await db.chainSnapshot.findMany({
    orderBy: { id: "desc" },
    take: MAX_SCANS,
    select: { createdAt: true, subnetsJson: true },
  });
  if (snapshots.length === 0) {
    return NextResponse.json({
      netuid,
      trend: describeWinnerTrend([]),
      samples: [],
    });
  }

  // Newest first from the DB — parse, then downsample keeping the newest
  // points dense (always keep the last one) before flipping chronological.
  const all: OddsHistorySample[] = [];
  for (const s of snapshots) {
    try {
      const subnets = JSON.parse(s.subnetsJson) as Array<{
        netuid: number;
        rewardedMiners?: number | null;
        minersCount?: number | null;
      }>;
      const sub = subnets.find((x) => x.netuid === netuid);
      if (!sub || sub.rewardedMiners == null) continue;
      all.push({
        t: s.createdAt.toISOString(),
        rewarded: sub.rewardedMiners,
        miners: sub.minersCount ?? 0,
      });
    } catch {
      // Corrupt/legacy row — skip it, the trend tolerates gaps.
      continue;
    }
  }

  const stride = all.length > MAX_POINTS ? Math.ceil(all.length / MAX_POINTS) : 1;
  const downsampled = all.filter((_, i) => i % stride === 0).slice(0, MAX_POINTS);
  const chronological = [...downsampled].reverse();

  return NextResponse.json({
    netuid,
    trend: describeWinnerTrend(chronological),
    samples: chronological,
  });
}
