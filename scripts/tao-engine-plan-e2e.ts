// End-to-end sanity: reproduce the recommend route's plan composition offline.
import baseline from "../src/lib/infranex/tao-engine-baseline.json";
import { readFileSync } from "fs";
import { computeMarketSignal } from "../src/lib/infranex/tao-market";
import { computeThreeRoutePlan } from "../src/lib/infranex/tao-engine-plan";

const payload = baseline as any;
const cache = JSON.parse(readFileSync(".tao-market-klines.json", "utf8")) as { closes: number[]; fetchedAt: string };

// Staking context from the real baseline (mirror of route logic)
const subs = payload.allResearched ?? payload.subnets;
const rootApy = payload.rootBaseline.netApyPct;
let best: { apy: number; low: number; high: number; name: string } | null = null;
for (const raw of subs) {
  if (!raw.validators?.length) continue;
  // lane-level screen (mirror of computeSubnetStakeOpportunity headline)
  const laneYield = (raw.laneTaoPerDay ?? 0) / Math.max(raw.laneStakeTao ?? 0, 1e-9) * 365 * 100;
  const net = laneYield * 0.82; // 18% take worst-case
  if (!best || net > best.apy) {
    const drift = raw.alphaChange24hPct ?? 0;
    best = { apy: net, low: net * (1 + Math.min(drift, 0) / 100 * 0.25 - 0.25), high: net * (1 + Math.max(drift, 0) / 100 * 0.25 + 0.25), name: raw.name };
  }
}

const signal = computeMarketSignal({
  closes: cache.closes,
  topStakeNetApyPct: best ? best.apy : null,
  rootNetApyPct: rootApy,
});

console.log(`klines: ${cache.closes.length} days, fetchedAt ${cache.fetchedAt}`);
console.log(`market: ${signal.action} score=${signal.score} conf=${signal.confidence} spot=$${signal.spot.priceUsd.toFixed(2)} vol=${signal.volatility.annualizedPct?.toFixed(0)}%/yr`);
console.log(`staking: best=${best ? best.apy.toFixed(1) + "%" : "none"} root=${rootApy}%`);

for (const risk of ["safe", "balanced", "aggressive"] as const) {
  const plan = computeThreeRoutePlan({
    stakeTao: 100,
    risk,
    horizonDays: 90,
    market: {
      action: signal.action,
      confidence: signal.confidence,
      score: signal.score,
      spotUsd: signal.spot.priceUsd,
      d30Pct: signal.momentum.d30Pct,
      volAnnualizedPct: signal.volatility.annualizedPct,
      fromHigh180Pct: signal.drawdown.fromHigh180Pct,
    },
    staking: {
      bestNetApyPct: best?.apy ?? null,
      apyLowPct: best?.low ?? null,
      apyHighPct: best?.high ?? null,
      rootNetApyPct: rootApy,
      viableCount: best ? 2 : 0,
    },
  });
  const a = plan.allocation;
  console.log(
    `\n[${risk}] stake=${a.stakeTao}(${a.stakePct.toFixed(0)}%) hold=${a.holdTao}(${a.holdPct.toFixed(0)}%) cash=${a.cashTao}(${a.cashPct.toFixed(0)}%) target=${plan.stakeTarget}`
  );
  console.log(`  stake mid-scenario(0% price): ${plan.stake.scenarios[2]?.endTao.toFixed(2)} TAO`);
  console.log(`  reasons: ${plan.reasons.slice(0, 3).join(" | ")}`);
}
