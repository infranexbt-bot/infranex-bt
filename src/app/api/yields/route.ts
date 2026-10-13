import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth-admin";

// WEALTH-1 — Engine 02 · EARN yield board.
//
// GET /api/yields — stablecoin & DeFi pool APYs sourced from DeFiLlama's
// public yields API (no key required). Server-side 30-minute in-memory cache
// keeps us well inside their fair-use limits while the board stays fresh
// enough for position sizing.
//
// Query params:
//   stablecoin=true|false  (default true) — stablecoin-only pools
//   minTvl=50000000        (default 25M)  — ignore dust pools
//   chain=Ethereum         (optional)     — single-chain filter
//   sort=apy|tvl           (default apy)

export const dynamic = "force-dynamic";

const LLAMA_POOLS_URL = "https://yields.llama.fi/pools";
const CACHE_TTL_MS = 30 * 60 * 1000;

interface LlamaPool {
  pool: string; // DeFiLlama pool UUID (field is named "pool", not "id")
  project: string;
  chain: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  stablecoin?: boolean;
  ilRisk?: string;
  exposure?: string;
}

interface YieldCache {
  at: number;
  pools: LlamaPool[];
}

// Module-level cache — survives across requests in the standalone server
// process; a restart simply triggers one refetch.
let cache: YieldCache | null = null;
let inflight: Promise<LlamaPool[]> | null = null;

async function loadPools(): Promise<LlamaPool[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.pools;
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await fetch(LLAMA_POOLS_URL, {
      // Next's own fetch cache is bypassed; we manage freshness ourselves.
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`defillama ${res.status}`);
    const j = (await res.json()) as { data: LlamaPool[] };
    const pools = Array.isArray(j.data) ? j.data : [];
    cache = { at: Date.now(), pools };
    return pools;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireActiveUser(req);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const sp = req.nextUrl.searchParams;
  const stablecoinOnly = sp.get("stablecoin") !== "false";
  const minTvl = Number(sp.get("minTvl") ?? 25_000_000) || 25_000_000;
  const chain = sp.get("chain")?.trim() || null;
  const sort = sp.get("sort") === "tvl" ? "tvl" : "apy";

  let pools: LlamaPool[];
  let cacheAgeMin: number | null = null;
  try {
    pools = await loadPools();
    if (cache) cacheAgeMin = Math.round((Date.now() - cache.at) / 60_000);
  } catch (e) {
    // Serve stale cache on upstream failure rather than an empty board.
    if (cache) {
      pools = cache.pools;
      cacheAgeMin = Math.round((Date.now() - cache.at) / 60_000);
    } else {
      return NextResponse.json(
        { error: `yield source unavailable: ${e instanceof Error ? e.message : "unknown"}` },
        { status: 502 }
      );
    }
  }

  let rows = pools.filter(
    (p) =>
      p.tvlUsd >= minTvl &&
      p.apy != null &&
      (!stablecoinOnly || p.stablecoin === true) &&
      (!chain || p.chain.toLowerCase() === chain.toLowerCase())
  );
  rows = rows.sort((a, b) => (sort === "tvl" ? b.tvlUsd - a.tvlUsd : (b.apy ?? 0) - (a.apy ?? 0)));

  const top = rows.slice(0, 150).map((p) => ({
    id: p.pool,
    protocol: p.project,
    chain: p.chain,
    symbol: p.symbol,
    tvlUsd: Math.round(p.tvlUsd),
    apy: p.apy != null ? Math.round(p.apy * 100) / 100 : null,
    apyBase: p.apyBase != null ? Math.round(p.apyBase * 100) / 100 : null,
    apyReward: p.apyReward != null ? Math.round(p.apyReward * 100) / 100 : null,
    stablecoin: p.stablecoin ?? false,
    ilRisk: p.ilRisk ?? "unknown",
    exposure: p.exposure ?? "unknown",
  }));

  return NextResponse.json(
    {
      source: "defillama",
      fetchedAt: cache ? new Date(cache.at).toISOString() : null,
      cacheAgeMin,
      totalPoolsScanned: pools.length,
      matching: rows.length,
      pools: top,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
