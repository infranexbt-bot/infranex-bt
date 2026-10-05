// SN105 Beam — PRACTICAL earnings audit (not paper).
// Method: anchor on subnetTaoInEmission (chain's own TAO-value injection/day,
// cross-validated vs taostats on SN107 during the CPU scan), split 41% to
// miners, divide by earners, shape with the incentive vec (median share).
// Compare vs the dashboard's paper value (alpha × movingPrice) and show why
// the gap = thin-pool sell pressure.
import { ApiPromise, WsProvider } from "@polkadot/api";

const WS = "wss://entrypoint-finney.opentensor.ai:443";
const BLOCKS_PER_DAY = 7200;
const TAO_USD = 304.27; // app price feed, today
const MINER_SHARE = 0.41; // docs constant used across the app

const toNum = (v) => {
  if (v == null) return 0;
  const s = typeof v === "object" && v.toString ? v.toString() : String(v);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const p90 = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(0.9 * s.length))];
};

async function main() {
  const provider = new WsProvider(WS, 10000, undefined, 60000);
  const api = await ApiPromise.create({ provider, noInitWarn: true });
  await api.isReady;
  const block = (await api.rpc.chain.getHeader()).number.toNumber();
  const sm = api.query.subtensorModule;
  const N = 105;

  const [tempoO, taoInO, burnO, taoPoolO, alphaInO, movingO, emiV, incV, keys] =
    await Promise.all([
      sm.tempo(N),
      sm.subnetTaoInEmission(N),
      sm.burn(N),
      sm.subnetTAO(N),
      sm.subnetAlphaIn(N),
      sm.subnetMovingPrice(N),
      sm.emission(N),
      sm.incentive(N),
      sm.keys.entries(N),
    ]);

  const tempo = Math.max(toNum(tempoO), 1);
  const taoInPerBlockTao = toNum(taoInO) / 1e9; // TAO injected per block (chain's own accounting)
  const burnTao = toNum(burnO) / 1e9;
  const poolTao = toNum(taoPoolO) / 1e9;
  const poolAlpha = toNum(alphaInO) / 1e9; // alpha side of pool
  const movingPrice = toNum(movingO); // TAO per alpha (EMA)
  const poolRatioPrice = poolAlpha > 0 ? poolTao / poolAlpha : 0;

  const registered = keys.length;
  const emi = emiV.toArray().map((v) => toNum(v));
  const inc = incV.toArray().map((v) => toNum(v));

  const earning = emi.map((e, i) => ({ e, i })).filter((x) => x.e > 0);
  const emiEarn = earning.map((x) => x.e);
  const emiSum = emiEarn.reduce((a, b) => a + b, 0);
  const incEarn = inc.filter((v) => v > 0);
  const incSum = incEarn.reduce((a, b) => a + b, 0);
  const incMean = incSum / Math.max(incEarn.length, 1);
  const incMedianShare = incMean > 0 ? Math.min(median(incEarn) / incMean, 1.2) : null;

  const sorted = [...emiEarn].sort((a, b) => b - a);
  const topN = Math.max(1, Math.ceil(sorted.length * 0.1));
  const top10Share = emiSum > 0 ? sorted.slice(0, topN).reduce((a, b) => a + b, 0) / emiSum : null;

  // --- Anchor 1 (PRACTICAL): taoIn × miner share ÷ earners ---------------
  const cohortTaoPerDay = taoInPerBlockTao * BLOCKS_PER_DAY; // whole subnet, TAO/day
  const minerCohortTaoPerDay = cohortTaoPerDay * MINER_SHARE;
  const perEarnerMeanUsd = (minerCohortTaoPerDay / Math.max(earning.length, 1)) * TAO_USD;
  const perEarnerMedianUsd = perEarnerMeanUsd * (incMedianShare ?? 0.5);
  // new entrant: stake-weighted work assignment (BeamCore) -> assume 0.3–0.7× median
  const newEntrantLow = perEarnerMedianUsd * 0.3;
  const newEntrantHigh = perEarnerMedianUsd * 0.7;

  // --- Anchor 2 (PAPER): alpha emission × movingPrice --------------------
  // Try BOTH emission vec semantics; report the range.
  const alphaPerDay_ifPerBlock = (emiSum / 1e9) * BLOCKS_PER_DAY;
  const alphaPerDay_ifPerEpoch = (emiSum / 1e9) * (BLOCKS_PER_DAY / tempo);
  const paperTaoPerDay_hi = alphaPerDay_ifPerBlock * movingPrice;
  const paperTaoPerDay_lo = alphaPerDay_ifPerEpoch * movingPrice;

  // --- Sell-pressure check: cohort alpha/day vs pool + buy inflow --------
  const sellPressureAlpha = alphaPerDay_ifPerBlock; // if miners dump daily
  const priceDecayPerDayPct = poolAlpha > 0 ? (sellPressureAlpha / poolAlpha) * 100 : null; // ~% price drop/day
  const buyInflowTaoPerDay = cohortTaoPerDay;

  const out = {
    block,
    registered,
    earningUids: earning.length,
    tempo,
    burnTao,
    pool: { taoSide: +poolTao.toFixed(1), alphaSide: +poolAlpha.toFixed(0) },
    movingPriceTao: movingPrice,
    poolRatioPriceTao: +poolRatioPrice.toFixed(6),
    incentiveMedianShare: incMedianShare && +incMedianShare.toFixed(3),
    emissionTop10Share: top10Share && +top10Share.toFixed(3),
    taoInPerBlockTao: +taoInPerBlockTao.toFixed(6),
    // Anchor 1 — practical
    subnetTaoPerDay: +cohortTaoPerDay.toFixed(2),
    minerCohortTaoPerDay: +minerCohortTaoPerDay.toFixed(2),
    minerCohortUsdPerDay: +(minerCohortTaoPerDay * TAO_USD).toFixed(0),
    perEarnerMeanUsd: +perEarnerMeanUsd.toFixed(2),
    perEarnerMedianUsd: +perEarnerMedianUsd.toFixed(2),
    newEntrantUsdPerDay: [+newEntrantLow.toFixed(2), +newEntrantHigh.toFixed(2)],
    // Anchor 2 — paper
    alphaPerDayPerBlockSemantics: +alphaPerDay_ifPerBlock.toFixed(0),
    alphaPerDayPerEpochSemantics: +alphaPerDay_ifPerEpoch.toFixed(4),
    paperMinerTaoPerDayRange: [+paperTaoPerDay_lo.toFixed(3), +paperTaoPerDay_hi.toFixed(1)],
    // Sell pressure
    cohortSellPriceDecayPerDayPct: priceDecayPerDayPct && +priceDecayPerDayPct.toFixed(2),
    buyInflowTaoPerDay: +buyInflowTaoPerDay.toFixed(2),
  };
  console.log(JSON.stringify(out, null, 2));
  await api.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
