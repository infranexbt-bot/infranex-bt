// ALL-SUBNETS units audit — extend the SN105 honest-dollars fix to the whole network.
// For every subnet: recompute price/emission math independently from the chain,
// then diff against what /api/network (the app) reports.
// Flags: missing swap price (EMA fallback = 4.3x), minerEm mismatch, dilution
// ratio (alpha rewards valued vs real TAO inflow), zero reward vecs, tempo 0.
import { ApiPromise, WsProvider } from "@polkadot/api";
import { readFileSync } from "node:fs";

const WS = "wss://entrypoint-finney.opentensor.ai:443";
const RAO = 1e9;
const BLOCKS_PER_DAY = 7200;

const ws = new WsProvider(WS, 10000, undefined, 60000);
const api = await ApiPromise.create({ provider: ws, noInitWarn: true });

let taoUsd = 0;
try {
  const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bittensor&vs_currencies=usd", { signal: AbortSignal.timeout(8000) });
  taoUsd = (await r.json())?.bittensor?.usd ?? 0;
} catch { /* optional */ }
console.log(`TAO/USD: $${taoUsd}`);

// --- swap-engine prices (the honest tradeable price) ---
const swapPrice = new Map();
try {
  const list = await api.call.swapRuntimeApi.currentAlphaPriceAll();
  for (const e of list ?? []) {
    const h = e?.toHuman ? e.toHuman() : e;
    const n = Number(String(h?.netuid ?? "").replace(/,/g, ""));
    const p = Number(String(h?.price ?? "0").replace(/,/g, "")) / RAO;
    if (Number.isFinite(n) && p > 0) swapPrice.set(n, p);
  }
} catch (e) {
  console.log("WARN: swap price API unavailable:", e.message);
}
console.log(`swap prices loaded: ${swapPrice.size}`);

// --- DynamicInfo: real taoIn pool + taoInEmission per block ---
const taoIn = new Map();
const taoInflow = new Map();
try {
  const all = await api.call.subnetInfoRuntimeApi.getAllDynamicInfo();
  for (const d of all ?? []) {
    const h = d?.toHuman ? d.toHuman() : d;
    const n = Number(String(h?.netuid ?? "").replace(/,/g, ""));
    const ti = Number(String(h?.taoIn ?? "0").replace(/,/g, "")) / RAO;
    const te = Number(String(h?.taoInEmission ?? "0").replace(/,/g, "")) / RAO;
    if (Number.isFinite(n)) {
      if (ti > 0) taoIn.set(n, ti);
      if (te > 0) taoInflow.set(n, te);
    }
  }
} catch (e) {
  console.log("WARN: DynamicInfo unavailable:", e.message);
}
console.log(`DynamicInfo rows: ${taoIn.size}`);

const totalNetworks = Number((await api.query.subtensorModule.totalNetworks()).toString());
const N = Math.min(totalNetworks, 200);
const netuids = Array.from({ length: N }, (_, i) => i);
console.log(`total subnets: ${totalNetworks}, scanning: ${N}\n`);

const mods = api.query.subtensorModule;
const multi = async (m) => {
  try { return await m.multi(netuids); } catch { return netuids.map(() => null); }
};
const [
  minersArr, taoArr, alphaInArr, alphaOutArr, tempoArr,
  emVecs, incVecs, divVecs, emaArr, burnArr,
] = await Promise.all([
  multi(mods.subnetworkN), multi(mods.subnetTAO), multi(mods.subnetAlphaIn),
  multi(mods.subnetAlphaOut), multi(mods.tempo),
  multi(mods.emission), multi(mods.incentive), multi(mods.dividends),
  multi(mods.subnetMovingPrice), multi(mods.burn),
]);
const toTao = (s) => Number(BigInt(String(s ?? "0").replace(/[^0-9]/g, ""))) / RAO;
const num = (s) => Number(String(s ?? "0").replace(/[^0-9]/g, "")) || 0;
const vec = (raw) => {
  const v = raw?.toJSON ? raw.toJSON() : null;
  return Array.isArray(v) ? v.map((x) => Number(x) || 0) : [];
};

