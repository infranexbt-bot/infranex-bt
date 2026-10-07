import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUserCookies } from "@/lib/auth-admin";
import {
  classifyGpuLandscape,
  buildLive,
  LANDSCAPE_CATEGORIES,
  type LandscapeLive,
} from "@/lib/infranex/gpu-landscape";

export const dynamic = "force-dynamic";

// GET /api/gpu-landscape — every subnet bucketed by GPU class
// (A consumer / B pro / C datacenter / D special), with live per-miner
// yields merged from the latest chain snapshot.
export async function GET() {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check).
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const [rows, snap] = await Promise.all([
    db.subnetOverride.findMany({
      select: {
        netuid: true,
        name: true,
        recommendedGpu: true,
        minVramGb: true,
        gpuCount: true,
        hostingRequirements: true,
        requirementsSource: true,
      },
      orderBy: { netuid: "asc" },
    }),
    db.chainSnapshot.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  const taoUsd = snap?.taoPriceUsd ?? 0;
  const liveList = snap ? (JSON.parse(snap.subnetsJson) as Record<string, unknown>[]) : [];
  const liveByNetuid = new Map<number, LandscapeLive>();
  for (const s of liveList) {
    const netuid = typeof s.netuid === "number" ? s.netuid : Number(s.netuid);
    if (!Number.isFinite(netuid)) continue;
    liveByNetuid.set(
      netuid,
      buildLive(
        {
          minersCount: s.minersCount as number | null | undefined,
          rewardedMiners: s.rewardedMiners as number | null | undefined,
          minerEmissionTaoPerDay: s.minerEmissionTaoPerDay as number | null | undefined,
          rewardRealizability: s.rewardRealizability as number | null | undefined,
        },
        taoUsd
      )
    );
  }

  const categories = classifyGpuLandscape(rows, liveByNetuid, taoUsd);

  return NextResponse.json(
    {
      meta: {
        blockNumber: snap?.blockNumber ?? null,
        taoPriceUsd: taoUsd,
        snapshotAt: snap?.createdAt ?? null,
        totalSubnets: rows.length,
      },
      categories: LANDSCAPE_CATEGORIES,
      buckets: categories,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
