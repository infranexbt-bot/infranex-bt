// WEALTH-3/4 shared price pipeline — key-free public sources only.
//
// Primary : Binance /api/v3/ticker/24hr batch — price + 24h change in one
//           request, generous public limits, fast.
// Fallback: CoinGecko simple/price for symbols without a Binance USDT pair
//           (curated id map, plus a cached search lookup for the long tail).
//
// Module-level 5-minute cache per symbol. On upstream failure (Binance geo/
// rate hiccups, CoinGecko 429s) we serve the last known tick for up to 24h
// and flag it stale instead of blanking the UI — a stale number labelled as
// such beats "—" in a decision tool.

export interface PriceTick {
  symbol: string; // canonical upper, e.g. "TAO"
  price: number;
  change24h: number | null; // percent
  source: "binance" | "coingecko";
  fetchedAt: string;
}

export interface PricesResult {
  prices: Record<string, PriceTick>;
  staleSymbols: string[]; // served from cache beyond TTL
  sources: { binance: boolean; coingecko: boolean };
}

const FRESH_TTL_MS = 5 * 60 * 1000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SYMBOLS = 40;

const cache = new Map<string, { tick: PriceTick; at: number }>();

// Curated CoinGecko ids for assets that commonly miss on Binance or whose
// ticker differs. Learned ids from search are added at runtime.
const CG_IDS: Record<string, string> = {
  TAO: "bittensor",
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  NEAR: "near",
  ARB: "arbitrum",
  OP: "optimism",
  SUI: "sui",
  INJ: "injective-protocol",
  FET: "artificial-superintelligence-alliance",
  RNDR: "render-token",
  RENDER: "render-token",
  TIA: "celestia",
  ICP: "internet-computer",
  GRT: "the-graph",
  AKT: "akash-network",
  IO: "io-netty",
  NOUS: "nous-protocol",
  HYPE: "hyperliquid",
  LINK: "chainlink",
  AAVE: "aave",
  DOGE: "dogecoin",
  LTC: "litecoin",
  ADA: "cardano",
  XRP: "ripple",
  CRV: "curve-dao-token",
  LDO: "lido-dao",
  PYTH: "pyth-network",
  WLD: "worldcoin-wld",
  VIRTUAL: "virtual-protocol",
  AI16Z: "ai16z",
  GRASS: "grass",
};

function norm(symbols: string[]): string[] {
  const out = new Set<string>();
  for (const s of symbols) {
    const up = String(s || "").trim().toUpperCase();
    // Allow "TAO-USDT" / "TAOUSDT" style inputs from trade journal entries.
    const clean = up.replace(/-?USDT$/, "");
    if (clean && /^[A-Z0-9]{1,20}$/.test(clean)) out.add(clean);
    if (out.size >= MAX_SYMBOLS) break;
  }
  return [...out];
}

async function binanceBatch(pairs: string[]): Promise<Map<string, PriceTick>> {
  const out = new Map<string, PriceTick>();
  if (pairs.length === 0) return out;
  const url =
    "https://api.binance.com/api/v3/ticker/24hr?symbols=" +
    encodeURIComponent(JSON.stringify(pairs));
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const rows = (await res.json()) as {
    symbol: string;
    lastPrice: string;
    priceChangePercent: string;
  }[];
  const at = new Date().toISOString();
  for (const r of rows) {
    const price = Number(r.lastPrice);
    if (!Number.isFinite(price) || price <= 0) continue;
    const sym = r.symbol.replace(/USDT$/, "");
    const tick: PriceTick = {
      symbol: sym,
      price,
      change24h: Number(r.priceChangePercent),
      source: "binance",
      fetchedAt: at,
    };
    out.set(sym, tick);
    cache.set(sym, { tick, at: Date.now() });
  }
  return out;
}

async function coingeckoSimple(ids: string[]): Promise<Map<string, PriceTick>> {
  const out = new Map<string, PriceTick>();
  if (ids.length === 0) return out;
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=" +
    encodeURIComponent(ids.join(",")) +
    "&vs_currencies=usd&include_24hr_change=true";
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const j = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
  const at = new Date().toISOString();
  const byId = new Map<string, string>();
  for (const [sym, id] of Object.entries(CG_IDS)) byId.set(id, sym);
  for (const [id, v] of Object.entries(j)) {
    if (typeof v.usd !== "number" || v.usd <= 0) continue;
    const sym = (byId.get(id) ?? id).toUpperCase();
    const tick: PriceTick = {
      symbol: sym,
      price: v.usd,
      change24h: typeof v.usd_24h_change === "number" ? v.usd_24h_change : null,
      source: "coingecko",
      fetchedAt: at,
    };
    out.set(sym, tick);
    cache.set(sym, { tick, at: Date.now() });
  }
  return out;
}

/**
 * Best-effort price lookup for a batch of symbols. Never throws — symbols we
 * cannot resolve (now or from a <24h-old cache) are simply absent.
 */
export async function getPrices(input: string[]): Promise<PricesResult> {
  const symbols = norm(input);
  const prices: Record<string, PriceTick> = {};
  const staleSymbols: string[] = [];

  const missing: string[] = [];
  const now = Date.now();
  for (const s of symbols) {
    const c = cache.get(s);
    if (c && now - c.at < FRESH_TTL_MS) prices[s] = c.tick;
    else missing.push(s);
  }

  const sources = { binance: false, coingecko: false };

  if (missing.length) {
    // 1) Binance batch on the XXUSDT pairs.
    try {
      const got = await binanceBatch(missing.map((s) => `${s}USDT`));
      sources.binance = got.size > 0;
      for (const [s, t] of got) prices[s] = t;
    } catch {
      // One bad pair 400s the whole batch — fall through to CoinGecko and
      // (below) a per-symbol Binance retry for the survivors.
    }

    // 2) Per-symbol Binance retry for anything the batch missed (covers the
    //    "one invalid symbol kills the batch" case without pre-knowing the
    //    pair list).
    const stillMissing = symbols.filter((s) => !prices[s]);
    if (stillMissing.length && stillMissing.length <= 25) {
      const results = await Promise.allSettled(
        stillMissing.map((s) => binanceBatch([`${s}USDT`]))
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.size > 0) {
          sources.binance = true;
          for (const [s, t] of r.value) prices[s] = t;
        }
      }
    }

    // 3) CoinGecko fallback for the remainder (curated ids only — search
    //    lookups are too rate-limited to be reliable; unknowns stay absent).
    const remainder = symbols.filter((s) => !prices[s]);
    const cgIds = [...new Set(remainder.map((s) => CG_IDS[s]).filter(Boolean))];
    if (cgIds.length) {
      try {
        const got = await coingeckoSimple(cgIds);
        sources.coingecko = got.size > 0;
        for (const [s, t] of got) prices[s] = t;
      } catch {
        // 429s are routine on the public tier — stale-serve below.
      }
    }
  }

  // 4) Stale-serve whatever is still unresolved and younger than 24h.
  for (const s of symbols) {
    if (prices[s]) continue;
    const c = cache.get(s);
    if (c && now - c.at < STALE_TTL_MS) {
      prices[s] = c.tick;
      staleSymbols.push(s);
    }
  }

  return { prices, staleSymbols, sources };
}

/** Single-symbol convenience for AI context builders (best-effort, null-safe). */
export async function getPrice(symbol: string): Promise<PriceTick | null> {
  const { prices } = await getPrices([symbol]);
  return prices[symbol.trim().toUpperCase()] ?? null;
}


