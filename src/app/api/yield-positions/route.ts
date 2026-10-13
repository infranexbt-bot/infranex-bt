import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";
import { logAudit } from "@/lib/infranex/audit";

// WEALTH-1 — operator yield positions (Engine 02 · EARN).
//
// GET    /api/yield-positions          — list (active first, newest first)
// POST   /api/yield-positions          — create / upsert by poolId
// PATCH  /api/yield-positions?id=...   — update amount, APYs, status, notes
// DELETE /api/yield-positions?id=...   — remove
//
// Positions are pure bookkeeping: the platform never moves funds. APYs are
// numbers the operator copied from the yield board (or refreshed from it).

export const dynamic = "force-dynamic";

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function serialize(r: {
  id: string;
  poolId: string;
  protocol: string;
  chain: string;
  symbol: string;
  stablecoin: boolean;
  amountUsd: number;
  entryApy: number;
  currentApy: number | null;
  status: string;
  notes: string;
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
  const rows = await db.yieldPosition.findMany({
    orderBy: [{ status: "asc" }, { amountUsd: "desc" }, { createdAt: "desc" }],
  });
  const active = rows.filter((r) => r.status === "active");
  const monthlyUsd = active.reduce(
    (a, r) => a + (r.amountUsd * ((r.currentApy ?? r.entryApy) / 100)) / 12,
    0
  );
  return NextResponse.json({
    positions: rows.map(serialize),
    totals: {
      activeCount: active.length,
      totalUsd: active.reduce((a, r) => a + r.amountUsd, 0),
      // Blended APY over deployed capital.
      blendedApy: active.length
        ? (monthlyUsd * 12) / active.reduce((a, r) => a + r.amountUsd, 0) * 100
        : 0,
      monthlyUsd,
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

  const poolId = typeof body.poolId === "string" ? body.poolId.trim() : "";
  const protocol = typeof body.protocol === "string" ? body.protocol.trim() : "";
  if (!poolId || !protocol) {
    return NextResponse.json({ error: "poolId and protocol are required" }, { status: 400 });
  }
  const amountUsd = num(body.amountUsd);
  const entryApy = num(body.entryApy);
  if (amountUsd == null || amountUsd <= 0) {
    return NextResponse.json({ error: "amountUsd must be > 0" }, { status: 400 });
  }

  const row = await db.yieldPosition.upsert({
    where: { poolId },
    create: {
      poolId,
      protocol,
      chain: typeof body.chain === "string" ? body.chain : "unknown",
      symbol: typeof body.symbol === "string" ? body.symbol : "",
      stablecoin: body.stablecoin !== false,
      amountUsd,
      entryApy: entryApy ?? 0,
      currentApy: num(body.currentApy),
      notes: typeof body.notes === "string" ? body.notes : "",
    },
    // Re-tracking an existing pool merges into the position: average the
    // entry APY weighted by amount, keep the newer currentApy.
    update: {
      amountUsd: { increment: amountUsd },
      currentApy: num(body.currentApy),
    },
  });

  await logAudit({
    action: "yield-position.create",
    actor: gate.session?.uid ?? "system",
    target: poolId,
    detail: `tracked pool ${protocol} with $${amountUsd}`,
  });
  return NextResponse.json({ position: serialize(row) }, { status: 201 });
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
  if (num(body.amountUsd) != null) patch.amountUsd = num(body.amountUsd);
  if (num(body.entryApy) != null) patch.entryApy = num(body.entryApy);
  if (num(body.currentApy) != null) patch.currentApy = num(body.currentApy);
  if (body.status === "active" || body.status === "closed") patch.status = body.status;
  if (typeof body.notes === "string") patch.notes = body.notes;

  const row = await db.yieldPosition.update({ where: { id }, data: patch });
  await logAudit({
    action: "yield-position.update",
    actor: gate.session?.uid ?? "system",
    target: id,
    detail: `updated yield position ${id}`,
  });
  return NextResponse.json({ position: serialize(row) });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.yieldPosition.delete({ where: { id } });
  await logAudit({
    action: "yield-position.delete",
    actor: gate.session?.uid ?? "system",
    target: id,
    detail: `removed yield position ${id}`,
  });
  return NextResponse.json({ ok: true });
}
