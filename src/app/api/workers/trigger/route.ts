import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-admin";
import { startWorkers } from "@/lib/infranex/workers";

export const dynamic = "force-dynamic";

// POST /api/workers/trigger — start the background workers (if not already running)
export async function POST(req: NextRequest) {
  // SEC-AUDIT-1: state-mutating action — require a signed-in, active operator.
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  startWorkers();
  return NextResponse.json({
    started: true,
    message: "Background workers started (chain scanner every 2min, market data every 1min, GitHub analyzer every 60min)",
  });
}
