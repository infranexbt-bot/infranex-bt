import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUserCookies } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

// OPPORTUNITY-ENGINE-2 — opportunity snapshot history (§9: keep historical
// measurements separate from forecasts).
//
// GET /api/opportunity-snapshots                     → latest day, all subnets
// GET /api/opportunity-snapshots?netuid=82&days=30   → one subnet's history
//
// Read-only, session-gated. Pure history — nothing here mutates forecasts.

export async function GET(req: NextRequest) {
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  try {
    const sp = req.nextUrl.searchParams;
    const netuid = sp.get("netuid");
    const days = Math.min(Math.max(Number(sp.get("days") ?? 30) || 30, 1), 365);

    if (netuid != null) {
      const uid = Number(netuid);
      if (!Number.isInteger(uid) || uid < 0) {
        return NextResponse.json({ error: "netuid must be a non-negative integer" }, { status: 400 });
      }
      const rows = await db.opportunitySnapshot.findMany({
        where: { netuid: uid },
        orderBy: [{ day: "desc" }],
        take: days,
      });
      return NextResponse.json({ netuid: uid, snapshots: rows }, {
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }

    // Latest day across all subnets — the "how did the ranking move" view.
    const latest = await db.opportunitySnapshot.aggregate({ _max: { day: true } });
    const day = latest._max.day;
    const rows = day
      ? await db.opportunitySnapshot.findMany({ where: { day }, orderBy: { netuid: "asc" } })
      : [];
    return NextResponse.json({ day, count: rows.length, snapshots: rows }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to load snapshots" },
      { status: 500 }
    );
  }
}
