// WEALTH-4 — Engine 03 · CAPTURE funding-rate scanner source.
//
// Hyperliquid's public /info endpoint (no key) exposes per-asset perpetual
// contexts: hourly funding, open interest, mark / prev-day price, volume.
// We annualize the hourly funding rate (×24×365) and rank by |annualized|
// so the scanner surfaces where carry is richest. Interpretation:
//   funding > 0 → longs pay shorts  → short side collects carry
//   funding < 0 → shorts pay longs  → long side collects carry
//
// 10-minute module cache; stale-serve on upstream failure.

const HL_INFO_URL = "https://api.hyperliquid.xyz/info";
const CACHE_TTL_MS = 10 * 60 * 1000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000;

export interface FundingRow {
  asset: string;
  markPx: number | null;
  change24hPct: number | null;
  funding1hPct: number; // hourly rate in %
  fundingAnnualPct: number; // annualized, = 1h × 24 × 365 × 100
  carrySide: "short" | "long"; // which side collects the funding
  openInterestCoins: number | null;
  openInterestUsd: number | null;
  dayVolumeUsd: number | null;
}

export interface FundingSnapshot {
  rows: FundingRow[];
  fetchedAt: string;
  universeCount: number;
  stale: boolean;
}

let cache: { snap: FundingSnapshot; at: number } | null = null;
let inflight: Promise<FundingSnapshot> | null = null;

function buildSnapshot(payload: unknown): FundingSnapshot {
  const [meta, ctxs] = payload as [
    { universe: { name: string; isDelisted?: boolean }[] },
    Record<string, string>[],
  ];
  const universe = meta?.universe ?? [];
  const rows: FundingRow[] = [];
  for (let i = 0; i < universe.length; i++) {
    const u = universe[i];
    const c = ctxs?.[i];
    if (!u || !c || u.isDelisted) continue;
    const funding1h = Number(c.funding);
    const markPx = Number(c.markPx);
    const prevDayPx = Number(c.prevDayPx);
    const oi = Number(c.openInterest);
    const vol = Number(c.dayNtlVlm);
    if (!Number.isFinite(funding1h)) continue;
    rows.push({
      asset: u.name,
      markPx: Number.isFinite(markPx) && markPx > 0 ? markPx : null,
      change24hPct:
        Number.isFinite(markPx) && Number.isFinite(prevDayPx) && prevDayPx > 0
          ? ((markPx - prevDayPx) / prevDayPx) * 100
          : null,
      funding1hPct: funding1h * 100,
      fundingAnnualPct: funding1h * 24 * 365 * 100,
      carrySide: funding1h >= 0 ? "short" : "long",
      openInterestCoins: Number.isFinite(oi) ? oi : null,
      openInterestUsd: Number.isFinite(oi) && Number.isFinite(markPx) ? oi * markPx : null,
      dayVolumeUsd: Number.isFinite(vol) ? vol : null,
    });
  }
  rows.sort((a, b) => Math.abs(b.fundingAnnualPct) - Math.abs(a.fundingAnnualPct));
  return {
    rows,
    fetchedAt: new Date().toISOString(),
    universeCount: universe.length,
    stale: false,
  };
}

export async function loadFunding(): Promise<FundingSnapshot> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.snap;
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await fetch(HL_INFO_URL, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`hyperliquid ${res.status}`);
    const snap = buildSnapshot(await res.json());
    cache = { snap, at: Date.now() };
    return snap;
  })();

  try {
    return await inflight;
  } catch (e) {
    // Serve stale on failure — a decision tool prefers old data labelled old.
    if (cache && Date.now() - cache.at < STALE_TTL_MS) {
      return { ...cache.snap, stale: true };
    }
    throw e;
  } finally {
    inflight = null;
  }
}
