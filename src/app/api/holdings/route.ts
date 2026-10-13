import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";
import { logAudit } from "@/lib/infranex/audit";
import { getPrices } from "@/lib/infranex/prices";

// WEALTH-3 — Engine 01 · INVEST portfolio holdings & allocation.
//
// GET    /api/holdings            — list + live value, unrealized P&L, weights
// POST   /api/holdings            — add / merge holding (same symbol adds qty, re-averages cost)
// PATCH  /api/holdings?id=...     — quantity, avgCost, venue, notes
// DELETE /api/holdings?id=...     — remove
//
// Pure bookkeeping: quantities and average costs are operator-entered; the
// live price comes from the shared price pipeline. Allocation weights are
// computed over priced holdings only (unpriced rows are listed separately
// so nothing silently disappears from the totals).

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
  const rows = await db.portfolioHolding.findMany({ orderBy: { createdAt: "asc" } });
  const { prices, staleSymbols } = await getPrices(rows.map((r) => r.symbol)).catch(() => ({
    prices: {} as Record<string, { price: number; change24h: number | null; fetchedAt: string }>,
    staleSymbols: [] as string[],
    sources: { binance: false, coingecko: false },
  }));

  const items = rows.map((r) => {
    const tick = prices[r.symbol];
    const price = tick?.price ?? null;
    const valueUsd = price != null ? price * r.quantity : null;
    const costBasis = r.quantity * r.avgCostUsd;
    const pnlUsd = valueUsd != null ? valueUsd - costBasis : null;
    return {
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      price,
      change24h: tick?.change24h ?? null,
      priceAsOf: tick?.fetchedAt ?? null,
      valueUsd,
      costBasisUsd: costBasis,
      pnlUsd,
      pnlPct: pnlUsd != null && costBasis > 0 ? (pnlUsd / costBasis) * 100 : null,
      stalePrice: staleSymbols.includes(r.symbol),
    };
  });

  const totalValueUsd = items.reduce((a, i) => a + (i.valueUsd ?? 0), 0);
  const totalCostUsd = items.reduce((a, i) => a + i.costBasisUsd, 0);
  const totalPnlUsd = totalValueUsd - totalCostUsd;

  // Weight over priced holdings; unpriced rows get null weight.
  const itemsWithWeight = items.map((i) => ({
    ...i,
    weightPct: i.valueUsd != null && totalValueUsd > 0 ? (i.valueUsd / totalValueUsd) * 100 : null,
  }));

  return NextResponse.json({
    holdings: itemsWithWeight,
    totals: {
      valueUsd: totalValueUsd,
      costUsd: totalCostUsd,
      pnlUsd: totalPnlUsd,
      pnlPct: totalCostUsd > 0 ? (totalPnlUsd / totalCostUsd) * 100 : 0,
      count: items.length,
      unpriced: items.filter((i) => i.valueUsd == null).map((i) => i.symbol),
      topWeights: itemsWithWeight
        .filter((i) => i.weightPct != null)
        .sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0))
        .slice(0, 3)
        .map((i) => ({ symbol: i.symbol, weightPct: Math.round(i.weightPct ?? 0) })),
    },
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
  const quantity = num(body.quantity);
  const avgCostUsd = num(body.avgCostUsd);
  if (!symbol || quantity == null || quantity <= 0 || avgCostUsd == null || avgCostUsd < 0) {
    return NextResponse.json(
      { error: "symbol, quantity > 0 and avgCostUsd >= 0 are required" },
      { status: 400 }
    );
  }

  // Merge semantics: adding to an existing symbol re-averages the cost basis.
  const existing = await db.portfolioHolding.findUnique({ where: { symbol } });
  const row = existing
    ? await db.portfolioHolding.update({
        where: { symbol },
        data: {
          quantity: existing.quantity + quantity,
          avgCostUsd: (existing.quantity * existing.avgCostUsd + quantity * avgCostUsd) / (existing.quantity + quantity),
          venue: typeof body.venue === "string" && body.venue.trim() ? body.venue.slice(0, 80) : existing.venue,
        },
      })
    : await db.portfolioHolding.create({
        data: {
          symbol,
          quantity,
          avgCostUsd,
          venue: typeof body.venue === "string" ? body.venue.slice(0, 80) : "",
          notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : "",
        },
      });

  await logAudit({
    action: "holding.upsert",
    actor: gate.session?.uid ?? "system",
    target: symbol,
    detail: existing ? `added ${quantity} ${symbol} (re-averaged cost)` : `holding ${quantity} ${symbol} @ $${avgCostUsd}`,
  });
  return NextResponse.json(
    {
      holding: {
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    },
    { status: 201 }
  );
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
  if (num(body.quantity) != null) patch.quantity = num(body.quantity);
  if (num(body.avgCostUsd) != null) patch.avgCostUsd = num(body.avgCostUsd);
  if (typeof body.venue === "string") patch.venue = body.venue.slice(0, 80);
  if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 1000);

  const row = await db.portfolioHolding.update({ where: { id }, data: patch });
  await logAudit({
    action: "holding.update",
    actor: gate.session?.uid ?? "system",
    target: row.symbol,
    detail: `updated holding ${row.symbol}`,
  });
  return NextResponse.json({
    holding: { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() },
  });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.portfolioHolding.delete({ where: { id } });
  await logAudit({
    action: "holding.delete",
    actor: gate.session?.uid ?? "system",
    target: id,
    detail: `removed holding ${id}`,
  });
  return NextResponse.json({ ok: true });
}
