import { NextResponse } from "next/server";
import { fetchAllLiveCpuOffers } from "@/lib/infranex/cpu-providers";

// Live CPU VPS offers from every configured CPU provider (Hetzner Cloud,
// DigitalOcean — keys managed in the CPU catalog). Providers without a
// stored key are listed as not configured; no synthetic fallback offers
// (same honesty contract as /api/gpu-offers, MOCK-PURGE-2).
// Polled every 60s by the client.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const snapshot = await fetchAllLiveCpuOffers();
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
