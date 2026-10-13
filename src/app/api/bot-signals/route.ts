import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";
import { logAudit } from "@/lib/infranex/audit";

// WEALTH-4 — Engine 03 · CAPTURE AlphaChaser signal inbox.
//
// GET    /api/bot-signals            — list (new first, newest first) + counts
// POST   /api/bot-signals            — add a signal manually / import externally
// PATCH  /api/bot-signals?id=...     — mark taken / expired, edit fields
// DELETE /api/bot-signals?id=...     — remove
//
// Signals are decision records produced by the AlphaChaser scan (or entered
// by hand). Nothing here executes — "taken" means the operator chose to act.

export const dynamic = "force-dynamic";

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function serialize(r: {
  id: string;
  botName: string;
  pair: string;
  signal: string;
  entry: number | null;
  stop: number | null;
  target: number | null;
  confidence: number | null;
  timeframe: string;
  rationale: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const rows = await db.botSignal.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  return NextResponse.json({
    signals: rows.map(serialize),
    counts: {
      fresh: rows.filter((r) => r.status === "new").length,
      taken: rows.filter((r) => r.status === "taken").length,
      expired: rows.filter((r) => r.status === "expired").length,
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
  const signal = String(body.signal ?? "").toUpperCase();
  if (!pair || !["LONG", "SHORT", "NEUTRAL"].includes(signal)) {
    return NextResponse.json({ error: "pair and signal (LONG|SHORT|NEUTRAL) are required" }, { status: 400 });
  }

  const row = await db.botSignal.create({
    data: {
      botName: typeof body.botName === "string" && body.botName.trim() ? body.botName.trim().slice(0, 40) : "AlphaChaser",
      pair,
      signal,
      entry: num(body.entry),
      stop: num(body.stop),
      target: num(body.target),
      confidence: num(body.confidence) != null ? Math.min(Math.max(num(body.confidence) ?? 0, 0), 100) : null,
      timeframe: typeof body.timeframe === "string" ? body.timeframe.slice(0, 40) : "",
      rationale: typeof body.rationale === "string" ? body.rationale.slice(0, 2000) : "",
    },
  });

  await logAudit({
    action: "bot-signal.create",
    actor: gate.session?.uid ?? "system",
    target: row.id,
    detail: `${row.botName} ${row.signal} ${row.pair}`,
  });
  return NextResponse.json({ signal: serialize(row) }, { status: 201 });
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
  if (["new", "taken", "expired"].includes(String(body.status))) patch.status = body.status;
  if (typeof body.rationale === "string") patch.rationale = body.rationale.slice(0, 2000);
  for (const k of ["entry", "stop", "target", "confidence"] as const) {
    if (num(body[k]) != null) patch[k] = num(body[k]);
  }
  if (typeof body.timeframe === "string") patch.timeframe = body.timeframe.slice(0, 40);

  const row = await db.botSignal.update({ where: { id }, data: patch });
  await logAudit({
    action: "bot-signal.update",
    actor: gate.session?.uid ?? "system",
    target: id,
    detail: `${row.pair} signal → ${row.status}`,
  });
  return NextResponse.json({ signal: serialize(row) });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.botSignal.delete({ where: { id } });
  await logAudit({
    action: "bot-signal.delete",
    actor: gate.session?.uid ?? "system",
    target: id,
    detail: `removed signal ${id}`,
  });
  return NextResponse.json({ ok: true });
}
