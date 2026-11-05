import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-admin";
import {
  computeSubnetStakeOpportunity,
  rankSubnetOpportunities,
  rootBaselineRow,
  type SubnetStakeInputs,
  type SubnetStakeOpportunity,
} from "@/lib/infranex/tao-engine";
import { computeMarketSignal } from "@/lib/infranex/tao-market";
import { loadTaoCloses } from "@/lib/infranex/tao-market-klines";
import { getPrice } from "@/lib/infranex/prices";
import { computeThreeRoutePlan, type PlanRisk } from "@/lib/infranex/tao-engine-plan";
import baselinePayload from "@/lib/infranex/tao-engine-baseline.json";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// GET /api/tao-engine/recommend?stake=100&limit=12&risk=balanced&horizon=90
//
// TAO ENGINE — validator staking recommendations for the user's stake.
// Serves the FROZEN research baseline (tao-engine-baseline.json, refreshed by
// `bun scripts/tao-engine-research.ts`) through the pure engine core. No
// per-request chain reads — the baseline is the honest snapshot; staleness is
// surfaced via baselineFetchedAt / baselineBlock.
//
// Also composes the THREE-ROUTE PLAN (stake / hold / cash allocation) from
// the market signal (tao-market.ts over disk-cached Binance closes) and the
// staking context computed here. Market data failing never fails the route —
// the plan degrades to the conservative no-signal fallback.
//
// Response:
//   root      — root staking baseline row (the floor every pick must beat)
//   beatingRoot[] — subnet opportunities ranked by sustainable APY
//   belowRoot[]   — researched but not root-beating (context rows)
//   summary   — counts + baseline metadata
//   plan      — three-route allocation + horizon scenarios + reasons
//   marketAction/confidence/score — compact echo for the UI planner card
// ---------------------------------------------------------------------------

interface BaselineValidator {
  uid: number; hotkey: string; stakeAlpha: number; captureShare: number; take: number;
}
interface BaselineSubnet {
  netuid: number; name: string | null; poolTao: number; poolAlpha: number;
  alphaSpotTao: number; realizableTao: number | null; laneAlphaPerDay: number;
  laneStakeTao: number;
  validators: BaselineValidator[];
  dilutionRatio: number | null; alphaChange24hPct: number | null;
}

function buildBody(stakeTao: number, limit: number) {
  const subs = (baselinePayload.allResearched ?? baselinePayload.subnets ?? []) as unknown as BaselineSubnet[];
  const opportunities: SubnetStakeOpportunity[] = [];
  for (const raw of subs) {
    if (!Array.isArray(raw.validators) || raw.validators.length === 0) continue;
    const inputs: SubnetStakeInputs = {
      netuid: raw.netuid,
      name: raw.name ?? null,
      poolTao: raw.poolTao,
      poolAlpha: raw.poolAlpha,
      alphaSpotTao: raw.alphaSpotTao,
      realizableTao: raw.realizableTao != null && raw.realizableTao > 0 ? raw.realizableTao : raw.alphaSpotTao,
      laneAlphaPerDay: raw.laneAlphaPerDay,
      laneStakeAlpha:
        raw.laneStakeTao > 0 && raw.alphaSpotTao > 0
          ? raw.laneStakeTao / raw.alphaSpotTao
          : undefined,
      validators: raw.validators.map((v) => ({
        uid: v.uid, hotkey: v.hotkey, stakeAlpha: v.stakeAlpha,
        captureShare: v.captureShare, take: v.take,
      })),
      dilutionRatio: raw.dilutionRatio ?? null,
      alphaChange24hPct: raw.alphaChange24hPct ?? null,
      emissionEnabled: true,
    };
    const rec = computeSubnetStakeOpportunity(inputs, { stakeTao });
    if (rec) opportunities.push(rec);
  }
  const { beatingRoot, belowRoot } = rankSubnetOpportunities(opportunities, { limit });
  const root = rootBaselineRow(stakeTao);
  return {
    stakeTao,
    root,
    beatingRoot,
    belowRoot,
    summary: {
      researchedSubnets: subs.length,
      opportunities: opportunities.length,
      beatingRootCount: opportunities.filter((o) => o.beatsRoot).length,
      baselineFetchedAt: baselinePayload.fetchedAt,
      baselineBlock: baselinePayload.block,
      taoPriceUsd: baselinePayload.taoPriceUsd,
      notes: [
        "Sustainable APY is the headline: the lane-level equilibrium after stake inflow arbitrages outlier yields down. Instant APY (per-validator transient upside) is shown but never ranked.",
        "All figures price α rewards at the subnet's realizable price — what the daily flow actually sells for — never the spot paper price.",
        "Baseline is a frozen chain research pass; re-run `bun scripts/tao-engine-research.ts` to refresh.",
      ],
    },
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const url = req.nextUrl;
  const stakeTao = Math.min(Math.max(Number(url.searchParams.get("stake") ?? 100) || 100, 1), 10_000_000);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 12) || 12, 1), 60);
  const riskParam = url.searchParams.get("risk");
  const risk: PlanRisk = riskParam === "safe" || riskParam === "aggressive" ? riskParam : "balanced";
  const horizon = Math.min(Math.max(Number(url.searchParams.get("horizon") ?? 90) || 90, 7), 3650);

  const body = buildBody(stakeTao, limit);

  // ---- three-route plan (market data optional, never fails the route) ----
  let marketCtx: ReturnType<typeof computeMarketSignal> | null = null;
  try {
    const [{ closes, stale }, spot] = await Promise.all([loadTaoCloses(), getPrice("TAO")]);
    const best = body.beatingRoot[0] ?? null;
    marketCtx = computeMarketSignal({
      closes,
      spotPriceUsd: spot?.price,
      change24hPct: spot?.change24h ?? null,
      topStakeNetApyPct: best ? best.bestApySustainablePct : null,
      rootNetApyPct: body.root.netApyPct,
      stale,
    });
  } catch {
    marketCtx = null;
  }

  const plan = computeThreeRoutePlan({
    stakeTao,
    risk,
    horizonDays: horizon,
    market: marketCtx
      ? {
          action: marketCtx.action,
          confidence: marketCtx.confidence,
          score: marketCtx.score,
          spotUsd: marketCtx.spot.priceUsd > 0 ? marketCtx.spot.priceUsd : null,
          d30Pct: marketCtx.momentum.d30Pct,
          volAnnualizedPct: marketCtx.volatility.annualizedPct,
          fromHigh180Pct: marketCtx.drawdown.fromHigh180Pct,
        }
      : null,
    staking: {
      bestNetApyPct: body.beatingRoot[0]?.bestApySustainablePct ?? null,
      apyLowPct: body.beatingRoot[0]?.bestValidator.apyLowPct ?? null,
      apyHighPct: body.beatingRoot[0]?.bestValidator.apyHighPct ?? null,
      rootNetApyPct: body.root.netApyPct,
      viableCount: body.summary.beatingRootCount,
    },
  });

  return NextResponse.json(
    {
      ...body,
      plan,
      marketAction: marketCtx?.action ?? null,
      marketConfidence: marketCtx?.confidence ?? null,
      marketScore: marketCtx?.score ?? null,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
