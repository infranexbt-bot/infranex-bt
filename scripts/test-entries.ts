import { ApiPromise, WsProvider } from "@polkadot/api";
import { readFileSync, existsSync } from "node:fs";

const WS_URL = "wss://entrypoint-finney.opentensor.ai:443";
const META_FILE = "/home/z/my-project/infranex-bt/.chain-metadata.json";

async function main() {
  const opts: Record<string, unknown> = {};
  if (existsSync(META_FILE)) opts.metadata = JSON.parse(readFileSync(META_FILE, "utf8"));
  const api = await ApiPromise.create({ provider: new WsProvider(WS_URL, 4000, undefined, 60_000), noInitWarn: true, throwOnConnect: true, ...opts });

  const mods = api.query.subtensorModule as unknown as Record<string, { entries: (a: unknown) => Promise<[unknown, unknown][]> }>;
  const t = Date.now();
  const [actives, incentives] = await Promise.all([
    mods.active.entries(1),
    mods.incentive.entries(1),
  ]);
  console.log(`entries(1) active+incentive: ${(Date.now() - t) / 1000}s, counts: ${actives.length}/${incentives.length}`);

  // Decode a key to inspect structure
  const first = actives[0];
  if (first) {
    const [key, val] = first;
    const args = (key as { args: unknown[] }).args;
    console.log("key args:", JSON.stringify(args));
    console.log("value isEmpty:", (val as { isEmpty: boolean }).isEmpty, "toString:", (val as { toString(): string }).toString());
  }
  const activeNonEmpty = actives.filter(([, v]) => !(v as { isEmpty: boolean }).isEmpty).length;
  const incNonEmpty = incentives.filter(([, v]) => !(v as { isEmpty: boolean }).isEmpty).length;
  console.log("non-empty: active", activeNonEmpty, "/ incentive", incNonEmpty);

  await api.disconnect();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", (e as Error).message.slice(0, 200)); process.exit(1); });
