import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUserCookies } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

// GET /api/subnet-overrides — list all user overrides
export async function GET() {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check),
  // not just the edge-proxy cookie check.
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const overrides = await db.subnetOverride.findMany();
  return NextResponse.json({ overrides });
}
