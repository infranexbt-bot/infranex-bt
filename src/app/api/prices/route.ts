import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-admin";
import { getPrices } from "@/lib/infranex/prices";

// WEALTH-3/4 — shared live price proxy (Binance → CoinGecko, no keys).
//
// GET /api/prices?symbols=TAO,BTC,SOL
// → { prices: { TAO: { price, change24h, source, fetchedAt } }, staleSymbols, sources }
//
// 5-min server cache per symbol; stale ticks served (and flagged) for up to
// 24h when both upstreams fail. Unresolvable symbols are simply absent.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const raw = req.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (symbols.length === 0) {
    return NextResponse.json({ error: "symbols query param required" }, { status: 400 });
  }

  const result = await getPrices(symbols);
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
