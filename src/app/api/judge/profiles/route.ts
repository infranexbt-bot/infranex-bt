import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-admin";
import { getJudgeProfile, listJudgeProfiles } from "@/lib/infranex/judge/service";

export const dynamic = "force-dynamic";

// GET /api/judge/profiles — all persisted profiles
// GET /api/judge/profiles?netuid=8 — single profile (builds on first request)
export async function GET(req: NextRequest) {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check),
  // not just the edge-proxy cookie check.
  const gate = await requireActiveUser(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const netuidParam = req.nextUrl.searchParams.get("netuid");
  try {
    if (netuidParam !== null) {
      const netuid = Number(netuidParam);
      if (!Number.isInteger(netuid) || netuid < 0) {
        return NextResponse.json({ error: "netuid must be a non-negative integer" }, { status: 400 });
      }
      const profile = await getJudgeProfile(netuid);
      return NextResponse.json({ profile });
    }
    const profiles = await listJudgeProfiles();
    return NextResponse.json({ ok: true, profiles });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
