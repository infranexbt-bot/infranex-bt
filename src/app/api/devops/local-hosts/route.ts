import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUser } from "@/lib/auth-admin";
import { createEnrollment } from "@/lib/infranex/local-agent";

export const dynamic = "force-dynamic";

/**
 * GET /api/devops/local-hosts — list local machines (laptops) with their
 * latest commands, for the DevOps "local machines" card. Session-gated.
 */
export async function GET(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const hosts = await db.localHost.findMany({
    orderBy: { createdAt: "asc" },
  });
  const commands = await db.localCommand.findMany({
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const byHost = new Map<string, typeof commands>();
  for (const c of commands) {
    const list = byHost.get(c.hostId) ?? [];
    if (list.length < 8) list.push(c);
    byHost.set(c.hostId, list);
  }

  return NextResponse.json({
    hosts: hosts.map((h) => ({
      id: h.id,
      name: h.name,
      status: h.status,
      specs: h.specsJson ? JSON.parse(h.specsJson) : null,
      telemetry: h.telemetryJson ? JSON.parse(h.telemetryJson) : null,
      version: h.version,
      lastSeenAt: h.lastSeenAt?.toISOString() ?? null,
      enrollExpiresAt: h.enrollExpiresAt?.toISOString() ?? null,
      createdAt: h.createdAt.toISOString(),
      commands: (byHost.get(h.id) ?? []).map((c) => ({
        id: c.id,
        netuid: c.netuid,
        phase: c.phase,
        command: c.command,
        status: c.status,
        exitCode: c.exitCode,
        output: c.output,
        durationMs: c.durationMs,
        createdAt: c.createdAt.toISOString(),
        finishedAt: c.finishedAt?.toISOString() ?? null,
      })),
    })),
  });
}

/**
 * POST /api/devops/local-hosts — create a pending local machine + one-time
 * enrollment token. The raw token is returned ONCE (the UI bakes it into
 * the copy-paste command); only its sha256 is stored.
 */
export async function POST(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const name = (typeof body.name === "string" ? body.name.trim() : "") || "my-laptop";
  const { host, token } = await createEnrollment(name);

  return NextResponse.json({
    ok: true,
    host: {
      id: host.id,
      name: host.name,
      status: host.status,
      enrollExpiresAt: host.enrollExpiresAt?.toISOString() ?? null,
    },
    // Shown once — the UI composes the copy-paste enroll command with it.
    enrollToken: token,
  });
}
