import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveUserCookies } from "@/lib/auth-admin";
import {
  computeMeta,
  mergeLiveRows,
  maybeAutoSweep,
  isSweepInFlight,
} from "@/lib/infranex/gpu-research-live";

export const dynamic = "force-dynamic";

// GET /api/gpu-research — the Subnet GPU Requirements Research audit with
// its live layer merged in. The seed is the repo-level tarball audit
// (READMEs + min_compute.yml + Docker, auditedAt); every subnet that the
// live scraper has re-verified carries a `live` object (timestamp, model,
// delta vs the seed). When the live layer is stale (>30 min), a bounded
// auto-sweep batch is kicked off fire-and-forget — the page's 60s polling
// keeps driving it forward, replacing the RAM-gated background worker.
export async function GET() {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check).
  const gate = await requireActiveUserCookies();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // Lazy auto-sweep BEFORE reading the DB so a fresh batch lands on the
  // very next poll. Non-blocking: the request returns current data.
  const autoSweepStarted = maybeAutoSweep();

  const overrides = await db.subnetOverride.findMany({
    select: {
      netuid: true,
      recommendedGpu: true,
      gpuCount: true,
      minVramGb: true,
      requirementsSource: true,
      requirementsScrapedAt: true,
    },
  });

  const rows = mergeLiveRows(overrides);
  const meta = computeMeta(rows, isSweepInFlight());

  return NextResponse.json(
    { meta: { ...meta, autoSweepStarted }, rows },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
