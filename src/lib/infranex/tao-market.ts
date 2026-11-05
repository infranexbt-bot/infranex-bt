// ---------------------------------------------------------------------------
// TAO MARKET ROUTE — Buy / Hold / Sell signal over TAO's own price.
//
// The staking engine answers "where do I earn the most TAO?"; this module
// answers the position question the owner also asked for: "should I BUY,
// HOLD, REDUCE or SELL right now?" Pure math, no network — the API route
// feeds it daily closes (Binance klines, disk-cached) and the staking
// engine's yield context.
//
// Score components (each bounded, all additive, documented so the UI can
// show its work — no black box):
//   trend     [-50,+50]  price vs SMA50/SMA200, SMA50 vs SMA200
//   momentum  [-25,+25]  30d and 7d returns, clipped
//   drawdown  [-10,+15]  contrarian entry bonus vs 180d high (accumulators
//                        buy drawdowns; near-high trims)
//   yieldEdge [-5,+10]   top staking net APY over root — staking cushions
//                         downside and supports HOLD
//   total     [-90,+100]
//
// Action map:  ≥+25 BUY · 0..+25 HOLD · −25..0 REDUCE · <−25 SELL
// Confidence:  high = |score| ≥ 40 with ≥150 days · medium ≥ 18 · else low.
//
// Honest limits baked in: this is a mechanical trend overlay, NOT a
// prediction; vol is reported for sizing, never part of the score; <30
// days of history degrades to HOLD/low with an explicit reason.
// ---------------------------------------------------------------------------

export interface TaoMarketTrend {
  sma50: number | null;
  sma200: number | null;
  priceVsSma50Pct: number | null;
  priceVsSma200Pct: number | null;
  goldenCross: boolean | null;
}

export interface TaoMarketMomentum {
  d7Pct: number | null;
  d30Pct: number | null;
  d90Pct: number | null;
}

export interface TaoMarketDrawdown {
  high180Usd: number | null;
  fromHigh180Pct: number | null;
  low180Usd: number | null;
}

export interface TaoMarketVolatility {
  annualizedPct: number | null;
}

export interface TaoMarketYieldContext {
  topStakeNetApyPct: number | null;
  rootNetApyPct: number | null;
  edgePct: number | null;
}

export type TaoMarketAction = "BUY" | "HOLD" | "REDUCE" | "SELL";
export type TaoMarketConfidence = "low" | "medium" | "high";

export interface TaoMarketSignal {
  action: TaoMarketAction;
  /** Composite score in [-90, +100]. */
  score: number;
  confidence: TaoMarketConfidence;
  components: {
    trend: number;
    momentum: number;
    drawdown: number;
    yieldEdge: number;
  };
  spot: {
    priceUsd: number;
    change24hPct: number | null;
  };
  trend: TaoMarketTrend;
  momentum: TaoMarketMomentum;
  drawdown: TaoMarketDrawdown;
  volatility: TaoMarketVolatility;
  yieldContext: TaoMarketYieldContext;
  /** Days of daily closes used. */
  historyDays: number;
  /** Whether the underlying candles were served from a stale cache. */
  stale: boolean;
  /** Human-readable reasons — the UI shows these verbatim. */
  reasons: string[];
  /** What the action means for a staked position. */
  playbook: string;
}

