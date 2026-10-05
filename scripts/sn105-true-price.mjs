// Authoritative price + realized-value simulation via the swap runtime API.
import { ApiPromise, WsProvider } from "@polkadot/api";

const WS = "wss://entrypoint-finney.opentensor.ai:443";
const RAO = 1e9;
const ws = new WsProvider(WS, 10000, undefined, 60000);
const api = await ApiPromise.create({ provider: ws, noInitWarn: true });
const num = (x) => Number(String(x).replace(/,/g, ""));

// 1. True instantaneous price for all subnets (chain's own swap engine).
const prices = await api.call.swapRuntimeApi.currentAlphaPriceAll();
const byN = new Map(prices.map((p) => [num(p.netuid), num(p.price) / RAO]));
console.log("netuid | swapAPI price | movingPrice | mp/true | taoInEmission TAO/day");
for (const n of [1, 4, 8, 18, 64, 67, 96, 105]) {
  const d = (await api.call.subnetInfoRuntimeApi.getDynamicInfo(n)).toHuman();
  const mp = num(d.movingPrice?.bits ?? d.movingPrice) / RAO;
  const tie = (num(d.taoInEmission) / RAO) * 7200;
  const trueP = byN.get(n);
  console.log(
    `SN${String(n).padStart(3)} | ${trueP?.toPrecision(6)} | ${mp.toPrecision(6)} | ${(mp / trueP).toFixed(3)}× | ${tie.toFixed(2)}`
  );
}

// 2. Beam miner realized value: sell daily/30d alpha rewards into the pool.
//    Last epoch vec: 295.2 α to 247 rewarded miners → per-miner α/day.
const emV = ((await api.query.subtensorModule.emission(105)).toJSON()) || [];
const incV = ((await api.query.subtensorModule.incentive(105)).toJSON()) || [];
const rewarded = emV.filter((_, i) => (incV[i] ?? 0) > 0).length;
const perMinerAlphaPerDay = (emV.reduce((a, b) => a + Number(b), 0) / 1e9 / 360) * 20 / rewarded;
console.log(`\nSN105: rewarded=${rewarded}, per-miner α/day = ${perMinerAlphaPerDay.toFixed(4)}`);
const trueP105 = byN.get(105);
for (const days of [1, 30]) {
  const alphaAmt = BigInt(Math.round(perMinerAlphaPerDay * days * 1e9));
  const sim = (await api.call.swapRuntimeApi.simSwapAlphaForTao(105, alphaAmt)).toHuman();
  const taoOut = num(sim.amountPaidOut) / RAO;
  const priceImpact = sim.priceImpact ? Number(sim.priceImpact) : null;
  console.log(
    `  sell ${days}d rewards (${(Number(alphaAmt) / 1e9).toFixed(2)} α): get ${taoOut.toFixed(6)} TAO | effective ${((taoOut / (Number(alphaAmt) / 1e9))).toPrecision(5)} TAO/α | vs marginal ${trueP105.toPrecision(5)}`
  );
}
await api.disconnect();
