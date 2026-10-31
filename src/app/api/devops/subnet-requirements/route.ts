import { parseNetuid } from "@/lib/infranex/validation";
// Subnet Requirements Profiler API — GET ?netuid=N
// Returns what the subnet needs (GPU, OS packages, python, pip deps, repo,
// entrypoint, miner command) pulled from chain + GitHub. Cached 6h in DB.

import { NextResponse } from "next/server";
import { pullSubnetRequirements } from "@/lib/devops/subnet-requirements";
import { requireActiveUserRequest } from "@/lib/auth-admin";
import { rateLimit, rateLimitRecord } from "@/lib/infranex/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check),
  // not just the edge-proxy cookie check.
  const gate = await requireActiveUserRequest(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const url = new URL(req.url);
  const netuid = parseNetuid(url.searchParams.get("netuid"));
  const refresh = url.searchParams.get("refresh") === "1";
  if (netuid === null)
    return NextResponse.json({ error: "netuid must be an integer between 0 and 1023" }, { status: 400 });
  // AUDIT-SEC-4: only cache-bypassing refreshes are throttled — regular
  // reads hit the 6h DB cache and stay cheap.
  if (refresh) {
    const rl = rateLimit(`req-refresh:${gate.session.uid}`, 10_000, 200);
    if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });
    rateLimitRecord(`req-refresh:${gate.session.uid}`);
  }

  try {
    const { profile, cached } = await pullSubnetRequirements(netuid, { refresh });
    return NextResponse.json({ profile, cached });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "profiler failed" },
      { status: 500 }
    );
  }
}
