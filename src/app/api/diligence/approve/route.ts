import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/diligence/approve — record the human gate decision.
 *
 * Body: { netuid, subnetName, verdict, score, stages: DiligenceStage[] }
 *
 * Policy: only "CLEAR" or "CONDITIONAL" can be approved. A
 * "DO NOT PROVISION" verdict is rejected with 422 — the pipeline's hard
 * fails must be resolved (or re-evaluated with better data) first.
 * The full stage snapshot is stored verbatim so the approval stays
 * auditable against the exact numbers the operator saw.
 */
export async function POST(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: {
    netuid?: unknown;
    subnetName?: unknown;
    verdict?: unknown;
    score?: unknown;
    stages?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const netuid = Number(body.netuid);
  const subnetName = typeof body.subnetName === "string" ? body.subnetName.slice(0, 120) : "";
  const verdict = typeof body.verdict === "string" ? body.verdict : "";
  const score = Number(body.score);

  if (!Number.isInteger(netuid) || netuid < 0 || !subnetName || !Number.isFinite(score)) {
    return NextResponse.json({ error: "netuid, subnetName and score are required" }, { status: 400 });
  }
  if (verdict !== "CLEAR" && verdict !== "CONDITIONAL") {
    return NextResponse.json(
      { error: `Verdict "${verdict || "∅"}" cannot be approved — resolve the hard fails first.` },
      { status: 422 }
    );
  }
  if (!Array.isArray(body.stages) || body.stages.length === 0) {
    return NextResponse.json({ error: "Stage snapshot is required for an auditable approval" }, { status: 400 });
  }

  const row = await db.diligenceApproval.create({
    data: {
      netuid,
      subnetName,
      verdict,
      score,
      stagesJson: JSON.stringify(body.stages),
      approvedBy: gate.session.uid,
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, id: row.id, createdAt: row.createdAt });
}
