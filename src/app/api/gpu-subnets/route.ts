import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUserCookies } from "@/lib/auth-admin";
import { computeGpuSubnetExplorer } from "@/lib/infranex/gpu-subnet-explorer";
import { GPU_RESEARCH_ROWS } from "@/lib/infranex/gpu-research-seed";

export const dynamic = "force-dynamic";

// GET /api/gpu-subnets — the GPU → Subnets explorer.
//
// One entry per card in the platform's GPU_BUY_CATALOG: every subnet whose
// audited requirement names that card, with TEE reachability, the verbatim
// requirement line, live chain metrics (pool, rewarded UIDs, per-earning
// yield) and the platform's own opportunity classification. Same matching
// rules as the GPU Buy Decision panel (banned mentions dropped, TEE gating
// identical), so the two views always agree.
export async function GET() {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check).
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const [snap, oppDay, overrides] = await Promise.all([
    db.chainSnapshot.findFirst({ orderBy: { createdAt: "desc" } }),
    db.opportunitySnapshot.aggregate({ _max: { day: true } }),
    db.subnetOverride.findMany({ select: { netuid: true, hostingRequirements: true } }),
  ]);

  const taoUsd = snap?.taoPriceUsd ?? 0;

  const liveByNetuid = new Map<
    number,
    {
      minerEmissionTaoPerDay?: number | null;
      minersCount?: number | null;
      rewardedMiners?: number | null;
      rewardRealizability?: number | null;
    }
  >();
  if (snap) {
    const liveList = JSON.parse(snap.subnetsJson) as Record<string, unknown>[];
    for (const s of liveList) {
      if (typeof s.netuid !== "number") continue;
      liveByNetuid.set(s.netuid, {
        minerEmissionTaoPerDay: s.minerEmissionTaoPerDay as number | null,
        minersCount: s.minersCount as number | null,
        rewardedMiners: s.rewardedMiners as number | null,
        rewardRealizability: s.rewardRealizability as number | null,
      });
    }
  }

  const oppByNetuid = new Map<
    number,
    { classification?: string | null; difficulty?: string | null; netMonthlyUsd?: number | null }
  >();
  if (oppDay._max.day) {
    const opps = await db.opportunitySnapshot.findMany({
      where: { day: oppDay._max.day },
      select: { netuid: true, classification: true, difficulty: true, netMonthlyUsd: true },
    });
    for (const o of opps) {
      oppByNetuid.set(o.netuid, {
        classification: o.classification,
        difficulty: o.difficulty,
        netMonthlyUsd: o.netMonthlyUsd,
      });
    }
  }

  const teeRequiredByNetuid = new Map<number, boolean>();
  for (const o of overrides) {
    if (!o.hostingRequirements) continue;
    try {
      const h = JSON.parse(o.hostingRequirements) as Record<string, unknown>;
      teeRequiredByNetuid.set(o.netuid, h.teeRequired === true);
    } catch {
      /* malformed hosting JSON — treat as not TEE-gated */
    }
  }

  const result = computeGpuSubnetExplorer({
    rows: GPU_RESEARCH_ROWS.map((r) => ({
      netuid: r.netuid,
      name: r.name,
      repo: r.repo,
      status: r.status,
      cls: r.cls,
      models: r.models,
      headline: r.headline,
      gpuCount: r.gpuCount,
      vramFloor: r.vramFloor,
      evidence: r.evidence,
    })),
    liveByNetuid,
    oppByNetuid,
    teeRequiredByNetuid,
    taoUsd,
  });

  result.meta.blockNumber = snap?.blockNumber ?? null;
  result.meta.snapshotAt = snap?.createdAt ? new Date(snap.createdAt).toISOString() : null;

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