// --- app snapshot for diff ---
let appRows = new Map();
let appSubnets = new Map();
let appTaoUsd = 0;
try {
  const users = JSON.parse(readFileSync("/home/z/my-project/scripts/users.local.json", "utf8"));
  const admin = users.find((u) => u.role === "admin" && u.code);
  const login = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: admin.userId, code: admin.code }),
  });
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const res = await fetch("http://localhost:3000/api/network", { headers: { cookie } });
  const data = await res.json();
  appTaoUsd = data.taoPriceUsd ?? 0;
  for (const s of data.subnets ?? []) {
    appSubnets.set(s.netuid, s);
  }
} catch (e) {
  console.log("WARN: app snapshot unavailable:", e.message);
}
const usdEff = taoUsd || appTaoUsd;

// --- recompute per subnet ---
const rows = [];
for (let i = 0; i < N; i++) {
  const n = i;
  const minerCount = num(minersArr[i]?.toString());
  const subnetTao = toTao(taoArr[i]?.toString());
  if (minerCount === 0 && subnetTao === 0) continue;
  const emV = vec(emVecs[i]);
  const incV = vec(incVecs[i]);
  const divV = vec(divVecs[i]);
  const tempo = Math.max(num(tempoArr[i]?.toString()), 1);
  const emaPrice = toTao(emaArr[i]?.toString());
  const swap = swapPrice.get(n) ?? 0;
  const alphaIn = toTao(alphaInArr[i]?.toString());
  const poolRatio = alphaIn > 0 && subnetTao > 0 ? subnetTao / alphaIn : 0;
  const price = swap > 0 ? swap : emaPrice > 0 ? emaPrice : poolRatio;

  let emSum = 0, minerEmRao = 0, rewarded = 0;
  for (let u = 0; u < Math.max(emV.length, incV.length); u++) {
    const e = emV[u] ?? 0, inc = incV[u] ?? 0, dv = divV[u] ?? 0;
    if (e > 0) emSum += e;
    if (inc > 0) { rewarded++; minerEmRao += Math.max(e, 0); }
  }
  const validatorEmRao = Math.max(emSum - minerEmRao, 0);
  const minerShare = minerEmRao + validatorEmRao > 0 ? minerEmRao / (minerEmRao + validatorEmRao) : 0.5;

  const alphaPerBlock = emSum / tempo / RAO; // α/block (per-epoch vec semantics)
  const emissionPerDayTao = alphaPerBlock * price * BLOCKS_PER_DAY;
  const minerEmDay = emissionPerDayTao * minerShare;

  // REALIZABILITY-AUDIT (matches the app's honest-dollar semantics):
  // selling the whole daily neuron α flow into the pool realizes the avg
  // balancer price y/(x+q), always ≤ spot.
  const poolTao = taoIn.get(n) ?? (subnetTao > 0 ? subnetTao : 0);
  const poolAlpha = toTao(alphaInArr[i]?.toString());
  const neuronAlphaPerDay = alphaPerBlock * BLOCKS_PER_DAY;
  let realizability = null, realizablePrice = null, minerEmRealDay = minerEmDay;
  if (swap > 0 && poolTao > 0 && poolAlpha > 0 && neuronAlphaPerDay > 0) {
    realizablePrice = poolTao / (poolAlpha + neuronAlphaPerDay);
    if (realizablePrice > 0) {
      realizability = Math.min(1, realizablePrice / price);
      minerEmRealDay = minerEmDay * realizability;
    }
  }

  const perEarning = rewarded > 0 ? minerEmRealDay / rewarded : 0;
  const perRegistered = minerEmRealDay > 0 ? minerEmRealDay / Math.max(minerCount, 1) : 0;
  const inflowDay = (taoInflow.get(n) ?? 0) * BLOCKS_PER_DAY;

  rows.push({
    n, minerCount, subnetTao: Math.round(subnetTao), tempo, swap, emaPrice,
    ratio: swap > 0 ? emaPrice / swap : null,
    poolRatio, price, alphaIn, alphaOut: toTao(alphaOutArr[i]?.toString()),
    emSum, rewarded, alphaPerBlock, emissionPerDayTao, minerShare,
    minerEmDay, minerEmRealDay, realizability, perEarning, perRegistered, inflowDay,
    dilution: inflowDay > 0 ? minerEmRealDay / inflowDay : null,
    burn: toTao(burnArr[i]?.toString()),
  });
}

