import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-admin";
import { rateLimit, rateLimitRecord } from "@/lib/infranex/rate-limit";
import { runSweepExclusive } from "@/lib/infranex/gpu-research-live";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/gpu-research/rescan — manual incremental re-scan of the GPU
// audit universe. Without a body it refreshes the batch of subnets whose
// live scrape is oldest (8 per call, sequential raw fetches — polite to
// GitHub and flat on memory). `{ netuid: N }` forces a targeted re-scan.
// The client loops until `done: true`, refetching after every round, so
// the table fills in live while the sweep runs.
export async function POST(req: NextRequest) {
  // overwrites the live scrape layer from GitHub → active-user gated
  const gate = await requireActiveUser(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });
  // Each call scrapes up to 16 repos — cap per session like sync-all.
  const rl = rateLimit(`gpu-rescan:${gate.session.uid}`, 60_000, 30);
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });
  rateLimitRecord(`gpu-rescan:${gate.session.uid}`);

  let netuid: number | undefined;
  try {
    const body = (await req.json()) as { netuid?: number } | null;
    if (body && typeof body.netuid === "number" && Number.isFinite(body.netuid)) {
      netuid = body.netuid;
    }
  } catch {
    // empty body — batch sweep
  }

  const sweep = await runSweepExclusive({ limit: 8, netuid });
  if (!sweep) {
    // Another sweep (auto or another tab) is already running.
    return NextResponse.json({ busy: true }, { status: 202 });
  }

  return NextResponse.json(sweep, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
