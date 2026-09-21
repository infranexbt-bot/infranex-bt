import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";
import type { DiligenceTrend, EmissionTrendPoint } from "@/lib/infranex/diligence";

export const dynamic = "force-dynamic";

/**
 * GET /api/diligence/[netuid] — history-derived diligence context.
 *
 * Returns:
 *  - trend: emission trajectory sampled from the ChainSnapshot ring buffer
 *    (stage 9 "Emission trend" — the one pipeline stage that needs history,
 *    not just the current snapshot)
 *  - approval: the latest recorded human approval for this subnet, if any
 *
 * Pure read; no side effects.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ netuid: string }> }
) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { netuid: netuidRaw } = await ctx.params;
  const netuid = Number(netuidRaw);
  if (!Number.isInteger(netuid) || netuid < 0) {
    return NextResponse.json({ error: "Invalid netuid" }, { status: 400 });
  }

  // Sample the most recent snapshots (max 72 rows, ≤24 points) for the
  // subnet's emission trajectory. subnetsJson holds every subnet per row —
  // parse only what we need and skip malformed historical rows.
  const rows = await db.chainSnapshot.findMany({
    orderBy: { createdAt: "desc" },
    take: 72,
    select: { createdAt: true, taoPriceUsd: true, subnetsJson: true },
  });

  const points: EmissionTrendPoint[] = [];
  for (const row of rows) {
    try {
      const subs = JSON.parse(row.subnetsJson) as Array<{
        netuid: number;
        minerEmissionTaoPerDay?: number;
        movingPrice?: number;
      }>;
      const s = subs.find((x) => x?.netuid === netuid);
      if (!s || s.minerEmissionTaoPerDay == null) continue;
      // α price in USD = the subnet's TAO-side moving price × the TAO/USD
      // spot captured with that snapshot. Older rows without either input
      // degrade to null — never a fabricated number.
      const alphaPriceUsd =
        s.movingPrice != null && row.taoPriceUsd != null
          ? s.movingPrice * row.taoPriceUsd
          : null;
      points.push({
        at: row.createdAt.toISOString(),
        emissionTaoPerDay: s.minerEmissionTaoPerDay,
        minerEmissionTaoPerDay: s.minerEmissionTaoPerDay,
        alphaPriceUsd,
      });
    } catch {
      continue;
    }
  }

  // Oldest → newest, downsampled to ≤24 points.
  points.reverse();
  const step = Math.max(1, Math.ceil(points.length / 24));
  const sampled = points.filter((_, i) => i % step === 0);
  const first = sampled[0]?.emissionTaoPerDay ?? null;
  const last = sampled[sampled.length - 1]?.emissionTaoPerDay ?? null;
  const emissionChangePct =
    first != null && last != null && first > 0
      ? ((last - first) / first) * 100
      : null;

  // α/USD across the same window — first vs last point where both inputs
  // existed. τ-denominated emission can look flat while USD earnings shrink
  // (or grow) with the α price, so diligence stage 9 shows both.
  const alphaSeries = sampled.filter(
    (p): p is typeof p & { alphaPriceUsd: number } => p.alphaPriceUsd != null
  );
  const alphaFirst = alphaSeries[0]?.alphaPriceUsd ?? null;
  const alphaLast = alphaSeries[alphaSeries.length - 1]?.alphaPriceUsd ?? null;
  const alphaPriceChangePct =
    alphaFirst != null && alphaLast != null && alphaFirst > 0
      ? ((alphaLast - alphaFirst) / alphaFirst) * 100
      : null;

  const trend: DiligenceTrend = {
    points: sampled,
    emissionChangePct,
    alphaPriceChangePct,
    hasHistory: sampled.length >= 2,
  };

  const approval = await db.diligenceApproval.findFirst({
    where: { netuid },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      verdict: true,
      score: true,
      approvedBy: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ netuid, trend, approval });
}
