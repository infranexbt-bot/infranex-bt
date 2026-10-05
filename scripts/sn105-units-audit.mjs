// SN105 emission-units audit — find the honest TAO/day for Beam.
// Cross-checks 4 independent sources:
//   A. Emission vec (per-uid, last epoch) — the number chain.ts uses today
//   B. DynamicInfo.emission (runtime API field, if present)
//   C. taoIn pool flow measured over ~45s (physical ground truth in dTAO)
//   D. movingPrice sanity
import { ApiPromise, WsProvider } from "@polkadot/api";

const WS = "wss://entrypoint-finney.opentensor.ai:443";
const N = 105;
const RAO = 1e9;
const BLOCKS_PER_DAY = 7200; // 12s blocks

const ws = new WsProvider(WS, 10000, undefined, 60000);
const api = await ApiPromise.create({ provider: ws, noInitWarn: true });
const toTao = (s) => Number(BigInt(s)) / RAO;

// --- TAO price (for $ conversion; best-effort) ---
let taoUsd = 0;
try {
  const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bittensor&vs_currencies=usd", {
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json();
  taoUsd = j?.bittensor?.usd ?? 0;
} catch { /* optional */ }
console.log(`TAO/USD: $${taoUsd}\n`);

// --- 1. DynamicInfo full field dump for SN105 ---
let dyn = null;
try {
  dyn = await api.call.subnetInfoRuntimeApi.getDynamicInfo(N);
} catch { /* try the all-subnets call below */ }
if (!dyn) {
  try {
    const all = await api.call.subnetInfoRuntimeApi.getAllDynamicInfo();
    dyn = all.find((d) => Number(d.netuid?.toString?.() ?? -1) === N) ?? null;
  } catch (e) {
    console.log("DynamicInfo unavailable:", e.message);
  }
}
const dynH = dyn?.toHuman ? dyn.toHuman() : null;
if (dynH) {
  console.log("== DynamicInfo(SN105) fields ==");
  for (const [k, v] of Object.entries(dynH)) {
    const s = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
    console.log(`  ${k} = ${s.length > 100 ? s.slice(0, 100) + "…" : s}`);
  }
  console.log();
}

// --- 2. Storage vecs for SN105 ---
const emV = ((await api.query.subtensorModule.emission(N)).toJSON()) || [];
const incV = ((await api.query.subtensorModule.incentive(N)).toJSON()) || [];
const divV = ((await api.query.subtensorModule.dividends(N)).toJSON()) || [];
const sum = (a) => a.reduce((x, y) => x + (Number(y) || 0), 0);
const emSum = sum(emV);
const minerEm = emV.reduce((a, e, i) => a + ((incV[i] ?? 0) > 0 ? Number(e) : 0), 0);
const validatorEm = emV.reduce((a, e, i) => a + ((divV[i] ?? 0) > 0 && (incV[i] ?? 0) === 0 ? Number(e) : 0), 0);
const rewarded = emV.filter((_, i) => (incV[i] ?? 0) > 0).length;
const validators = emV.filter((_, i) => (divV[i] ?? 0) > 0).length;
const top10 = [...emV].sort((a, b) => b - a).slice(0, 10);
console.log("== Emission vec (raw) ==");
console.log(`  len=${emV.length} sum=${emSum} (${(emSum / RAO).toPrecision(8)} α-equiv if rao)`);
console.log(`  miner-side sum (inc>0) = ${minerEm}; validator-only = ${validatorEm}`);
console.log(`  rewarded(inc>0)=${rewarded}  validators(div>0)=${validators}`);
console.log(`  top10 em = ${top10.join(", ")}`);
console.log(`  non-zero em count = ${emV.filter((x) => Number(x) > 0).length}\n`);

const tempo = Number((await api.query.subtensorModule.tempo(N)).toString()) || 100;
console.log(`tempo = ${tempo} (epochs/day = ${(BLOCKS_PER_DAY / tempo).toFixed(2)})\n`);

