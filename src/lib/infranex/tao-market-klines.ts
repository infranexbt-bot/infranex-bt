// ---------------------------------------------------------------------------
// TAO MARKET KLINES — shared daily-close loader for the market signal and the
// three-route planner.
//
// Binance daily klines (TAOUSDT, 250d) — disk-cached 1h so dev restarts and
// page refreshes don't hammer the API; a stale cache is served (flagged) for
// up to 7d when Binance is unreachable.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from "fs";
import path from "path";

const KLINES_URL =
  "https://api.binance.com/api/v3/klines?symbol=TAOUSDT&interval=1d&limit=250";
const FRESH_TTL_MS = 60 * 60 * 1000; // 1h
const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d

export interface TaoCloses {
  closes: number[];
  stale: boolean;
  fetchedAt: string;
}

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

export async function loadTaoCloses(): Promise<TaoCloses> {
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
