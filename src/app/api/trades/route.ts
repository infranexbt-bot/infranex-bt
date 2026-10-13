import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";
import { logAudit } from "@/lib/infranex/audit";

// WEALTH-4 — Engine 03 · CAPTURE trade journal.
//
// GET    /api/trades           — list + journal analytics (win rate, avg R,
//                                expectancy, realized P&L, per-pair breakdown)
// POST   /api/trades           — log a setup (planned levels + size)
// PATCH  /api/trades?id=...    — update status / close with resultR + pnlUsd
// DELETE /api/trades?id=...    — remove
//
// R discipline: risk per unit = |entry − stop|, one "R" = that risk. Planned
// R = |target − entry| / |entry − stop|. Closing a trade records the achieved
// R so the journal can measure whether the operator's edge is real.

export const dynamic = "force-dynamic";

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

export function plannedR(entry: number, stop: number, target: number): number | null {
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return null;
  return Math.round((Math.abs(target - entry) / risk) * 100) / 100;
}

interface TradeRow {
  id: string;
  pair: string;
  direction: string;
  entry: number;
  stop: number;
  target: number;
  sizeUsd: number | null;
  leverage: number;
  timeframe: string;
  status: string;
  resultR: number | null;
  pnlUsd: number | null;
  notes: string;
  openedAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function serialize(r: TradeRow) {
  return {
    ...r,
    plannedR: plannedR(r.entry, r.stop, r.target),
    openedAt: r.openedAt.toISOString(),
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const rows = await db.tradeSetup.findMany({ orderBy: { openedAt: "desc" } });

  const trades = rows.map(serialize);
  const closed = rows.filter((r) => r.resultR != null);
  const wins = closed.filter((r) => (r.resultR ?? 0) > 0);
  const avgR = closed.length ? closed.reduce((a, r) => a + (r.resultR ?? 0), 0) / closed.length : 0;
  const totalPnl = closed.reduce((a, r) => a + (r.pnlUsd ?? 0), 0);

  const byPair = new Map<string, { pair: string; count: number; wins: number; sumR: number; pnl: number }>();
  for (const r of closed) {
    const e = byPair.get(r.pair) ?? { pair: r.pair, count: 0, wins: 0, sumR: 0, pnl: 0 };
    e.count += 1;
    if ((r.resultR ?? 0) > 0) e.wins += 1;
    e.sumR += r.resultR ?? 0;
    e.pnl += r.pnlUsd ?? 0;
    byPair.set(r.pair, e);
  }

  return NextResponse.json({
    trades,
    stats: {
      total: rows.length,
      planned: rows.filter((r) => r.status === "planned").length,
      active: rows.filter((r) => r.status === "active").length,
      closed: closed.length,
      winRatePct: closed.length ? Math.round((wins.length / closed.length) * 1000) / 10 : 0,
      avgR: Math.round(avgR * 100) / 100,
      expectancyR: Math.round(avgR * 100) / 100, // same number, trading name
      totalPnlUsd: Math.round(totalPnl * 100) / 100,
      bestR: closed.length ? Math.max(...closed.map((r) => r.resultR ?? 0)) : null,
      worstR: closed.length ? Math.min(...closed.map((r) => r.resultR ?? 0)) : null,
      byPair: [...byPair.values()]
        .map((e) => ({
          pair: e.pair,
          count: e.count,
          winRatePct: Math.round((e.wins / e.count) * 100),
          avgR: Math.round((e.sumR / e.count) * 100) / 100,
          pnlUsd: Math.round(e.pnl * 100) / 100,
        }))
        .sort((a, b) => b.pnlUsd - a.pnlUsd)
        .slice(0, 8),
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

  const pair = typeof body.pair === "string" ? body.pair.trim().toUpperCase() : "";
  const entry = num(body.entry);
  const stop = num(body.stop);
  const target = num(body.target);
  if (!pair || entry == null || stop == null || target == null) {
    return NextResponse.json({ error: "pair, entry, stop and target are required" }, { status: 400 });
  }
  if (entry <= 0 || stop <= 0 || target <= 0) {
    return NextResponse.json({ error: "entry, stop and target must be positive" }, { status: 400 });
  }

  const row = await db.tradeSetup.create({
    data: {
      pair,
      direction: body.direction === "SHORT" ? "SHORT" : "LONG",
      entry,
      stop,
      target,
      sizeUsd: num(body.sizeUsd),
      leverage: Math.min(Math.max(num(body.leverage) ?? 1, 1), 50),
      timeframe: typeof body.timeframe === "string" ? body.timeframe.slice(0, 40) : "",
      notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : "",
      status: body.status === "active" ? "active" : "planned",
    },
  });

  await logAudit({
    action: "trade.create",
    actor: gate.session?.uid ?? "system",
    target: row.id,
    detail: `${row.direction} ${pair} ${plannedR(entry, stop, target) ?? "?"}R planned`,
  });
  return NextResponse.json({ trade: serialize(row) }, { status: 201 });
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
  if (typeof body.pair === "string" && body.pair.trim()) patch.pair = body.pair.trim().toUpperCase();
  if (body.direction === "LONG" || body.direction === "SHORT") patch.direction = body.direction;
  for (const k of ["entry", "stop", "target"] as const) {
    if (num(body[k]) != null && (num(body[k]) ?? 0) > 0) patch[k] = num(body[k]);
  }
  if (num(body.sizeUsd) != null) patch.sizeUsd = num(body.sizeUsd);
  if (num(body.leverage) != null) patch.leverage = Math.min(Math.max(num(body.leverage) ?? 1, 1), 50);
  if (typeof body.timeframe === "string") patch.timeframe = body.timeframe.slice(0, 40);
  if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 2000);
  if (["planned", "active", "won", "lost", "cancelled"].includes(String(body.status))) {
    patch.status = body.status;
    if (["won", "lost", "cancelled"].includes(String(body.status))) patch.closedAt = new Date();
    if (body.status === "active") patch.closedAt = null;
  }
  if (num(body.resultR) != null) patch.resultR = num(body.resultR);
  if (num(body.pnlUsd) != null) patch.pnlUsd = num(body.pnlUsd);

  const row = await db.tradeSetup.update({ where: { id }, data: patch });
  await logAudit({
    action: "trade.update",
    actor: gate.session?.uid ?? "system",
    target: id,
    detail: `${row.pair} ${row.status}${row.resultR != null ? ` ${row.resultR}R` : ""}`,
  });
  return NextResponse.json({ trade: serialize(row) });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.tradeSetup.delete({ where: { id } });
  await logAudit({
    action: "trade.delete",
    actor: gate.session?.uid ?? "system",
    target: id,
    detail: `removed trade ${id}`,
  });
  return NextResponse.json({ ok: true });
}
