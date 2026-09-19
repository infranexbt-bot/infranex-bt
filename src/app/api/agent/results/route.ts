import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyHmac } from "@/lib/infranex/daemon-bridge";
import { authAgentRequest, LOCAL_OUTPUT_CAP } from "@/lib/infranex/local-agent";

export const dynamic = "force-dynamic";

const RESULT_STATUSES = new Set(["done", "failed", "timeout"]);

/**
 * POST /api/agent/results — the agent reports a finished command (HMAC-signed).
 * Output is capped again server-side; terminal states only.
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
    commandId?: string;
    status?: string;
    exitCode?: number | null;
    output?: string;
    durationMs?: number;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.commandId || typeof body.commandId !== "string") {
    return NextResponse.json({ error: "missing commandId" }, { status: 400 });
  }
  const status = RESULT_STATUSES.has(body.status ?? "") ? body.status! : "failed";

  const updated = await db.localCommand.updateMany({
    // delivered/running → terminal; a 'queued' command can't be reported on.
    where: {
      id: body.commandId,
      hostId,
      status: { in: ["delivered", "running"] },
    },
    data: {
      status,
      exitCode: typeof body.exitCode === "number" ? body.exitCode : null,
      output: (body.output ?? "").slice(0, LOCAL_OUTPUT_CAP),
      durationMs: typeof body.durationMs === "number" ? Math.min(body.durationMs, 2 ** 31 - 1) : null,
      finishedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    return NextResponse.json(
      { error: "command not in a reportable state (unknown id or wrong host)" },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
