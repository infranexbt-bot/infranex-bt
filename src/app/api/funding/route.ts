import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-admin";
import { loadFunding } from "@/lib/infranex/funding";

// WEALTH-4 — Engine 03 · CAPTURE funding scanner.
//
// GET /api/funding?limit=50&minOi=1000000&side=all|long|short&sort=abs|pct
//
// Hyperliquid perp funding, annualized (1h × 24 × 365). carrySide tells the
// operator which side collects the carry:
//   funding > 0 → shorts collect · funding < 0 → longs collect.
// 10-min server cache; stale data is served (flagged) if upstream fails.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? 50) || 50, 1), 234);
  const minOi = Number(sp.get("minOi") ?? 1_000_000) || 0;
  const side = sp.get("side") ?? "all"; // all | long | short  (carry side)
  const sort = sp.get("sort") === "pct" ? "pct" : "abs";

  let snap;
  try {
    snap = await loadFunding();
  } catch (e) {
    return NextResponse.json(
      { error: `funding source unavailable: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 502 }
    );
  }

  let rows = snap.rows.filter((r) => (r.openInterestUsd ?? 0) >= minOi);
  if (side === "long") rows = rows.filter((r) => r.carrySide === "long");
  if (side === "short") rows = rows.filter((r) => r.carrySide === "short");
  rows =
    sort === "pct"
      ? rows.slice().sort((a, b) => b.fundingAnnualPct - a.fundingAnnualPct)
      : rows.slice().sort((a, b) => Math.abs(b.fundingAnnualPct) - Math.abs(a.fundingAnnualPct));

  // Extremes for the header strip.
  const positive = snap.rows.filter((r) => r.fundingAnnualPct > 0);
  const negative = snap.rows.filter((r) => r.fundingAnnualPct < 0);
  const bestShort =
    positive.slice().sort((a, b) => b.fundingAnnualPct - a.fundingAnnualPct)[0] ?? null;
  const bestLong =
    negative.slice().sort((a, b) => a.fundingAnnualPct - b.fundingAnnualPct)[0] ?? null;

  return NextResponse.json(
    {
      source: "hyperliquid",
      fetchedAt: snap.fetchedAt,
      stale: snap.stale,
      universeCount: snap.universeCount,
      matching: rows.length,
      extremes: {
        bestShortCarry: bestShort
          ? { asset: bestShort.asset, annualPct: bestShort.fundingAnnualPct }
          : null,
        bestLongCarry: bestLong
          ? { asset: bestLong.asset, annualPct: bestLong.fundingAnnualPct }
          : null,
      },
      rows: rows.slice(0, limit),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
