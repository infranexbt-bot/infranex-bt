import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";
import { logAudit } from "@/lib/infranex/audit";

// WEALTH-2 — Engine 02 · EARN Monthly Income rollup.
//
// GET  /api/income/summary — unified recurring-cashflow view:
//   · mining  : trailing-30d realized earnings from EarningsDaily (real data)
//   · yield   : projected monthly from active YieldPosition rows
//   · manual  : operator-entered IncomeEntry rows (staking rewards, other)
// plus a 6-month trend table.
//
// POST   /api/income/summary  { month, source, label, amountUsd }
// DELETE /api/income/summary?id=...        — manual entries only.

export const dynamic = "force-dynamic";

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(monthKey(d));
  }
  return out;
}

export async function GET(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const today = new Date();
  const day30 = new Date(today.getTime() - 30 * 24 * 3600 * 1000);
  const day30Str = day30.toISOString().slice(0, 10);
  const months = lastNMonths(6);

  const [earnings, yieldRows, manualRows] = await Promise.all([
    db.earningsDaily.findMany({
      where: { day: { gte: day30Str } },
      select: { hotkey: true, netuid: true, day: true, earnedUsd: true, earnedTao: true },
    }),
    db.yieldPosition.findMany({ where: { status: "active" } }),
    db.incomeEntry.findMany({ orderBy: [{ month: "desc" }, { createdAt: "desc" }] }),
  ]);

  // --- Mining: trailing-30d realized, per subnet for the breakdown.
  const bySubnet = new Map<number, number>();
  let mining30d = 0;
  for (const e of earnings) {
    mining30d += e.earnedUsd;
    bySubnet.set(e.netuid, (bySubnet.get(e.netuid) ?? 0) + e.earnedUsd);
  }
  const mining = {
    trailing30dUsd: Math.round(mining30d * 100) / 100,
    monthlyProjectedUsd: Math.round(mining30d * 100) / 100, // trailing 30d IS the monthly run-rate
    dailyAvgUsd: Math.round((mining30d / 30) * 100) / 100,
    topSubnets: [...bySubnet.entries()]
      .map(([netuid, usd]) => ({ netuid, usd: Math.round(usd * 100) / 100 }))
      .sort((a, b) => b.usd - a.usd)
      .slice(0, 5),
  };

  // --- Yield: projection from active positions at current (or entry) APY.
  const yieldTotalUsd = yieldRows.reduce((a, r) => a + r.amountUsd, 0);
  const yieldMonthly = yieldRows.reduce(
    (a, r) => a + (r.amountUsd * ((r.currentApy ?? r.entryApy) / 100)) / 12,
    0
  );
  const yieldBlock = {
    monthlyUsd: Math.round(yieldMonthly * 100) / 100,
    totalUsd: Math.round(yieldTotalUsd * 100) / 100,
    blendedApy: yieldTotalUsd > 0 ? Math.round(((yieldMonthly * 12) / yieldTotalUsd) * 10000) / 100 : 0,
    activeCount: yieldRows.length,
  };

  // --- Manual entries: current month live, history for the trend.
  const thisMonth = monthKey(today);
  const manualCurrent = manualRows.filter((r) => r.month === thisMonth);
  const manualMonthly = manualCurrent.reduce((a, r) => a + r.amountUsd, 0);

  // --- 6-month trend.
  const trend = months.map((m) => {
    const daysInMonth = m === thisMonth;
    const rows = earnings.filter((e) => e.day.startsWith(m));
    const miningUsd = rows.reduce((a, e) => a + e.earnedUsd, 0);
    const manualUsd = manualRows.filter((r) => r.month === m).reduce((a, r) => a + r.amountUsd, 0);
    return {
      month: m,
      // Partial months are annualized to a 30d-equivalent so the trend line
      // stays comparable; flagged so the UI can mark them.
      miningUsd: Math.round((daysInMonth ? (miningUsd / Math.max(1, today.getUTCDate())) * 30 : miningUsd) * 100) / 100,
      yieldUsd: Math.round(yieldMonthly * 100) / 100,
      manualUsd: Math.round(manualUsd * 100) / 100,
      totalUsd: 0,
      partial: daysInMonth,
    };
  });
  for (const t of trend) t.totalUsd = Math.round((t.miningUsd + t.yieldUsd + t.manualUsd) * 100) / 100;

  return NextResponse.json(
    {
      month: thisMonth,
      totalMonthlyUsd:
        Math.round((mining.monthlyProjectedUsd + yieldBlock.monthlyUsd + manualMonthly) * 100) / 100,
      mining,
      yield: yieldBlock,
      manual: {
        currentMonthUsd: Math.round(manualMonthly * 100) / 100,
        entries: manualRows.slice(0, 20).map((r) => ({
          id: r.id,
          month: r.month,
          source: r.source,
          label: r.label,
          amountUsd: r.amountUsd,
        })),
      },
      trend,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });

  const amountUsd = typeof body.amountUsd === "number" ? body.amountUsd : NaN;
  const source = typeof body.source === "string" ? body.source.trim() : "";
  if (!Number.isFinite(amountUsd) || !source) {
    return NextResponse.json({ error: "source and amountUsd are required" }, { status: 400 });
  }
  const month = typeof body.month === "string" && /^\d{4}-\d{2}$/.test(body.month) ? body.month : monthKey(new Date());
  const label = typeof body.label === "string" ? body.label.slice(0, 80) : "";

  const row = await db.incomeEntry.upsert({
    where: { month_source_label: { month, source, label } },
    update: { amountUsd },
    create: { month, source, label, amountUsd },
  });
  await logAudit({
    action: "income.entry.save",
    actor: gate.session?.uid ?? "system",
    target: `${month}/${source}`,
    detail: `income entry ${month} ${source} $${amountUsd}`,
  });
  return NextResponse.json({ entry: { id: row.id, month: row.month, source: row.source, label: row.label, amountUsd: row.amountUsd } }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.incomeEntry.delete({ where: { id } });
  await logAudit({
    action: "income.entry.delete",
    actor: gate.session?.uid ?? "system",
    target: id,
    detail: `removed income entry ${id}`,
  });
  return NextResponse.json({ ok: true });
}
