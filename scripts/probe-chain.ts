import { WsProvider, ApiPromise } from "@polkadot/api";
const WS = "wss://entrypoint-finney.opentensor.ai:443";
async function main() {
  const provider = new WsProvider(WS, 10000, undefined, 60000);
  const api = await ApiPromise.create({ provider, noInitWarn: true });
  await api.isReady;
  const mods = Object.keys(api.query as any);
  console.log("modules:", mods.join(", "));
  const target = mods.find((m) => m.toLowerCase().includes("subtensor")) ?? mods.find((m) => m.toLowerCase().includes("subnet"));
  console.log("target:", target);
  if (target) {
    const keys = Object.keys((api.query as any)[target]);
    console.log("storage count:", keys.length);
    console.log(keys.filter(k => /key|incentive|emission|active|uid/i.test(k)).join(", "));
  }
  await api.disconnect();
  process.exit(0);
}
main().catch((e) => { console.error("fatal:", e); process.exit(1); });
