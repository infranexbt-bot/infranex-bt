import { ApiPromise, WsProvider } from "@polkadot/api";
import { readFileSync, existsSync } from "node:fs";

const WS_URL = "wss://entrypoint-finney.opentensor.ai:443";
const META_FILE = "/home/z/my-project/infranex-bt/.chain-metadata.json";

async function main() {
  const opts: Record<string, unknown> = {};
  if (existsSync(META_FILE)) opts.metadata = JSON.parse(readFileSync(META_FILE, "utf8"));
  const api = await ApiPromise.create({ provider: new WsProvider(WS_URL, 4000, undefined, 60_000), noInitWarn: true, throwOnConnect: true, ...opts });

  for (const name of ["active", "incentive"]) {
    const entry = (api.query.subtensorModule as unknown as Record<string, { meta: { type: unknown } }>)[name];
    const meta = entry.meta as { type: { asDoubleMap?: unknown; asNMap?: { keys: unknown } ; asMap?: unknown } };
    console.log(name, "type kind:", JSON.stringify(meta.type, null, 1).slice(0, 300));
  }
  await api.disconnect();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", (e as Error).message.slice(0, 200)); process.exit(1); });
