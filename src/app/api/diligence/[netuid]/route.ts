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
    select: { createdAt: true, subnetsJson: true },
  });

  const points: EmissionTrendPoint[] = [];
  for (const row of rows) {
    try {
      const subs = JSON.parse(row.subnetsJson) as Array<{
        netuid: number;
        minerEmissionTaoPerDay?: number;
      }>;
      const s = subs.find((x) => x?.netuid === netuid);
      if (!s || s.minerEmissionTaoPerDay == null) continue;
      points.push({
        at: row.createdAt.toISOString(),
        emissionTaoPerDay: s.minerEmissionTaoPerDay,
        minerEmissionTaoPerDay: s.minerEmissionTaoPerDay,
        alphaPriceUsd: null,
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

  const trend: DiligenceTrend = {
    points: sampled,
    emissionChangePct,
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