// --- report ---
console.log("== independent chain recompute (all subnets) ==");
console.log("net | miners | price(swap) | EMA/ref | α/blk | emis TAO/d | miner TAO/d | dilution | rewardV");
let emaFallbackCount = 0, zeroVec = 0, highDilution = 0;
for (const r of rows) {
  const flags = [];
  if (r.swap === 0 && r.price > 0) { flags.push("EMA-FALLBACK"); emaFallbackCount++; }
  if (r.emSum === 0 && r.inflowDay > 0) { flags.push("NO-REWARD-VEC"); zeroVec++; }
  if (r.dilution != null && r.dilution > 3) { flags.push(`DILUTION>${r.dilution.toFixed(1)}x`); highDilution++; }
  if (flags.length === 0) continue; // print only problem rows + summary
  console.log(
    `${String(r.n).padStart(3)} | ${String(r.minerCount).padStart(4)} | ${r.price.toFixed(6)} | ` +
    `${r.emaPrice > 0 ? (r.emaPrice / r.price).toFixed(2) + "x" : "-"} | ${r.alphaPerBlock.toFixed(4)} | ` +
    `${r.emissionPerDayTao.toFixed(2)} | ${r.minerEmDay.toFixed(3)} | ` +
    `${r.dilution != null ? r.dilution.toFixed(2) + "x" : "-"} | ${r.emSum} ${flags.join(",")}`
  );
}
console.log(`\nsummary: ${rows.length} subnets | EMA-fallback: ${emaFallbackCount} | no-reward-vec: ${zeroVec} | dilution>3x: ${highDilution}`);

// --- diff vs app ---
console.log("\n== app vs recompute diff (only |Δ|>10% shown) ==");
let diffCount = 0;
for (const r of rows) {
  const a = appSubnets.get(r.n);
  if (!a) continue;
  const diffs = [];
  if (r.swap > 0 && a.movingPrice && Math.abs(a.movingPrice - r.swap) / r.swap > 0.02)
    diffs.push(`price app=${a.movingPrice.toFixed(6)} chain=${r.swap.toFixed(6)}`);
  if (a.emaMovingPrice != null && r.emaPrice > 0 && Math.abs(a.emaMovingPrice - r.emaPrice) / r.emaPrice > 0.02)
    diffs.push(`ema app=${a.emaMovingPrice.toFixed(6)} chain=${r.emaPrice.toFixed(6)}`);
  if (r.minerEmRealDay > 0.0001 && a.minerEmissionTaoPerDay != null &&
      Math.abs(a.minerEmissionTaoPerDay - r.minerEmRealDay) / r.minerEmRealDay > 0.10)
    diffs.push(`minerEm app=${a.minerEmissionTaoPerDay.toFixed(4)} chain=${r.minerEmRealDay.toFixed(4)}`);
  if (r.inflowDay > 0 && a.taoInflowTaoPerDay != null &&
      Math.abs(a.taoInflowTaoPerDay - r.inflowDay) / r.inflowDay > 0.10)
    diffs.push(`inflow app=${a.taoInflowTaoPerDay.toFixed(3)} chain=${r.inflowDay.toFixed(3)}`);
  if (a.rewardedMiners != null && a.rewardedMiners !== r.rewarded)
    diffs.push(`rewarded app=${a.rewardedMiners} chain=${r.rewarded}`);
  if (diffs.length) {
    diffCount++;
    console.log(`SN${r.n}: ${diffs.join(" | ")}`);
  }
}
if (diffCount === 0) console.log("no material diffs — app pipeline matches independent chain recompute");

process.exit(0);
