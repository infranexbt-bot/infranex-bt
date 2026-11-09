import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUserCookies } from "@/lib/auth-admin";
import {
  computeBuyDecision,
  type BuyDecisionLive,
  type BuyDecisionOpportunity,
} from "@/lib/infranex/gpu-buy-decision";
import { GPU_RESEARCH_ROWS } from "@/lib/infranex/gpu-research-seed";

export const dynamic = "force-dynamic";

// GET /api/gpu-buy-decision — the GPU Buy Decision panel.
//
// Joins three layers the platform already maintains:
//   · gpu-research-seed audit   → which subnets name which GPU model
//   · latest ChainSnapshot      → live miner-side emissions, rewarded miners,
//                                 realizability, TAO spot (chain-measured)
//   · latest OpportunitySnapshot → the platform's own per-subnet economics
//                                 and classification gates (AVOID never
//                                 headlines an entry plan)
// plus the street-price catalog (verified 2026-11-09) for capex, power,
// Vast.ai rent and TEE gating. Pure answer to: "which GPU should I buy?"
export async function GET() {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check).
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const [snap, settings, oppDay, overrides] = await Promise.all([
    db.chainSnapshot.findFirst({ orderBy: { createdAt: "desc" } }),
    db.profitabilitySettings.findUnique({ where: { id: 1 } }),
    db.opportunitySnapshot.aggregate({ _max: { day: true } }),
    db.subnetOverride.findMany({ select: { netuid: true, hostingRequirements: true } }),
  ]);

  const taoUsd = snap?.taoPriceUsd ?? 0;

  const liveByNetuid = new Map<number, BuyDecisionLive>();
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

  const oppByNetuid = new Map<number, BuyDecisionOpportunity>();
  if (oppDay._max.day) {
    const opps = await db.opportunitySnapshot.findMany({ where: { day: oppDay._max.day } });
    for (const o of opps) {
      oppByNetuid.set(o.netuid, {
        netMonthlyUsd: o.netMonthlyUsd,
        netTaoPerMonth: o.netTaoPerMonth,
        gpuCostMonthlyUsd: o.gpuCostMonthlyUsd,
        classification: o.classification,
        difficulty: o.difficulty,
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

  // Goal line: the operator's stated floor in this engagement is 2 TAO/mo;
  // the settings row may target less — the panel uses the stricter of the two.
  const settingsTargetTao = settings?.targetTaoPerMonth ?? 1;
  const goalTaoPerMonth = Math.max(settingsTargetTao, 2);

  const result = computeBuyDecision({
    rows: GPU_RESEARCH_ROWS.map((r) => ({
      netuid: r.netuid,
      name: r.name,
      models: r.models,
      gpuCount: r.gpuCount,
      cls: r.cls,
    })),
    liveByNetuid,
    oppByNetuid,
    teeRequiredByNetuid,
    taoUsd,
    goalTaoPerMonth,
    electricityUsdPerKwh: settings?.electricityUsdPerKwh ?? 0.12,
  });

  result.meta.blockNumber = snap?.blockNumber ?? null;
  result.meta.snapshotAt = snap?.createdAt ? new Date(snap.createdAt).toISOString() : null;

  return NextResponse.json(
    {
      ...result,
      meta: { ...result.meta, settingsTargetTao, opportunityDay: oppDay._max.day ?? null },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
