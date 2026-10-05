// Calibrate: spot (taoIn/alphaIn) vs movingPrice across healthy + Beam subnets.
import { ApiPromise, WsProvider } from "@polkadot/api";

const WS = "wss://entrypoint-finney.opentensor.ai:443";
const RAO = 1e9;
const ws = new WsProvider(WS, 10000, undefined, 60000);
const api = await ApiPromise.create({ provider: ws, noInitWarn: true });
const num = (x) => Number(String(x).replace(/,/g, ""));

console.log("netuid | taoIn(TAO) | alphaIn(α) | spot | movingPrice | mp/spot | α emit/blk | TAO emit/day");
for (const n of [1, 4, 8, 18, 64, 67, 96, 105]) {
  try {
    const raw = await api.call.subnetInfoRuntimeApi.getDynamicInfo(n);
    const d = raw.toHuman ? raw.toHuman() : raw;
    const taoIn = num(d.taoIn) / RAO;
    const alphaIn = num(d.alphaIn) / RAO;
    const mp = num(d.movingPrice?.bits ?? d.movingPrice) / RAO;
    const spot = taoIn / alphaIn;
    const aoe = num(d.alphaOutEmission) / RAO;
    const tie = (num(d.taoInEmission) / RAO) * 7200;
    console.log(
      `SN${String(n).padStart(3)} | ${taoIn.toFixed(1)} | ${alphaIn.toFixed(0)} | ${spot.toPrecision(4)} | ${mp.toPrecision(4)} | ${(mp / spot).toFixed(2)}× | ${aoe.toFixed(4)} | ${tie.toFixed(2)}`
    );
  } catch (e) {
    console.log(`SN${n}: failed — ${e.message}`);
  }
}
await api.disconnect();
