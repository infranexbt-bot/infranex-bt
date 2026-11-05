import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-admin";
import { readFileSync } from "fs";
import path from "path";
import baselineBundled from "@/lib/infranex/tao-engine-baseline.json";
import {
  computeTaoEngineOptions,
  summarizeTaoEngine,
  rootBaselineRow,
} from "@/lib/infranex/tao-engine";
import type { TaoEngineResearchPayload } from "@/lib/infranex/tao-engine-types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/tao-engine?stakeTao=100&risk=safe&limit=12
//
// TAO ENGINE — ranked validator-staking picks over the frozen research
// baseline (scripts/tao-engine-research.ts → tao-engine-baseline.json).
//
//   stakeTao  — the user's stake in TAO (0..1_000_000, default 100). Drives
//               entry-α, exit slippage and TAO/day economics per option.
//   risk      — "any" (default) | "safe" (drops SPECULATIVE/AVOID picks).
//   limit     — max options returned (1..100, default 12).
//
// The baseline is read from disk at request time so a research refresh
// (rerun the script, no rebuild) flows straight through; the bundled copy
// is the fallback. Response includes staleness metadata — the UI must show
// it: these are research snapshots, not live promises.

function loadBaseline(): TaoEngineResearchPayload {
  try {
    const p = path.join(process.cwd(), "src/lib/infranex/tao-engine-baseline.json");
    return JSON.parse(readFileSync(p, "utf8")) as TaoEngineResearchPayload;
  } catch {
    return baselineBundled as unknown as TaoEngineResearchPayload;
  }
}

export async function GET(req: NextRequest) {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check).
  const gate = await requireActiveUser(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const url = req.nextUrl.searchParams;
  const stakeRaw = Number(url.get("stakeTao") ?? "100");
  const stakeTao = Number.isFinite(stakeRaw) ? Math.max(0, Math.min(stakeRaw, 1_000_000)) : 100;
  const risk = url.get("risk") === "safe" ? "safe" : "any";
  const limitRaw = Number(url.get("limit") ?? "12");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(Math.round(limitRaw), 100)) : 12;

  const payload = loadBaseline();
  if (!payload || payload.model !== "tao-engine-research-v2") {
    return NextResponse.json(
      { error: "TAO engine baseline unavailable or stale-schema — rerun scripts/tao-engine-research.ts" },
      { status: 503 }
    );
  }

  const options = computeTaoEngineOptions(payload, { stakeTao, maxOptions: limit, riskTolerance: risk });
  const summary = summarizeTaoEngine(payload, stakeTao);
  const root = rootBaselineRow(stakeTao);

  return NextResponse.json({
    summary,
    root,
    options,
    baseline: {
      model: payload.model,
      fetchedAt: payload.fetchedAt,
      block: payload.block,
      taoPriceUsd: payload.taoPriceUsd,
      referenceStakeTao: payload.referenceStakeTao,
    },
  });
}
