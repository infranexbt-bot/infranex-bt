import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUserCookies } from "@/lib/auth-admin";
import {
  buildDecisionPayload,
  PRICE_AS_OF,
  type DecisionPayload,
} from "@/lib/infranex/gpu-decision";

export const dynamic = "force-dynamic";

// GET /api/gpu-decision — the GPU Buy Decision panel payload: every catalog
// card × every subnet it can legally mine, with the chain-measured facts
// (pool, rewarded/registered UIDs, realizability) and the opportunity
// snapshot's classification. Economics (EV, payback, rent margin) are
// computed client-side so the assumption sliders re-rank instantly.
export async function GET() {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check).
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const [rows, snap, latestOpp, settings] = await Promise.all([
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
    db.opportunitySnapshot.findFirst({ orderBy: [{ day: "desc" }, { capturedAt: "desc" }] }),
    db.profitabilitySettings.findFirst(),
  ]);

  const oppDay = latestOpp?.day ?? null;
  const oppRows = oppDay
    ? await db.opportunitySnapshot.findMany({
        where: { day: oppDay },
        select: { netuid: true, classification: true, difficulty: true, dataConfidence: true },
      })
    : [];

  const liveList = snap ? (JSON.parse(snap.subnetsJson) as Record<string, unknown>[]) : [];
  const liveByNetuid = new Map<number, {
    minersCount: number | null;
    rewardedMiners: number | null;
    minerEmissionTaoPerDay: number | null;
    rewardRealizability: number | null;
  }>();
  for (const s of liveList) {
    const netuid = typeof s.netuid === "number" ? s.netuid : Number(s.netuid);
    if (!Number.isFinite(netuid)) continue;
    liveByNetuid.set(netuid, {
      minersCount: (s.minersCount as number | null | undefined) ?? null,
      rewardedMiners: (s.rewardedMiners as number | null | undefined) ?? null,
      minerEmissionTaoPerDay: (s.minerEmissionTaoPerDay as number | null | undefined) ?? null,
      rewardRealizability: (s.rewardRealizability as number | null | undefined) ?? null,
    });
  }

  const oppByNetuid = new Map(
    oppRows.map((o) => [o.netuid, {
      classification: o.classification ?? null,
      difficulty: o.difficulty ?? null,
      dataConfidence: o.dataConfidence ?? null,
    }])
  );

  const payload: DecisionPayload = buildDecisionPayload(rows, liveByNetuid, oppByNetuid, {
    blockNumber: snap?.blockNumber ?? null,
    taoPriceUsd: snap?.taoPriceUsd ?? 0,
    snapshotAt: snap?.createdAt ? new Date(snap.createdAt).toISOString() : null,
    electricityUsdPerKwh: settings?.electricityUsdPerKwh ?? 0.12,
    targetTaoPerMonth: settings?.targetTaoPerMonth ?? 1,
    rigGpuVramGb: settings?.rigGpuVramGb ?? 0,
    rigTeeCapable: settings?.rigTeeCapable ?? false,
    priceAsOf: PRICE_AS_OF,
    opportunityDay: oppDay,
  });

  return NextResponse.json(
    payload,
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
