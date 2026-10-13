import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";
import { logAudit } from "@/lib/infranex/audit";

// WEALTH-3 — Engine 01 · INVEST asymmetric bets.
//
// GET    /api/bets            — list + expectancy (EV) + Kelly sizing per bet
// POST   /api/bets            — create
// PATCH  /api/bets?id=...     — update inputs / settle (status + realizedUsd)
// DELETE /api/bets?id=...     — remove
//
// The whole point of an asymmetric book: capped downside, fat right tail.
// Math per bet (operator-supplied estimates, computed server-side for
// consistency):
//   G = upsideMultiple − 1            (net gain multiple when right)
//   L = downsidePercent / 100         (fraction of the position lost when wrong)
//   p = winProbability / 100
//   EV  = capital × (p·G − q·L)
//   Kelly f* = (p·G − q·L) / (L·G), capped to [0, 1] — full Kelly is shown;
//   the note about sizing half-Kelly is the operator's discipline.

export const dynamic = "force-dynamic";

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

interface BetRow {
  id: string;
  name: string;
  asset: string;
  vehicle: string;
  capitalUsd: number;
  upsideMultiple: number;
  downsidePercent: number;
  winProbability: number;
  status: string;
  realizedUsd: number | null;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

function enrich(r: BetRow) {
  const G = Math.max(r.upsideMultiple - 1, 0);
  const L = Math.min(Math.max(r.downsidePercent, 0), 100) / 100;
  const p = Math.min(Math.max(r.winProbability, 0), 100) / 100;
  const q = 1 - p;
  const evUsd = r.capitalUsd * (p * G - q * L);
  const kellyRaw = G > 0 && L > 0 ? (p * G - q * L) / (L * G) : 0;
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    gainMultiple: Math.round(G * 100) / 100,
    lossFraction: L,
    evUsd: Math.round(evUsd * 100) / 100,
    payoffRatio: L > 0 ? Math.round((G / L) * 100) / 100 : null,
    kellyPct: Math.round(Math.min(Math.max(kellyRaw, 0), 1) * 1000) / 10,
    // Roughly what the position returns if it hits the upside target.
    winProfitUsd: Math.round(r.capitalUsd * G * 100) / 100,
    lossAmountUsd: Math.round(r.capitalUsd * L * 100) / 100,
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const rows = await db.asymmetricBet.findMany({ orderBy: [{ status: "asc" }, { updatedAt: "desc" }] });
  const bets = rows.map(enrich);
  const open = bets.filter((b) => b.status === "open");

  const openCapital = open.reduce((a, b) => a + b.capitalUsd, 0);
  const settled = bets.filter((b) => b.status === "won" || b.status === "lost");
  const settledCapital = settled.reduce((a, b) => a + b.capitalUsd, 0);
  const realized = settled.reduce((a, b) => a + (b.realizedUsd ?? 0), 0);

  return NextResponse.json({
    bets,
    totals: {
      openCount: open.length,
      openCapitalUsd: openCapital,
      openEvUsd: open.reduce((a, b) => a + b.evUsd, 0),
      settledCount: settled.length,
      realizedUsd: realized,
      realizedPct: settledCapital > 0 ? (realized / settledCapital) * 100 : 0,
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

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const asset = typeof body.asset === "string" ? body.asset.trim().toUpperCase() : "";
  const capitalUsd = num(body.capitalUsd);
  if (!name || !asset || capitalUsd == null || capitalUsd <= 0) {
    return NextResponse.json({ error: "name, asset and capitalUsd > 0 are required" }, { status: 400 });
  }

  const row = await db.asymmetricBet.create({
    data: {
      name: name.slice(0, 120),
      asset,
      vehicle: typeof body.vehicle === "string" && body.vehicle.trim() ? body.vehicle.trim().slice(0, 40) : "Spot",
      capitalUsd,
      upsideMultiple: Math.max(num(body.upsideMultiple) ?? 3, 1.01),
      downsidePercent: Math.min(Math.max(num(body.downsidePercent) ?? 100, 1), 100),
      winProbability: Math.min(Math.max(num(body.winProbability) ?? 30, 0), 100),
      notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : "",
    },
  });

  await logAudit({
    action: "bet.create",
    actor: gate.session?.uid ?? "system",
    target: row.id,
    detail: `${asset} bet $${capitalUsd} → ${row.upsideMultiple}x @ ${row.winProbability}%`,
  });
  return NextResponse.json({ bet: enrich(row) }, { status: 201 });
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
  if (typeof body.name === "string") patch.name = body.name.slice(0, 120);
  if (typeof body.asset === "string" && body.asset.trim()) patch.asset = body.asset.trim().toUpperCase();
  if (typeof body.vehicle === "string" && body.vehicle.trim()) patch.vehicle = body.vehicle.trim().slice(0, 40);
  if (num(body.capitalUsd) != null) patch.capitalUsd = num(body.capitalUsd);
  if (num(body.upsideMultiple) != null) patch.upsideMultiple = Math.max(num(body.upsideMultiple) ?? 1.01, 1.01);
  if (num(body.downsidePercent) != null) patch.downsidePercent = Math.min(Math.max(num(body.downsidePercent) ?? 1, 1), 100);
  if (num(body.winProbability) != null) patch.winProbability = Math.min(Math.max(num(body.winProbability) ?? 0, 0), 100);
  if (["open", "won", "lost", "closed"].includes(String(body.status))) patch.status = body.status;
  if (num(body.realizedUsd) != null) patch.realizedUsd = num(body.realizedUsd);
  if (typeof body.notes === "string") patch.notes = body.notes.slice(0, 2000);

  const row = await db.asymmetricBet.update({ where: { id }, data: patch });
  await logAudit({
    action: "bet.update",
    actor: gate.session?.uid ?? "system",
    target: id,
    detail: `updated bet ${row.asset} (status ${row.status})`,
  });
  return NextResponse.json({ bet: enrich(row) });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.asymmetricBet.delete({ where: { id } });
  await logAudit({
    action: "bet.delete",
    actor: gate.session?.uid ?? "system",
    target: id,
    detail: `removed bet ${id}`,
  });
  return NextResponse.json({ ok: true });
}
