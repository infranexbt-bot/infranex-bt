import { NextResponse } from "next/server";
import { getWorkerStatuses, getLatestChainSnapshot } from "@/lib/infranex/workers";
import { requireActiveUserCookies } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

// GET /api/workers/status — get the status of all background workers
export async function GET() {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check),
  // not just the edge-proxy cookie check.
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const [statuses, latestSnapshot] = await Promise.all([
    getWorkerStatuses(),
    getLatestChainSnapshot(),
  ]);
  return NextResponse.json({
    workers: statuses,
    latestSnapshot: latestSnapshot
      ? {
          blockNumber: latestSnapshot.blockNumber,
          totalSubnets: latestSnapshot.totalSubnets,
          scannedSubnets: latestSnapshot.subnets.length,
          neuronCount: latestSnapshot.neurons.length,
          taoPriceUsd: latestSnapshot.taoPriceUsd,
          fetchedAt: latestSnapshot.fetchedAt,
          source: latestSnapshot.source,
        }
      : null,
  });
}
