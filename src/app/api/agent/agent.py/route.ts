import { NextResponse } from "next/server";
import { AGENT_PY, AGENT_VERSION } from "@/lib/infranex/agent-src";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/agent.py — serve the local-machine agent source (stdlib
 * Python, no secrets inside). The UI's one-liner downloads this onto the
 * laptop. Cache-busting via ?v= is unnecessary (dynamic).
 */
export async function GET() {
  return new NextResponse(AGENT_PY, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `inline; filename="infranex-agent-${AGENT_VERSION}.py"`,
      "Cache-Control": "no-store",
    },
  });
}
