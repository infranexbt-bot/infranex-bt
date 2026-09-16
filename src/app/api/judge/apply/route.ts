// JUDGE-APPLY endpoint — POST /api/judge/apply
//
// Applies one Validator Lab recommendation to a live deployment. Body:
//   { deploymentId: string, dimensionKey: string, priceTargetUsd?: number }
//
// The heavy lifting (recipe mapping, revision snapshot, daemon push ladder)
// lives in src/lib/infranex/judge/apply.ts — this route is a thin,
// validating wrapper, consistent with the rest of /api/judge.

import { NextRequest, NextResponse } from "next/server";
import { applyJudgeFix } from "@/lib/infranex/judge/apply";
import { requireActiveAdmin } from "@/lib/auth-admin";

export async function POST(req: NextRequest) {
  // pushes new config to a live miner via the daemon → admin-gated (AUDIT-SEC-3)
  const gate = await requireActiveAdmin(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const deploymentId = typeof body.deploymentId === "string" ? body.deploymentId : "";
    const dimensionKey = typeof body.dimensionKey === "string" ? body.dimensionKey : "";
    if (!deploymentId || !dimensionKey) {
      return NextResponse.json(
        { error: "deploymentId and dimensionKey are required" },
        { status: 400 }
      );
    }
    const priceTargetUsd =
      typeof body.priceTargetUsd === "number" && Number.isFinite(body.priceTargetUsd)
        ? body.priceTargetUsd
        : undefined;

    const result = await applyJudgeFix(deploymentId, dimensionKey, { priceTargetUsd });
    if (!result.ok) {
      return NextResponse.json({ error: result.note }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Validator fix apply failed" },
      { status: 500 }
    );
  }
}
