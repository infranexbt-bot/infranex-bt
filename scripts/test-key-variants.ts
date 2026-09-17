import { ApiPromise, WsProvider } from "@polkadot/api";
import { readFileSync, existsSync } from "node:fs";

const WS_URL = "wss://entrypoint-finney.opentensor.ai:443";
const META_FILE = "/home/z/my-project/infranex-bt/.chain-metadata.json";

async function main() {
  const opts: Record<string, unknown> = {};
  if (existsSync(META_FILE)) opts.metadata = JSON.parse(readFileSync(META_FILE, "utf8"));
  const api = await ApiPromise.create({ provider: new WsProvider(WS_URL, 4000, undefined, 60_000), noInitWarn: true, throwOnConnect: true, ...opts });

  const mods = api.query.subtensorModule as unknown as Record<string, {
    (a?: unknown, b?: unknown): Promise<unknown>;
    multi: (keys: unknown) => Promise<unknown[]>;
    entries: (a?: unknown) => Promise<[unknown, unknown][]>;
    entriesPaged: (o: unknown) => Promise<[unknown, unknown][]>;
  }>;

  const tryIt = async (label: string, fn: () => Promise<unknown>) => {
    try {
      const r = await fn();
      const arr = Array.isArray(r) ? r : [r];
      const first = arr[0] as { isEmpty?: boolean; toString(): string } | undefined;
      console.log(`${label}: OK (${arr.length} items), first: ${first ? (first.isEmpty ? "EMPTY" : first.toString().slice(0, 20)) : "none"}`);
      return true;
    } catch (e) {
      console.log(`${label}: FAIL ${(e as Error).message.slice(0, 100)}`);
      return false;
    }
  };

  await tryIt("single active(1, 0)", () => mods.active(1, 0));
  await tryIt("single active([1, 0])", () => mods.active([1, 0]));
  await tryIt("multi active([[1,0],[1,1]])", () => mods.multi ? mods.active.multi([[1, 0], [1, 1]]) : Promise.reject(new Error("no multi")));
  await tryIt("multi active([1,0]) flat", () => mods.active.multi([1, 0]));
  await tryIt("entries active([1])", () => mods.active.entries([1]));
  await tryIt("entriesPaged active args [1]", () => mods.active.entriesPaged({ args: [1], pageSize: 20 }));

  await api.disconnect();
  process.exit(0);
}
main().catch((e) => { console.error("FATAL:", (e as Error).message.slice(0, 200)); process.exit(1); });
