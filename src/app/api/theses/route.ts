import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";
import { logAudit } from "@/lib/infranex/audit";
import { getPrice, getPrices } from "@/lib/infranex/prices";

// WEALTH-3 — Engine 01 · INVEST investment theses.
//
// GET    /api/theses            — list (active/monitoring first, newest first)
// POST   /api/theses            — create (asset, direction, conviction, targets…)
// PATCH  /api/theses?id=...     — update any writable field / status transitions
// DELETE /api/theses?id=...     — remove
//
// Theses are written judgment records. GET enriches each active row with the
// live price when resolvable (best-effort) so distance-to-target is visible.

export const dynamic = "force-dynamic";

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function strArray(v: unknown): string[] | null {
  if (Array.isArray(v)) {
    const arr = v.map((x) => String(x).trim()).filter(Boolean);
    return arr.slice(0, 12);
  }
  if (typeof v === "string") {
    // Accept newline/comma-separated input from the UI textarea.
    const arr = v
      .split(/[\n,]/)
      .map((x) => x.trim())
      .filter(Boolean);
    return arr.slice(0, 12);
  }
  return null;
}

interface ThesisRow {
  id: string;
  asset: string;
  direction: string;
  conviction: string;
  timeframe: string;
  status: string;
  entryPrice: number | null;
  targetPrice: number | null;
  stopPrice: number | null;
  thesis: string;
  catalystsJson: string;
  risksJson: string;
  aiBrief: string | null;
  aiBriefAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function serialize(r: ThesisRow) {
  return {
    ...r,
    aiBriefAt: r.aiBriefAt ? r.aiBriefAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const rows = await db.investmentThesis.findMany({
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  // Best-effort live prices for every distinct asset in the book.
  const assets = [...new Set(rows.map((r) => r.asset.toUpperCase()))];
  const priceMap = await getPrices(assets).catch(() => ({ prices: {} as Record<string, { price: number; change24h: number | null; fetchedAt: string }> }));

  const theses = rows.map((r) => {
    const s = serialize(r);
    const tick = priceMap.prices[r.asset.toUpperCase()];
    const livePrice = tick?.price ?? null;
    // Distance math only meaningful for LONG with target/stop set.
    const toTargetPct =
      livePrice && r.targetPrice && r.targetPrice > 0
        ? ((r.targetPrice - livePrice) / livePrice) * 100
        : null;
    const toStopPct =
      livePrice && r.stopPrice && r.stopPrice > 0
        ? ((r.stopPrice - livePrice) / livePrice) * 100
        : null;
    return {
      ...s,
      livePrice,
      change24h: tick?.change24h ?? null,
      priceAsOf: tick?.fetchedAt ?? null,
      toTargetPct: toTargetPct != null ? Math.round(toTargetPct * 10) / 10 : null,
      toStopPct: toStopPct != null ? Math.round(toStopPct * 10) / 10 : null,
      hasBrief: Boolean(r.aiBrief),
    };
  });

  return NextResponse.json({
    theses,
    counts: {
      active: rows.filter((r) => r.status === "active").length,
      monitoring: rows.filter((r) => r.status === "monitoring").length,
      won: rows.filter((r) => r.status === "won").length,
      lost: rows.filter((r) => r.status === "lost").length,
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

  const asset = typeof body.asset === "string" ? body.asset.trim().toUpperCase() : "";
  if (!asset) return NextResponse.json({ error: "asset is required" }, { status: 400 });

  const catalysts = strArray(body.catalysts);
  const risks = strArray(body.risks);

  // Snapshot the entry price from the live feed when the operator didn't pin one.
  let entryPrice = num(body.entryPrice);
  if (entryPrice == null) {
    const tick = await getPrice(asset).catch(() => null);
    entryPrice = tick?.price ?? null;
  }

  const row = await db.investmentThesis.create({
    data: {
      asset,
      direction: body.direction === "SHORT" ? "SHORT" : "LONG",
      conviction: ["HIGH", "MEDIUM", "LOW"].includes(String(body.conviction))
        ? String(body.conviction)
        : "MEDIUM",
      timeframe: typeof body.timeframe === "string" && body.timeframe.trim() ? body.timeframe.trim() : "6-12 months",
      entryPrice,
      targetPrice: num(body.targetPrice),
      stopPrice: num(body.stopPrice),
      thesis: typeof body.thesis === "string" ? body.thesis.slice(0, 5000) : "",
      catalystsJson: JSON.stringify(catalysts ?? []),
      risksJson: JSON.stringify(risks ?? []),
    },
  });

  await logAudit({
    action: "thesis.create",
    actor: gate.session?.uid ?? "system",
    target: row.id,
    detail: `${row.direction} ${asset} (${row.conviction})`,
  });
  return NextResponse.json({ thesis: serialize(row) }, { status: 201 });
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
  if (typeof body.asset === "string" && body.asset.trim()) patch.asset = body.asset.trim().toUpperCase();
  if (body.direction === "LONG" || body.direction === "SHORT") patch.direction = body.direction;
  if (["HIGH", "MEDIUM", "LOW"].includes(String(body.conviction))) patch.conviction = body.conviction;
  if (typeof body.timeframe === "string") patch.timeframe = body.timeframe.slice(0, 60);
  if (["active", "monitoring", "won", "lost", "closed"].includes(String(body.status))) patch.status = body.status;
  for (const k of ["entryPrice", "targetPrice", "stopPrice"] as const) {
    if (k in body) {
      const n = num(body[k]);
      patch[k] = n; // allows explicit null to clear
    }
  }
  if (typeof body.thesis === "string") patch.thesis = body.thesis.slice(0, 5000);
  const catalysts = strArray(body.catalysts);
  if (catalysts) patch.catalystsJson = JSON.stringify(catalysts);
  const risks = strArray(body.risks);
  if (risks) patch.risksJson = JSON.stringify(risks);

  const row = await db.investmentThesis.update({ where: { id }, data: patch });
  await logAudit({
    action: "thesis.update",
    actor: gate.session?.uid ?? "system",
    target: id,
    detail: `updated thesis ${row.asset} (status ${row.status})`,
  });
  return NextResponse.json({ thesis: serialize(row) });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.investmentThesis.delete({ where: { id } });
  await logAudit({
    action: "thesis.delete",
    actor: gate.session?.uid ?? "system",
    target: id,
    detail: `removed thesis ${id}`,
  });
  return NextResponse.json({ ok: true });
}
