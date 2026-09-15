import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-admin";
import { getTrustReport } from "@/lib/infranex/trust";

// TRUST-LOOP — projected vs actual earnings per deployment.
// Joins the deploy-time projection (chain-measured, stored on the row) with
// the real EarningsDaily/SpendLedger rollups into per-miner verdicts, fleet
// totals, and the calibration figure the Opportunity Score's confidence
// consumes. Read-only; everything it reports was already recorded.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const report = await getTrustReport();
  return NextResponse.json(report, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
