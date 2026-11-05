import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-admin";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { computeMarketSignal } from "@/lib/infranex/tao-market";
import { getPrice } from "@/lib/infranex/prices";
import baselineBundled from "@/lib/infranex/tao-engine-baseline.json";
import { computeTaoEngineOptions } from "@/lib/infranex/tao-engine";
import type { TaoEngineResearchPayload } from "@/lib/infranex/tao-engine-types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/tao-engine/market
//
// MARKET ROUTE — Buy / Hold / Sell signal for TAO itself, composed from:
//   · Binance daily klines (TAOUSDT, 250d) — disk-cached 1h so dev restarts
//     and page refreshes don't hammer the API; stale cache served (flagged)
//     for up to 7d when Binance is unreachable.
//   · Live spot + 24h change via the shared price pipeline.
//   · Yield context from the frozen staking research baseline: the best
//     root-gated sustainable APY vs the root baseline.
//
// Pure math in lib/infranex/tao-market.ts (unit-tested). Mechanical trend
// overlay — not a prediction, not financial advice; the UI must show the
// reasons verbatim so every point of the score is auditable.

const KLINES_URL =
  "https://api.binance.com/api/v3/klines?symbol=TAOUSDT&interval=1d&limit=250";
const FRESH_TTL_MS = 60 * 60 * 1000; // 1h
const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d

interface KlineCache {
  fetchedAt: string;
  closes: number[];
}

function cachePath(): string {
  return path.join(process.cwd(), ".tao-market-klines.json");
}

function readCache(): KlineCache | null {
  try {
    const j = JSON.parse(readFileSync(cachePath(), "utf8")) as KlineCache;
    if (!Array.isArray(j.closes) || j.closes.length < 2) return null;
    return j;
  } catch {
    return null;
  }
}

function writeCache(closes: number[]): void {
  try {
    writeFileSync(
      cachePath(),
      JSON.stringify({ fetchedAt: new Date().toISOString(), closes } satisfies KlineCache)
    );
  } catch {
    // Disk failures must never break the signal — memory-only this request.
  }
}

async function loadCloses(): Promise<{ closes: number[]; stale: boolean; fetchedAt: string }> {
  const cached = readCache();
  const age = cached ? Date.now() - new Date(cached.fetchedAt).getTime() : Infinity;

  if (cached && age < FRESH_TTL_MS) return { closes: cached.closes, stale: false, fetchedAt: cached.fetchedAt };

  try {
    const res = await fetch(KLINES_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`binance klines ${res.status}`);
    const rows = (await res.json()) as unknown[];
    const closes = rows
      .map((r) => Number((r as unknown[])[4])) // close price column
      .filter((c) => Number.isFinite(c) && c > 0);
    if (closes.length < 30) throw new Error("binance klines too short");
    writeCache(closes);
    return { closes, stale: false, fetchedAt: new Date().toISOString() };
  } catch {
    // Upstream failed: stale cache beats no signal, 7d limit.
    if (cached && age < STALE_TTL_MS)
      return { closes: cached.closes, stale: true, fetchedAt: cached.fetchedAt };
    throw new Error("No TAO price history available (Binance unreachable, no usable cache)");
  }
}

function loadYieldContext(): { topStakeNetApyPct: number | null; rootNetApyPct: number } {
  try {
    const payload = baselineBundled as unknown as TaoEngineResearchPayload;
    const opts = computeTaoEngineOptions(payload, {
      stakeTao: payload.referenceStakeTao ?? 100,
      maxOptions: 5,
      riskTolerance: "any",
    });
    const best = opts.find((o) => o.beatsRoot) ?? null;
    const root = payload.rootBaseline?.netApyPct ?? 4.3;
    return { topStakeNetApyPct: best ? best.sustainableApyPct : null, rootNetApyPct: root };
  } catch {
    return { topStakeNetApyPct: null, rootNetApyPct: 4.3 };
  }
}

export async function GET(_req: NextRequest) {
  // AUDIT-SEC-2: DB-backed session gate (revocation + active check).
  const gate = await requireActiveUser(_req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const [{ closes, stale, fetchedAt }, spot, yieldCtx] = await Promise.all([
      loadCloses(),
      getPrice("TAO"),
      Promise.resolve(loadYieldContext()),
    ]);

    const signal = computeMarketSignal({
      closes,
      spotPriceUsd: spot?.price,
      change24hPct: spot?.change24h ?? null,
      topStakeNetApyPct: yieldCtx.topStakeNetApyPct,
      rootNetApyPct: yieldCtx.rootNetApyPct,
      stale: stale || Boolean(spot && Date.now() - new Date(spot.fetchedAt).getTime() > 24 * 60 * 60 * 1000),
    });

    return NextResponse.json({
      signal,
      dataSources: {
        klinesFetchedAt: fetchedAt,
        klinesDays: closes.length,
        klinesStale: stale,
        spotSource: spot?.source ?? null,
        spotFetchedAt: spot?.fetchedAt ?? null,
        baselineBlock: (baselineBundled as unknown as TaoEngineResearchPayload).block,
      },
      disclaimer:
        "Mechanical trend overlay on daily closes — not a prediction and not financial advice. Score components and reasons are shown so every point is auditable.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "market route failed" },
      { status: 503 }
    );
  }
}
