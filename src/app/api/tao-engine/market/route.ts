import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-admin";
import { computeMarketSignal } from "@/lib/infranex/tao-market";
import { loadTaoCloses } from "@/lib/infranex/tao-market-klines";
import { getPrice } from "@/lib/infranex/prices";
import baselineBundled from "@/lib/infranex/tao-engine-baseline.json";
import { computeTaoEngineOptions } from "@/lib/infranex/tao-engine";
import type { TaoEngineResearchPayload } from "@/lib/infranex/tao-engine-types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET /api/tao-engine/market
//
// MARKET ROUTE — Buy / Hold / Sell signal for TAO itself, composed from:
//   · Binance daily klines (TAOUSDT, 250d) — disk-cached 1h (shared loader
//     in lib/infranex/tao-market-klines.ts) so dev restarts and page
//     refreshes don't hammer the API; stale cache served (flagged) for up
//     to 7d when Binance is unreachable.
//   · Live spot + 24h change via the shared price pipeline.
//   · Yield context from the frozen staking research baseline: the best
//     root-gated sustainable APY vs the root baseline.
//
// Pure math in lib/infranex/tao-market.ts (unit-tested). Mechanical trend
// overlay — not a prediction, not financial advice; the UI must show the
// reasons verbatim so every point of the score is auditable.

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
      loadTaoCloses(),
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
