import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUserRequest } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

/**
 * WIN-ODDS-1 — recent seat flips for the "Can I win here?" panel.
 * Reads TriggerEvent rows kind=SEAT_FLIP (committed by win-odds-watch.ts
 * on every devops pass when a subnet's reward spread improves between
 * chain scans). Auth-gated like the other app APIs.
 */

export async function GET(request: Request) {
  const gate = await requireActiveUserRequest(request);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const rows = await db.triggerEvent.findMany({
    where: { kind: "SEAT_FLIP" },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  const flips = rows.map((r) => {
    let from: string | null = null;
    let to: string | null = null;
    try {
      const ev = JSON.parse(r.evidenceJson) as { from?: string; to?: string };
      from = ev.from ?? null;
      to = ev.to ?? null;
    } catch {
      /* legacy rows without structured evidence */
    }
    return {
      id: r.id,
      netuid: r.netuid,
      title: r.title,
      detail: r.detail,
      from,
      to,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ flips });
}
