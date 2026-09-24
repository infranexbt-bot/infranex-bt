import { NextResponse } from "next/server";
import { fetchAllLiveCpuOffers } from "@/lib/infranex/cpu-providers";
import { requireActiveUserCookies } from "@/lib/auth-admin";

// Live CPU VPS offers from every configured CPU provider (Hetzner Cloud,
// DigitalOcean — keys managed in the CPU catalog). Providers without a
// stored key are listed as not configured; no synthetic fallback offers
// (same honesty contract as /api/gpu-offers, MOCK-PURGE-2).
// Polled every 60s by the client.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check),
  // not just the edge-proxy cookie check.
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const snapshot = await fetchAllLiveCpuOffers();
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
