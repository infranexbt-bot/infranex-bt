// End-to-end check of the market route pipeline (outside Next): real Binance
// klines → computeMarketSignal → current action. Mirrors the API route logic.
import { computeMarketSignal } from "../src/lib/infranex/tao-market";
import baseline from "../src/lib/infranex/tao-engine-baseline.json";
import { computeTaoEngineOptions } from "../src/lib/infranex/tao-engine";
import type { TaoEngineResearchPayload } from "../src/lib/infranex/tao-engine-types";

const res = await fetch(
  "https://api.binance.com/api/v3/klines?symbol=TAOUSDT&interval=1d&limit=250",
  { signal: AbortSignal.timeout(10_000) }
);
if (!res.ok) throw new Error(`binance ${res.status}`);
const rows = (await res.json()) as unknown[];
const closes = rows.map((r) => Number((r as unknown[])[4])).filter((c) => Number.isFinite(c) && c > 0);
console.log(`closes: ${closes.length} days, last close $${closes[closes.length - 1].toFixed(2)}`);

const payload = baseline as unknown as TaoEngineResearchPayload;
const opts = computeTaoEngineOptions(payload, { stakeTao: 100, maxOptions: 5, riskTolerance: "any" });
const best = opts.find((o) => o.beatsRoot) ?? null;
const root = payload.rootBaseline.netApyPct;
console.log(`yield context: top=${best?.sustainableApyPct.toFixed(2) ?? "null"}% root=${root}%`);

const signal = computeMarketSignal({
  closes,
  topStakeNetApyPct: best ? best.sustainableApyPct : null,
  rootNetApyPct: root,
});
console.log(`\nACTION: ${signal.action} (score ${signal.score}, confidence ${signal.confidence})`);
console.log(`spot $${signal.spot.priceUsd.toFixed(2)} · 24h ${signal.spot.change24hPct ?? "—"}%`);
console.log(`SMA50 $${signal.trend.sma50?.toFixed(2)} · SMA200 $${signal.trend.sma200?.toFixed(2)}`);
console.log(`vs SMA50 ${signal.trend.priceVsSma50Pct?.toFixed(1)}% · vs SMA200 ${signal.trend.priceVsSma200Pct?.toFixed(1)}% · golden=${signal.trend.goldenCross}`);
console.log(`7d ${signal.momentum.d7Pct?.toFixed(1)}% · 30d ${signal.momentum.d30Pct?.toFixed(1)}% · 90d ${signal.momentum.d90Pct?.toFixed(1)}%`);
console.log(`180d high $${signal.drawdown.high180Usd?.toFixed(2)} (${signal.drawdown.fromHigh180Pct?.toFixed(1)}% below)`);
console.log(`vol ${signal.volatility.annualizedPct?.toFixed(0)}%/yr`);
console.log(`components: ${JSON.stringify(signal.components)}`);
console.log("reasons:");
for (const r of signal.reasons) console.log(`  • ${r}`);
console.log(`playbook: ${signal.playbook}`);
