import { describe, expect, test } from "bun:test";
import {
  computeMarketSignal,
  sma,
  annualizedVolPct,
} from "../src/lib/infranex/tao-market";

// Deterministic series builders ----------------------------------------------

/** n days of straight-line price from a → b (inclusive). */
function ramp(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

/** Geometric series: daily growth g (e.g. 1.01 = +1%/day). */
function trend(start: number, g: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => start * Math.pow(g, i));
}

const YIELD = { topStakeNetApyPct: 10.0, rootNetApyPct: 4.3 };

describe("sma + volatility primitives", () => {
  test("sma: mean of last window", () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
    expect(sma([1, 2, 3, 4, 5], 2)).toBe(4.5);
  });
  test("sma: null when insufficient data", () => {
    expect(sma([1, 2, 3], 10)).toBeNull();
    expect(sma([], 1)).toBeNull();
  });
  test("annualizedVolPct: flat series → ~0", () => {
    const v = annualizedVolPct(Array(40).fill(100), 30);
    expect(v).not.toBeNull();
    expect(v!).toBeLessThan(1);
  });
  test("annualizedVolPct: null when too short", () => {
    expect(annualizedVolPct([1, 2, 3], 30)).toBeNull();
  });
});

describe("computeMarketSignal — action mapping", () => {
  test("strong uptrend above both SMAs with edge → BUY", () => {
    const closes = trend(100, 1.01, 250); // +1%/day for 250d
    const s = computeMarketSignal({ closes, ...YIELD });
    expect(s.action).toBe("BUY");
    expect(s.score).toBeGreaterThanOrEqual(25);
    expect(s.confidence).toBe("high");
    expect(s.trend.goldenCross).toBe(true);
    expect(s.historyDays).toBe(250);
  });

  test("strong downtrend below both SMAs → SELL", () => {
    const closes = trend(500, 0.985, 250); // −1.5%/day for 250d
    const s = computeMarketSignal({ closes, ...YIELD });
    expect(s.action).toBe("SELL");
    expect(s.score).toBeLessThanOrEqual(-25);
    expect(s.drawdown.fromHigh180Pct).toBeLessThan(-20);
  });

  test("truly flat series at the 180d high → HOLD, score near zero", () => {
    const closes = Array(250).fill(102); // no trend at all
    const s = computeMarketSignal({ closes, ...YIELD });
    expect(s.action).toBe("HOLD");
    expect(Math.abs(s.score)).toBeLessThan(30);
    expect(s.trend.goldenCross).toBeNull(); // SMAs tangled — no regime call
  });

  test("deep crash with weak recovery keeps contrarian drawdown bonus", () => {
    const crash = trend(100, 0.97, 200); // down to ~0.23
    const recover = ramp(0.233, 4.5, 50); // bounce, still ≤−60% vs 180d high
    const closes = [...crash, ...recover];
    const s = computeMarketSignal({ closes, ...YIELD });
    expect(s.components.drawdown).toBeGreaterThan(0);
    expect(s.drawdown.fromHigh180Pct).toBeLessThan(-40);
  });
});

describe("computeMarketSignal — honesty guards", () => {
  test("<30 days of closes → HOLD/low with explicit reason", () => {
    const s = computeMarketSignal({ closes: trend(100, 1.001, 10), ...YIELD });
    expect(s.action).toBe("HOLD");
    expect(s.confidence).toBe("low");
    expect(s.reasons[0]).toContain("history");
    expect(s.historyDays).toBe(10);
  });

  test("NaN/negative/zero closes are filtered, spot must be positive", () => {
    const closes = [...trend(100, 1.01, 200), NaN, 0, -5];
    const s = computeMarketSignal({ closes, ...YIELD });
    expect(s.historyDays).toBe(200);
    expect(Number.isFinite(s.score)).toBe(true);
  });

  test("no yield context → yieldEdge component is 0, signal still works", () => {
    const closes = trend(100, 1.01, 250);
    const s = computeMarketSignal({ closes });
    expect(s.components.yieldEdge).toBe(0);
    expect(s.yieldContext.edgePct).toBeNull();
    expect(s.action).toBe("BUY");
  });

  test("zero/negative yield edge earns the negative component", () => {
    const closes = ramp(100, 100.5, 200);
    const s = computeMarketSignal({
      closes,
      topStakeNetApyPct: 3.0,
      rootNetApyPct: 4.3,
    });
    expect(s.components.yieldEdge).toBe(-5);
    expect(s.action).not.toBe("BUY");
  });

  test("stale flag propagates into reasons", () => {
    const s = computeMarketSignal({ closes: trend(100, 1.001, 200), stale: true });
    expect(s.stale).toBe(true);
    expect(s.reasons.some((r) => r.includes("stale"))).toBe(true);
  });

  test("score is clamped inside [-90, 100] even for extremes", () => {
    const boom = trend(1, 1.5, 250);
    const s = computeMarketSignal({ closes: boom, ...YIELD });
    expect(s.score).toBeLessThanOrEqual(100);
    expect(s.score).toBeGreaterThanOrEqual(-90);
  });
});

describe("computeMarketSignal — shape", () => {
  test("full stats present on a healthy series", () => {
    const closes = trend(100, 1.005, 250);
    const s = computeMarketSignal({
      closes,
      spotPriceUsd: closes[closes.length - 1] * 1.02,
      change24hPct: 2.1,
      ...YIELD,
    });
    expect(s.trend.sma50).not.toBeNull();
    expect(s.trend.sma200).not.toBeNull();
    expect(s.momentum.d7Pct).not.toBeNull();
    expect(s.momentum.d30Pct).not.toBeNull();
    expect(s.momentum.d90Pct).not.toBeNull();
    expect(s.drawdown.high180Usd).toBeGreaterThan(0);
    expect(s.volatility.annualizedPct).not.toBeNull();
    expect(s.yieldContext.edgePct).toBeCloseTo(5.7, 5);
    expect(s.reasons.length).toBeGreaterThan(3);
    expect(s.playbook.length).toBeGreaterThan(20);
    expect(["BUY", "HOLD", "REDUCE", "SELL"]).toContain(s.action);
  });

  test("playbook text matches action", () => {
    const buy = computeMarketSignal({ closes: trend(100, 1.01, 250), ...YIELD });
    expect(buy.playbook).toContain("DCA");
    const sell = computeMarketSignal({ closes: trend(500, 0.98, 250), ...YIELD });
    expect(sell.playbook.toLowerCase()).toContain("de-risk");
  });

  test("neutral band: price hugging SMA50/SMA200 earns no trend points", () => {
    const closes = ramp(100, 100.5, 250); // ~flat, spot within 1% of both SMAs
    const s = computeMarketSignal({ closes, ...YIELD });
    expect(s.components.trend).toBe(0);
  });

  test("every reason is a non-empty string", () => {
    const s = computeMarketSignal({ closes: trend(100, 0.999, 220), ...YIELD });
    for (const r of s.reasons) expect(typeof r === "string" && r.length > 5).toBe(true);
  });
});
