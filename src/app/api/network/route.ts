import { NextResponse } from "next/server";
import { fetchLiveSnapshot } from "@/lib/infranex/chain";
import { startWorkers } from "@/lib/infranex/workers";
import { requireActiveUserCookies } from "@/lib/auth-admin";

// Live network snapshot — chain + price. Polled by the client every 30s.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Auto-start background workers on first API call
let workersInitialized = false;
if (!workersInitialized) {
  workersInitialized = true;
  // Start workers in the background (non-blocking)
  void startWorkers();
}

export async function GET() {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check),
  // not just the edge-proxy cookie check.
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const snapshot = await fetchLiveSnapshot();
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
