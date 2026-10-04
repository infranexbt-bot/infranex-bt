/** Quick recycle-per-netuid read for the 49 CPU subnets (entry cost). */
import { WsProvider, ApiPromise } from "@polkadot/api";
import { writeFileSync } from "node:fs";
const WS = "wss://entrypoint-finney.opentensor.ai:443";
const CPU = [2,5,6,7,8,11,13,15,18,19,21,22,23,25,37,41,43,46,48,50,52,56,60,61,62,63,65,66,67,69,71,77,78,79,83,88,89,93,98,101,104,107,111,115,119,121,124,127,128];
async function main() {
  const provider = new WsProvider(WS, 10000, undefined, 60000);
  const api = await ApiPromise.create({ provider, noInitWarn: true });
  await api.isReady;
  const sm: any = (api.query as any).subtensorModule;
  const out: Record<number, number | null> = {};
  for (const n of CPU) {
    try {
      const v = await sm.recycle(n);
      out[n] = v ? Number(v.toString()) : null; // rAO
    } catch { out[n] = null; }
  }
  writeFileSync("/home/z/my-project/scripts/cpu-recycle.json", JSON.stringify(out));
  console.log(out);
  await api.disconnect(); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
