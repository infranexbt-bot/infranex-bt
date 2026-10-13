import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";
import { logAudit } from "@/lib/infranex/audit";
import { getPrices } from "@/lib/infranex/prices";

// WEALTH-3 — Engine 01 · INVEST watchlist.
//
// GET    /api/watchlist            — list joined with live prices (best-effort)
// POST   /api/watchlist            — add symbol (upsert by symbol)
// PATCH  /api/watchlist?id=...     — alerts / notes / name
// DELETE /api/watchlist?id=...     — remove
//
// Alert thresholds are evaluated server-side on read: status is "above" /
// "below" / "ok" / "unknown" so the UI can highlight actionable rows.

export const dynamic = "force-dynamic";

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const rows = await db.watchlistItem.findMany({ orderBy: { createdAt: "asc" } });
  const symbols = rows.map((r) => r.symbol);
  const { prices, staleSymbols } = await getPrices(symbols).catch(() => ({
    prices: {} as Record<string, { price: number; change24h: number | null; fetchedAt: string }>,
    staleSymbols: [] as string[],
    sources: { binance: false, coingecko: false },
  }));

  const items = rows.map((r) => {
    const tick = prices[r.symbol];
    const price = tick?.price ?? null;
    let alert: "above" | "below" | "ok" | "unknown" = "unknown";
    if (price != null) {
      if (r.alertAbove != null && price >= r.alertAbove) alert = "above";
      else if (r.alertBelow != null && price <= r.alertBelow) alert = "below";
      else alert = "ok";
    }
    return {
      ...r,
      createdAt: r.createdAt.toISOString(),
      price,
      change24h: tick?.change24h ?? null,
      priceAsOf: tick?.fetchedAt ?? null,
      alertStatus: alert,
      stalePrice: staleSymbols.includes(r.symbol),
    };
  });

  return NextResponse.json({
    items,
    alerts: items.filter((i) => i.alertStatus === "above" || i.alertStatus === "below").length,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });

  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase().replace(/-?USDT$/, "") : "";
  if (!symbol || !/^[A-Z0-9]{1,20}$/.test(symbol)) {
    return NextResponse.json({ error: "a valid symbol is required (e.g. TAO, BTC)" }, { status: 400 });
  }

  const { prices } = await getPrices([symbol]);
  const tick = prices[symbol];
  if (!tick) {
    return NextResponse.json(
      { error: `could not resolve a live price for ${symbol} — check the ticker` },
      { status: 422 }
    );
  }

  const row = await db.watchlistItem.upsert({
    where: { symbol },
    create: {
      symbol,
      name: typeof body.name === "string" ? body.name.slice(0, 80) : "",
      priceAtAdd: tick.price,
      alertAbove: num(body.alertAbove),
      alertBelow: num(body.alertBelow),
      notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : "",
    },
    update: {
      alertAbove: num(body.alertAbove) ?? undefined,
      alertBelow: num(body.alertBelow) ?? undefined,
      notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : undefined,
    },
  });

  await logAudit({
    action: "watchlist.upsert",
    actor: gate.session?.uid ?? "system",
    target: symbol,
    detail: `watching ${symbol} @ $${tick.price}`,
  });
  return NextResponse.json({ item: { ...row, createdAt: row.createdAt.toISOString() } }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.slice(0, 80);
  if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 1000);
  for (const k of ["alertAbove", "alertBelow"] as const) {
    if (k in body) patch[k] = num(body[k]); // explicit null clears
  }

  const row = await db.watchlistItem.update({ where: { id }, data: patch });
  await logAudit({
    action: "watchlist.update",
    actor: gate.session?.uid ?? "system",
    target: row.symbol,
    detail: `updated watchlist entry ${row.symbol}`,
  });
  return NextResponse.json({ item: { ...row, createdAt: row.createdAt.toISOString() } });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.watchlistItem.delete({ where: { id } });
  await logAudit({
    action: "watchlist.delete",
    actor: gate.session?.uid ?? "system",
    target: id,
    detail: `removed watchlist entry ${id}`,
  });
  return NextResponse.json({ ok: true });
}
