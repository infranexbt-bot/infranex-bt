import { NextRequest, NextResponse } from "next/server";
import {
  completeEnrollment,
  verifyEnrollmentToken,
  type LocalHostSpecs,
} from "@/lib/infranex/local-agent";
import { AGENT_VERSION } from "@/lib/infranex/agent-src";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/enroll — called ONCE from the laptop with the one-time
 * enrollment token. Exchanges it for the per-host agent secret (returned
 * exactly once; only the AES-256-GCM ciphertext is stored) and records the
 * machine's static specs.
 */
export async function POST(req: NextRequest) {
  let body: { token?: string; specs?: LocalHostSpecs; version?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ error: "missing enrollment token" }, { status: 400 });

  const host = await verifyEnrollmentToken(token);
  if (!host) {
    return NextResponse.json(
      { error: "invalid, expired or already-used enrollment token — create a new one in the app" },
      { status: 401 }
    );
  }

  const specs: LocalHostSpecs = body.specs && typeof body.specs === "object" ? body.specs : {};
  const version = typeof body.version === "string" ? body.version.slice(0, 32) : AGENT_VERSION;
  const { host: updated, secret } = await completeEnrollment(host.id, specs, version);

  return NextResponse.json({
    ok: true,
    hostId: updated.id,
    name: updated.name,
    secret,
    pollSeconds: 15,
  });
}
