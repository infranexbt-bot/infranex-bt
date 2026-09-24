import { NextResponse } from "next/server";
import { fetchAllLiveOffers } from "@/lib/infranex/providers";
import { requireActiveUserCookies } from "@/lib/auth-admin";

// Live GPU offers from every configured provider (RunPod, Vast.ai, Lambda —
// keys managed in the GPU catalog). Providers without a stored key are listed
// as not configured; no synthetic fallback offers (MOCK-PURGE-2).
// Polled every 60s by the client.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check),
  // not just the edge-proxy cookie check.
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const snapshot = await fetchAllLiveOffers();
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
