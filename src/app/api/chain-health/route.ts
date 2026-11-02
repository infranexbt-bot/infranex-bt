import { NextResponse } from "next/server";
import { requireActiveUserCookies } from "@/lib/auth-admin";

// Server-side probe of the Bittensor Finney RPC (chain_getHeader).
//
// HEALTH-PROBE-1 (2026-11-02): the System & Errors panel used to POST to
// entrypoint-finney.opentensor.ai directly from the browser. When the node
// rate-limits or errors, those responses ship WITHOUT CORS headers, so the
// browser surfaced a healthy chain as "Failed to fetch" — while the app's
// own server-side polling (the path that actually feeds the dashboard) kept
// working. The probe now runs here: same-origin for the client, no CORS to
// fail, and it measures exactly the network path the app depends on.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const RPC = "https://entrypoint-finney.opentensor.ai/rpc";

export async function GET() {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check),
  // not just the edge-proxy cookie check.
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const start = Date.now();
  const noStore = { "Cache-Control": "no-store, max-age=0" };
  try {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "chain_getHeader", params: [] }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return NextResponse.json(
        { source: "fail", latencyMs, error: `HTTP ${res.status} ${res.statusText}`.trim() },
        { headers: noStore },
      );
    }
    const j = (await res.json()) as { result?: { number?: string } };
    const hex = j.result?.number;
    if (!hex) {
      return NextResponse.json(
        { source: "fail", latencyMs, error: "Malformed RPC response — no header in result" },
        { headers: noStore },
      );
    }
    return NextResponse.json(
      { source: "live", blockNumber: parseInt(hex, 16), latencyMs },
      { headers: noStore },
    );
  } catch (e) {
    return NextResponse.json(
      {
        source: "fail",
        latencyMs: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      },
      { headers: noStore },
    );
  }
}