export interface TaoMarketSignalInput {
  /** Daily closing prices, oldest → newest. At least 2 entries. */
  closes: number[];
  /** Latest spot tick (overrides the last close for "current price"). */
  spotPriceUsd?: number;
  change24hPct?: number | null;
  /** Best root-gated staking net APY (from the TAO engine baseline). */
  topStakeNetApyPct?: number | null;
  /** Root staking net APY (the benchmark). */
  rootNetApyPct?: number | null;
  stale?: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function sma(closes: number[], window: number): number | null {
  if (window <= 0 || closes.length < window) return null;
  let sum = 0;
  for (let i = closes.length - window; i < closes.length; i++) sum += closes[i];
  return sum / window;
}

export function annualizedVolPct(closes: number[], days = 30): number | null {
  if (closes.length < days + 1) return null;
  const rets: number[] = [];
  for (let i = closes.length - days; i < closes.length; i++) {
    const prev = closes[i - 1];
    if (!(prev > 0) || !(closes[i] > 0)) continue;
    rets.push(Math.log(closes[i] / prev));
  }
  if (rets.length < 10) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance =
    rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(365) * 100;
}

function drawdownComponent(fromHighPct: number, d30Pct: number | null): { score: number; reason: string } {
  if (fromHighPct <= -60)
    return { score: 15, reason: `deep drawdown ${fromHighPct.toFixed(0)}% from 180d high — accumulation territory` };
  if (fromHighPct <= -40)
    return { score: 12, reason: `drawdown ${fromHighPct.toFixed(0)}% from 180d high — attractive entry zone` };
  if (fromHighPct <= -20)
    return { score: 6, reason: `moderate drawdown ${fromHighPct.toFixed(0)}% from 180d high` };
  if (fromHighPct <= -5)
    return { score: 0, reason: `price within ${Math.abs(fromHighPct).toFixed(0)}% of the 180d high — neutral entry` };
  // At/above the high: only a trim risk if the price actually RAN UP recently.
  if (d30Pct != null && d30Pct > 10)
    return {
      score: -10,
      reason: `price at the 180d high after a +${d30Pct.toFixed(0)}% 30d run — extended, trim risk on entries`,
    };
  return { score: 0, reason: "price at the 180d high with no recent run-up — neutral entry" };
}

function yieldEdgeComponent(edgePct: number): { score: number; reason: string } {
  if (edgePct >= 6)
    return { score: 10, reason: `staking edge ${edgePct.toFixed(1)}% over root — yield cushions downside, supports accumulating` };
  if (edgePct >= 3)
    return { score: 7, reason: `staking edge ${edgePct.toFixed(1)}% over root — decent yield support` };
  if (edgePct > 0)
    return { score: 4, reason: `staking edge ${edgePct.toFixed(1)}% over root — thin yield support` };
  return { score: -5, reason: `subnet staking does not beat root (${edgePct.toFixed(1)}%) — no yield reason to hold α exposure` };
}

export function computeMarketSignal(input: TaoMarketSignalInput): TaoMarketSignal {
  const closes = (input.closes ?? []).filter((c) => Number.isFinite(c) && c > 0);
  const spot = input.spotPriceUsd ?? closes[closes.length - 1];
  const reasons: string[] = [];

  // Degenerate history → honest HOLD/low, never a fake signal.
  if (!(spot > 0) || closes.length < 30) {
    return {
      action: "HOLD",
      score: 0,
      confidence: "low",
      components: { trend: 0, momentum: 0, drawdown: 0, yieldEdge: 0 },
      spot: { priceUsd: spot > 0 ? spot : 0, change24hPct: input.change24hPct ?? null },
      trend: { sma50: null, sma200: null, priceVsSma50Pct: null, priceVsSma200Pct: null, goldenCross: null },
      momentum: { d7Pct: null, d30Pct: null, d90Pct: null },
      drawdown: { high180Usd: null, fromHigh180Pct: null, low180Usd: null },
      volatility: { annualizedPct: null },
      yieldContext: {
        topStakeNetApyPct: input.topStakeNetApyPct ?? null,
        rootNetApyPct: input.rootNetApyPct ?? null,
        edgePct:
          input.topStakeNetApyPct != null && input.rootNetApyPct != null
            ? input.topStakeNetApyPct - input.rootNetApyPct
            : null,
      },
      historyDays: closes.length,
      stale: Boolean(input.stale),
      reasons: [
        closes.length < 30
          ? `only ${closes.length} days of history — signal degraded to HOLD until 30+ days of closes exist`
          : "no valid spot price — signal degraded to HOLD",
      ],
      playbook:
        "Not enough price history for a market call. Staking decisions can proceed on the validator table alone; revisit the market route once 30+ days of closes are cached.",
    };
  }

  // --- trend [-50, +50] ---
  // ±1% neutral bands around the SMA comparisons: price 0.3% above SMA50 is
  // noise, not a trend — scoring it as full bullish caused boundary whipsaw.
  const NEAR = 0.01;
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const vs50 = sma50 ? ((spot - sma50) / sma50) * 100 : null;
  const vs200 = sma200 ? ((spot - sma200) / sma200) * 100 : null;
  const golden =
    sma50 != null && sma200 != null
      ? sma50 > sma200 * 1.005
        ? true
        : sma50 < sma200 * 0.995
          ? false
          : null // SMAs tangled — no regime call
      : null;

  let trendScore = 0;
  if (vs50 != null) {
    const pts = vs50 > NEAR * 100 ? 20 : vs50 < -NEAR * 100 ? -20 : 0;
    trendScore += pts;
    if (pts !== 0)
      reasons.push(
        pts > 0
          ? `price ${vs50.toFixed(1)}% above SMA50 — short trend up`
          : `price ${Math.abs(vs50).toFixed(1)}% below SMA50 — short trend down`
      );
  }
  if (vs200 != null) {
    const pts = vs200 > NEAR * 100 ? 20 : vs200 < -NEAR * 100 ? -20 : 0;
    trendScore += pts;
    if (pts !== 0)
      reasons.push(
        pts > 0
          ? `price ${vs200.toFixed(1)}% above SMA200 — long trend up`
          : `price ${Math.abs(vs200).toFixed(1)}% below SMA200 — long trend down`
      );
  }
  if (golden != null) {
    trendScore += golden ? 10 : -10;
    reasons.push(golden ? "SMA50 above SMA200 (golden regime)" : "SMA50 below SMA200 (bear regime)");
  }

  // --- momentum [-25, +25] ---
  const ret = (days: number): number | null => {
    if (closes.length < days + 1) return null;
    const past = closes[closes.length - 1 - days];
    return past > 0 ? ((spot - past) / past) * 100 : null;
  };
  const d7 = ret(7);
  const d30 = ret(30);
  const d90 = ret(90);
  let momentumScore = 0;
  if (d30 != null) {
    const pts = clamp(d30 / 10, -1, 1) * 15;
    momentumScore += pts;
    reasons.push(`30d momentum ${d30 >= 0 ? "+" : ""}${d30.toFixed(1)}%`);
  }
  if (d7 != null) {
    const pts = clamp(d7 / 5, -1, 1) * 10;
    momentumScore += pts;
    if (Math.abs(d7) >= 5)
      reasons.push(`7d move ${d7 >= 0 ? "+" : ""}${d7.toFixed(1)}% — momentum ${d7 >= 0 ? "surge" : "flush"}`);
  }

  // --- drawdown [-10, +15] ---
  const window180 = closes.slice(-180);
  const high180 = Math.max(...window180);
  const low180 = Math.min(...window180);
  const fromHigh = ((spot - high180) / high180) * 100;
  const dd = drawdownComponent(fromHigh, d30);
  const drawdownScore = dd.score;
  reasons.push(dd.reason);

  // --- yield edge [-5, +10] ---
  const edge =
    input.topStakeNetApyPct != null && input.rootNetApyPct != null
      ? input.topStakeNetApyPct - input.rootNetApyPct
      : null;
  let yieldScore = 0;
  if (edge != null) {
    const ye = yieldEdgeComponent(edge);
    yieldScore = ye.score;
    reasons.push(ye.reason);
  }

  const score = Math.round(clamp(trendScore + momentumScore + drawdownScore + yieldScore, -90, 100));

  const action: TaoMarketAction =
    score >= 25 ? "BUY" : score >= 0 ? "HOLD" : score >= -25 ? "REDUCE" : "SELL";
  const confidence: TaoMarketConfidence =
    closes.length >= 150 && Math.abs(score) >= 40 ? "high" : Math.abs(score) >= 18 ? "medium" : "low";

  const vol = annualizedVolPct(closes, 30);
  if (vol != null) {
    reasons.push(
      vol >= 100
        ? `30d volatility ${vol.toFixed(0)}%/yr — very hot, size positions small and DCA`
        : `30d volatility ${vol.toFixed(0)}%/yr — ${vol >= 60 ? "typical crypto risk; DCA rather than lump-sum" : "calm regime"}`
    );
  }
  if (input.stale) reasons.push("price candles served from a stale cache — refresh before acting");

  const playbook =
    action === "BUY"
      ? "Trend + entry zone favor accumulating: DCA into the ranked validators on the table rather than lump-sum; keep new buys inside the VIABLE list."
      : action === "HOLD"
        ? "Keep existing staked position compounding; new capital can enter slowly (weekly DCA). No urgency either way."
        : action === "REDUCE"
          ? "Trim new buys; let existing stake ride only on VIABLE validators. Shift fresh capital to root staking until the trend repairs."
          : "De-risk: pause new buys, consider unstaking speculative lanes toward root/stables. Re-enter only after price reclaims SMA50 with the score back above −25.";

  return {
    action,
    score,
    confidence,
    components: {
      trend: Math.round(trendScore),
      momentum: Math.round(momentumScore),
      drawdown: drawdownScore,
      yieldEdge: yieldScore,
    },
    spot: { priceUsd: spot, change24hPct: input.change24hPct ?? null },
    trend: { sma50, sma200, priceVsSma50Pct: vs50, priceVsSma200Pct: vs200, goldenCross: golden },
    momentum: { d7Pct: d7, d30Pct: d30, d90Pct: d90 },
    drawdown: { high180Usd: high180, fromHigh180Pct: fromHigh, low180Usd: low180 },
    volatility: { annualizedPct: vol },
    yieldContext: {
      topStakeNetApyPct: input.topStakeNetApyPct ?? null,
      rootNetApyPct: input.rootNetApyPct ?? null,
      edgePct: edge,
    },
    historyDays: closes.length,
    stale: Boolean(input.stale),
    reasons,
    playbook,
  };
}
