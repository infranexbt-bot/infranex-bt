import { ApiPromise, WsProvider } from "@polkadot/api";
import { readFileSync, existsSync } from "node:fs";

const WS_URL = "wss://entrypoint-finney.opentensor.ai:443";
const META_FILE = "/home/z/my-project/infranex-bt/.chain-metadata.json";

async function main() {
  const opts: Record<string, unknown> = {};
  if (existsSync(META_FILE)) opts.metadata = JSON.parse(readFileSync(META_FILE, "utf8"));
  const api = await ApiPromise.create({ provider: new WsProvider(WS_URL, 4000, undefined, 60_000), noInitWarn: true, throwOnConnect: true, ...opts });

  const mods = api.query.subtensorModule as unknown as Record<string, (n: number) => Promise<{ toHuman?: () => unknown; toJSON?: () => unknown }>>;
  const t = Date.now();
  const [active, incentive, emission, lastUpdate] = await Promise.all([
    mods.active(1), mods.incentive(1), mods.emission(1), mods.lastUpdate(1),
  ]);
  console.log(`4 maps for subnet 1: ${(Date.now() - t) / 1000}s`);

  const act = active.toJSON?.() as number[] | boolean[];
  const inc = incentive.toJSON?.() as number[];
  const emi = emission.toJSON?.() as (number | string)[];
  const last = lastUpdate.toJSON?.() as (number | string)[];
  console.log("active len:", act?.length, "sample:", JSON.stringify(act?.slice(0, 10)));
  console.log("incentive len:", inc?.length, "sample:", JSON.stringify(inc?.slice(0, 8)));
  console.log("emission len:", emi?.length, "sample:", JSON.stringify(emi?.slice(0, 4)));
  console.log("lastUpdate len:", last?.length, "sample:", JSON.stringify(last?.slice(0, 4)));

  await api.disconnect();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", (e as Error).message.slice(0, 200)); process.exit(1); });
