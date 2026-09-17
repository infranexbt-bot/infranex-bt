import { ApiPromise, WsProvider } from "@polkadot/api";
import { readFileSync, existsSync } from "node:fs";

const WS_URL = "wss://entrypoint-finney.opentensor.ai:443";
const META_FILE = "/home/z/my-project/infranex-bt/.chain-metadata.json";

async function main() {
  const opts: Record<string, unknown> = {};
  if (existsSync(META_FILE)) opts.metadata = JSON.parse(readFileSync(META_FILE, "utf8"));
  const api = await ApiPromise.create({ provider: new WsProvider(WS_URL, 4000, undefined, 60_000), noInitWarn: true, throwOnConnect: true, ...opts });

  const mods = api.query.subtensorModule as unknown as Record<string, { multi: (k: unknown[]) => Promise<unknown[]> }>;
  const keys = Array.from({ length: 10 }, (_, uid) => [1, uid] as [number, number]);

  for (const map of ["active", "incentive", "consensus", "emission", "dividends", "validatorTrust", "lastUpdate"]) {
    try {
      const vals = await mods[map].multi(keys);
      const sample = vals.slice(0, 4).map((v) => {
        const o = v as { isEmpty: boolean; toString(): string };
        return `${o.isEmpty ? "EMPTY" : o.toString()}`;
      });
      console.log(`${map}: ${sample.join(" | ")}`);
    } catch (e) {
      console.log(`${map}: ERROR ${(e as Error).message.slice(0, 80)}`);
    }
  }
  await api.disconnect();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", (e as Error).message); process.exit(1); });
