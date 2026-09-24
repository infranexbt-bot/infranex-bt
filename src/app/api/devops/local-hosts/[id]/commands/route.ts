import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveAdmin } from "@/lib/auth-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/devops/local-hosts/[id]/commands — queue a shell command for
 * the local agent to pull and execute (session-gated; the agent executes
 * the operator's own queued commands — see LOCALHOST-1 trust boundary).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  // AUDIT-SEC-1: only admins may queue shell commands for the local
  // agent — arbitrary command execution must never be reachable by
  // viewer/analyst roles.
  const gate = await requireActiveAdmin(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await ctx.params;
  const host = await db.localHost.findUnique({ where: { id } });
  if (!host || host.status === "revoked") {
    return NextResponse.json({ error: "local host not found" }, { status: 404 });
  }
  if (host.status !== "online") {
    return NextResponse.json(
      { error: `host is ${host.status} — it must complete enrollment and heartbeat once before accepting commands` },
      { status: 409 }
    );
  }

  let body: { command?: string; netuid?: number; phase?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const command = (typeof body.command === "string" ? body.command : "").trim();
  if (!command || command.length > 4000) {
    return NextResponse.json({ error: "command must be 1-4000 chars" }, { status: 400 });
  }
  const netuid =
    typeof body.netuid === "number" && Number.isInteger(body.netuid) && body.netuid >= 0
      ? body.netuid
      : null;

  const created = await db.localCommand.create({
    data: {
      hostId: id,
      command,
      netuid,
      phase: typeof body.phase === "string" ? body.phase.slice(0, 32) : null,
    },
  });

  return NextResponse.json({
    ok: true,
    command: {
      id: created.id,
      command: created.command,
      status: created.status,
      netuid: created.netuid,
      phase: created.phase,
      createdAt: created.createdAt.toISOString(),
    },
  });
}