// --- 3. taoIn flow sampling (~45s apart) ---
const sampleTao = async () => {
  const [h, subnetTAO] = await Promise.all([
    api.rpc.chain.getHeader(),
    api.query.subtensorModule.subnetTAO(N),
  ]);
  let taoIn = null;
  try {
    const d = await api.call.subnetInfoRuntimeApi.getDynamicInfo(N);
    taoIn = d?.taoIn?.toString?.() ?? null;
  } catch { /* optional */ }
  return {
    block: h.number.toNumber(),
    subnetTAO: toTao(subnetTAO.toString()),
    taoIn: taoIn != null ? toTao(taoIn) : null,
  };
};
const s1 = await sampleTao();
console.log(`sample1: block=${s1.block} subnetTAO=${s1.subnetTAO.toFixed(6)} taoIn=${s1.taoIn}`);
await new Promise((r) => setTimeout(r, 45000));
const s2 = await sampleTao();
console.log(`sample2: block=${s2.block} subnetTAO=${s2.subnetTAO.toFixed(6)} taoIn=${s2.taoIn}`);
const dBlocks = s2.block - s1.block;
const flowSubnetTAO = dBlocks > 0 ? (s2.subnetTAO - s1.subnetTAO) / dBlocks : 0;
const flowTaoIn = dBlocks > 0 && s1.taoIn != null && s2.taoIn != null ? (s2.taoIn - s1.taoIn) / dBlocks : null;
console.log(`\ndBlocks=${dBlocks}`);
console.log(`subnetTAO flow = ${flowSubnetTAO.toPrecision(6)} TAO/blk → ${(flowSubnetTAO * BLOCKS_PER_DAY).toFixed(4)} TAO/day`);
if (flowTaoIn != null)
  console.log(`taoIn    flow = ${flowTaoIn.toPrecision(6)} TAO/blk → ${(flowTaoIn * BLOCKS_PER_DAY).toFixed(4)} TAO/day`);

// --- 4. Interpretations of the Emission vec ---
const price = dynH?.movingPrice != null ? toTao(String(dynH.movingPrice).replace(/,/g, "")) : 0;
console.log(`\nmovingPrice (DynamicInfo) = ${price} TAO/α`);
const interp = {
  "A: vec=α rao / epoch": (emSum / RAO / tempo) * BLOCKS_PER_DAY * price,
  "B: vec=TAO rao / epoch": (emSum / RAO / tempo) * BLOCKS_PER_DAY,
  "C: vec=α rao / block": (emSum / RAO) * BLOCKS_PER_DAY * price,
  "D: vec=TAO rao / block": (emSum / RAO) * BLOCKS_PER_DAY,
};
console.log("== Vec interpretations → total TAO/day ==");
for (const [k, v] of Object.entries(interp)) console.log(`  ${k}: ${v.toPrecision(6)}`);

// DynamicInfo.emission field interpretation
if (dynH && dynH.emission != null) {
  const emRao = Number(String(dynH.emission).replace(/,/g, ""));
  const blocksSince = Number(String(dynH.blocksSinceLastStep ?? "0").replace(/,/g, "")) || tempo;
  const perDayEpoch = (emRao / RAO / tempo) * BLOCKS_PER_DAY;
  const perDaySince = (emRao / RAO / blocksSince) * BLOCKS_PER_DAY;
  console.log(`\n== DynamicInfo.emission = ${dynH.emission} =`);
  console.log(`  as TAO rao, /tempo/day:      ${perDayEpoch.toFixed(4)} TAO/day`);
  console.log(`  as TAO rao, /blocksSince/day: ${perDaySince.toFixed(4)} TAO/day`);
  if (price > 0) console.log(`  as α rao × price, /tempo/day: ${(perDayEpoch * price).toFixed(4)} TAO/day`);
}

// --- 5. Verdict: honest per-miner numbers from the taoIn flow ---
const flow = flowTaoIn ?? flowSubnetTAO;
const totalDay = flow * BLOCKS_PER_DAY;
const minerShare = emSum > 0 ? minerEm / emSum : 0.41;
const minerDay = totalDay * minerShare;
console.log(`\n== Verdict (taoIn flow as ground truth) ==`);
console.log(`  total TAO/day ≈ ${totalDay.toFixed(4)} (flow ${flow.toPrecision(4)} TAO/blk)`);
console.log(`  miner share (vec) = ${(minerShare * 100).toFixed(1)}% → miners earn ${minerDay.toFixed(4)} TAO/day`);
console.log(`  per rewarded miner (${rewarded}) = ${(minerDay / Math.max(rewarded, 1)).toFixed(6)} TAO/day`);
if (taoUsd > 0) {
  const perMinerMonthly = (minerDay / Math.max(rewarded, 1)) * 30 * taoUsd;
  console.log(`  per-miner $ ≈ $${perMinerMonthly.toFixed(2)}/mo (TAO $${taoUsd})`);
}
await api.disconnect();
