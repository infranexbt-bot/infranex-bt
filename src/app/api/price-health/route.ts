import { NextResponse } from "next/server";
import { requireActiveUserCookies } from "@/lib/auth-admin";
import { getPrices } from "@/lib/infranex/prices";

// Server-side probe of the TAO price feed — runs the app's REAL pipeline.
//
// HEALTH-PROBE-2 (2026-11-02): the panel used to fetch CoinGecko directly
// from the browser (rate-limited 429s ship without CORS headers → browser
// showed "Failed to fetch"; browsers also cannot set User-Agent). V2 of the
// route probed CoinGecko server-side but collided with the price worker's
// own polling on the same IP → 429. Final design: probe the shared pipeline
// (getPrices) itself — Binance primary, CoinGecko fallback, 5-min cache +
// 24h stale-serve. It measures the exact path the app depends on, and the
// pipeline's internal cache means the probe adds zero extra rate pressure.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check),
  // not just the edge-proxy cookie check.
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const start = Date.now();
  const noStore = { "Cache-Control": "no-store, max-age=0" };
  try {
    const r = await getPrices(["TAO"]);
    const latencyMs = Date.now() - start;
    const tick = r.prices["TAO"];
    if (!tick) {
      return NextResponse.json(
        {
          source: "fail",
          latencyMs,
          error: "No TAO price from any source (Binance + CoinGecko + 24h cache exhausted)",
        },
        { headers: noStore },
      );
    }
    return NextResponse.json(
      {
        // "live" = fresh tick (≤5min old) · "cached" = stale-serve (≤24h),
        // which the pipeline flags instead of failing — the app stays usable.
        source: r.staleSymbols.includes("TAO") ? "cached" : "live",
        taoPriceUsd: tick.price,
        change24h: tick.change24h,
        via: tick.source,
        sources: r.sources,
        latencyMs,
      },
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
