import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyHmac } from "@/lib/infranex/daemon-bridge";
import { authAgentRequest, LOCAL_HOST_TELEMETRY_CAP } from "@/lib/infranex/local-agent";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/heartbeat — the local agent dials OUT from the laptop
 * (HMAC-signed, same scheme as the node daemon) with specs + telemetry and
 * receives its queued commands. Delivered commands are marked in one txn.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const ts = req.headers.get("x-infranex-timestamp") ?? "";
  const sig = req.headers.get("x-infranex-signature") ?? "";
  const hostId = req.headers.get("x-infranex-host") ?? "";

  const v = await authAgentRequest(hostId, ts, req.nextUrl.pathname, raw, sig, verifyHmac);
  if (!v.ok) {
    return NextResponse.json({ error: v.error ?? "unauthorized" }, { status: 401 });
  }

  let body: {
    specs?: unknown;
    telemetry?: unknown;
    version?: string;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const specsJson =
    body.specs && typeof body.specs === "object" ? JSON.stringify(body.specs) : undefined;
  const telemetryJson =
    body.telemetry && typeof body.telemetry === "object"
      ? JSON.stringify(body.telemetry).slice(0, LOCAL_HOST_TELEMETRY_CAP)
      : undefined;

  // Atomically: refresh heartbeat fields, then hand out up to 5 queued
  // commands (oldest first) and mark them delivered.
  const commands = await db.$transaction(async (tx) => {
    await tx.localHost.update({
      where: { id: hostId },
      data: {
        lastSeenAt: new Date(),
        status: "online",
        ...(specsJson ? { specsJson } : {}),
        ...(telemetryJson ? { telemetryJson } : {}),
        ...(typeof body.version === "string" ? { version: body.version.slice(0, 32) } : {}),
      },
    });
    const queued = await tx.localCommand.findMany({
      where: { hostId, status: "queued" },
      orderBy: { createdAt: "asc" },
      take: 5,
    });
    if (queued.length > 0) {
      await tx.localCommand.updateMany({
        where: { id: { in: queued.map((c) => c.id) } },
        data: { status: "delivered", deliveredAt: new Date() },
      });
    }
    return queued.map((c) => ({
      id: c.id,
      command: c.command,
      netuid: c.netuid,
      phase: c.phase,
    }));
  });

  return NextResponse.json({ ok: true, commands });
}
