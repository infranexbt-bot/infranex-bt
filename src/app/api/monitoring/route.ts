import { NextResponse } from "next/server";
import { fetchMonitoringOverview } from "@/lib/infranex/monitoring";
import { computeOptimizations } from "@/lib/infranex/optimization";
import { requireActiveUserCookies } from "@/lib/auth-admin";

// Live monitoring + optimization overview — per-deployment pod status,
// on-chain metrics, rewards, cost/ROI, alerts, and Keep/Optimize/Switch
// recommendations. Polled every 30s.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET() {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check),
  // not just the edge-proxy cookie check.
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const overview = await fetchMonitoringOverview();
  const optimizations = await computeOptimizations(overview);
  return NextResponse.json(
    { ...overview, optimizations },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
