// SN105 Beam — fresh live read: seats, earnings spread, alpha price, burn,
// validator take. Grounds the discussion in today's numbers.
import { ApiPromise, WsProvider } from "@polkadot/api";

const WS = "wss://entrypoint-finney.opentensor.ai:443";
const BLOCKS_PER_DAY = 7200;

function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pct(a, p) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

async function main() {
  const provider = new WsProvider(WS, 10000, undefined, 60000);
  const api = await ApiPromise.create({ provider, noInitWarn: true });
  await api.isReady;
  const block = (await api.rpc.chain.getHeader()).number.toNumber();
  const sm = api.query.subtensorModule;

  const N = 105;
  const [keys, incentive, emission, active, taoIn, burnOpt] = await Promise.all([
    sm.keys.entries(N),
    sm.incentive(N),
    sm.emission(N),
    sm.active(N),
    sm.subnetTaoInEmission(N),
    sm.burn(N),
  ]);

  const registered = keys.length;
  const inc = incentive.toArray().map((v) => v.toNumber());
  const emiRao = emission.toArray().map((v) => v.toNumber());
  const act = active.toArray().map((v) => (v.toPrimitive?.() === true || v.toHuman?.() === true));

  const earning = emiRao
    .map((e, i) => ({ e, i }))
    .filter((x) => x.e > 0);
  const earningVals = earning.map((x) => x.e);

  // dynamic info via RPC (price, pool)
  let alphaPriceTao = null, poolTao = null, poolAlpha = null, emissionTao = null;
  try {
    const dyn = await api.rpc.subnetInfo.getDynamicInfo(N);
    const d = dyn.toHuman();
    alphaPriceTao = d.alphaPrice ? Number(d.alphaPrice?.toString?.() ?? d.alphaPrice) : null;
    // toHuman may give {alphaPrice: "0.123..."} strings
    if (d.alphaPrice) alphaPriceTao = parseFloat(String(d.alphaPrice));
    if (d.pool) {
      poolTao = parseFloat(String(d.pool?.tao ?? 0));
      poolAlpha = parseFloat(String(d.pool?.alpha ?? 0));
    }
    if (d.emission) emissionTao = parseFloat(String(d.emission));
  } catch (e) { console.log("dyn info err:", String(e).slice(0, 120)); }

  const taoInRao = taoIn.toNumber?.() ?? Number(taoIn);
  const poolTaoPerDay = (taoInRao / 1e9) * BLOCKS_PER_DAY;
  const minerPoolAlphaPerDay = (earningVals.reduce((a, b) => a + b, 0) / 1e9) * BLOCKS_PER_DAY;
  const burnRao = burnOpt?.toNumber?.() ?? Number(burnOpt ?? 0);

  const price = alphaPriceTao || 0;
  const usd = (alpha) => alpha * price * 305; // TAO_USD ~305 (from app config); alpha->TAO via price

  console.log(JSON.stringify({
    block,
    registered,
    seatsFull: registered >= 256,
    activeTrue: act.filter(Boolean).length,
    earningUids: earning.length,
    earningSharePct: Math.round((earning.length / Math.max(registered, 1)) * 100),
    alphaPriceTao: price,
    alphaPriceUsd: +(price * 305).toFixed(4),
    poolTao,
    poolAlpha,
    subnetTaoInPerBlockRao: taoInRao,
    subnetPoolTaoPerDay: +poolTaoPerDay.toFixed(4),
    minerPoolAlphaPerDay: +minerPoolAlphaPerDay.toFixed(2),
    minerPoolUsdPerDay: +usd(minerPoolAlphaPerDay).toFixed(0),
    perUidAlphaPerDayMedian: +(median(earningVals) / 1e9 * BLOCKS_PER_DAY).toFixed(4),
    perUidUsdPerDayMedian: +usd(median(earningVals) / 1e9 * BLOCKS_PER_DAY).toFixed(2),
    perUidUsdPerDayP90: +usd(pct(earningVals, 90) / 1e9 * BLOCKS_PER_DAY).toFixed(2),
    perUidUsdPerDayTop: +usd(Math.max(...earningVals, 0) / 1e9 * BLOCKS_PER_DAY).toFixed(2),
    burnTao: +(burnRao / 1e9).toFixed(6),
  }, null, 2));

  await api.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
