// Stop the deployed miner service on this host (safety stop).

import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/lib/auth-admin";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/devops/crypto";
import { stopInstall } from "@/lib/devops/installer";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  // stops the running miner over SSH → admin-gated (AUDIT-SEC-3)
  const gate = await requireActiveAdmin(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { id } = await ctx.params;
  try {
    const host = await db.gpuHost.findUnique({ where: { id } });
    if (!host) return NextResponse.json({ error: "host not found" }, { status: 404 });
    let secret = "";
    try {
      secret = decryptSecret(host.secretEnc);
    } catch {
      return NextResponse.json({ error: "could not decrypt host credentials" }, { status: 500 });
    }
    const res = await stopInstall(host, secret);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "stop failed" },
      { status: 400 }
    );
  }
}
