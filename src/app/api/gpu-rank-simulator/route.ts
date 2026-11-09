import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUserCookies } from "@/lib/auth-admin";
import { computeRankSimulator } from "@/lib/infranex/rank-simulator";
import { GPU_RESEARCH_ROWS } from "@/lib/infranex/gpu-research-seed";
import { GPU_BUY_CATALOG } from "@/lib/infranex/gpu-buy-decision";

export const dynamic = "force-dynamic";

// GET /api/gpu-rank-simulator?gpu=RTX Pro 6000 — the honest new-entrant
// income ranker. Same live sources as the explorer (chain snapshot,
// opportunity snapshot, TEE overrides), plus ProfitabilitySettings for the
// default rig card (rig VRAM → catalog card). EV = realized miner pool ÷
// ALL seats — the average entrant's share — so winner-take-all subnets can
// never masquerade as newcomer income. Hardware matching identical to
// /api/gpu-subnets.
export async function GET(req: NextRequest) {
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const [snap, oppDay, overrides, prof] = await Promise.all([
    db.chainSnapshot.findFirst({ orderBy: { createdAt: "desc" } }),
    db.opportunitySnapshot.aggregate({ _max: { day: true } }),
    db.subnetOverride.findMany({ select: { netuid: true, hostingRequirements: true } }),
    db.profitabilitySettings.findFirst(),
  ]);

  const taoUsd = snap?.taoPriceUsd ?? 0;

  const liveByNetuid = new Map<
    number,
    {
      minerEmissionTaoPerDay?: number | null;
      minersCount?: number | null;
      rewardedMiners?: number | null;
      rewardRealizability?: number | null;
      top10IncentiveShare?: number | null;
      burnCostTao?: number | null;
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
        top10IncentiveShare: s.top10IncentiveShare as number | null,
        burnCostTao: s.burnCostTao as number | null,
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

  // Default card: the user's configured rig — match catalog by VRAM, falling
  // back to the platform's recommended Pro 6000 inside the lib.
  const gpuParam = req.nextUrl.searchParams.get("gpu");
  const rigModel =
    prof?.rigGpuVramGb != null
      ? (GPU_BUY_CATALOG.find((c) => c.vramGb === prof.rigGpuVramGb)?.model ?? null)
      : null;

  const result = computeRankSimulator({
    rows: GPU_RESEARCH_ROWS.map((r) => ({
      netuid: r.netuid,
      name: r.name,
      repo: r.repo,
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
    gpuModel: gpuParam ?? rigModel,
  });

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
