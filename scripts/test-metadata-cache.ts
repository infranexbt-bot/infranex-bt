import { ApiPromise, WsProvider, HttpProvider } from "@polkadot/api";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const WS_URL = "wss://entrypoint-finney.opentensor.ai:443";
const RPC_URL = "https://entrypoint-finney.opentensor.ai/rpc";
const META_FILE = "/home/z/my-project/infranex-bt/.chain-metadata.json";

async function connect(opts: Record<string, unknown>, label: string): Promise<ApiPromise> {
  const s = Date.now();
  const provider = new WsProvider(WS_URL, 4000, undefined, 60_000);
  const api = await ApiPromise.create({ provider, noInitWarn: true, throwOnConnect: true, ...opts });
  console.log(`${label}: ${(Date.now() - s) / 1000}s`);
  return api;
}

async function main() {
  // Step 1: connect fresh, save metadata
  let api: ApiPromise;
  if (existsSync(META_FILE)) {
    console.log("metadata file exists, testing cached path");
    const stored = JSON.parse(readFileSync(META_FILE, "utf8")) as Record<string, string>;
    const key = Object.keys(stored)[0];
    console.log("key:", key.slice(0, 30), "size:", Math.round(stored[key].length / 1024), "KB");
    api = await connect({ metadata: stored }, "create with cached metadata");
  } else {
    api = await connect({}, "fresh create");
    const key = `${api.genesisHash.toHex()}-${api.runtimeVersion.specVersion}`;
    const metaHex = api.runtimeMetadata.toHex();
    writeFileSync(META_FILE, JSON.stringify({ [key]: metaHex }));
    console.log("saved metadata:", Math.round(metaHex.length / 1024), "KB, key:", key.slice(0, 30));
    await api.disconnect();
    api = await connect({ metadata: JSON.parse(readFileSync(META_FILE, "utf8")) }, "create with cached metadata");
  }

  const h = await api.rpc.chain.getHeader();
  console.log("block:", h.number.toNumber(), "connected:", api.isConnected);

  // Test metagraph storage
  const t = Date.now();
  try {
    const mg = (await api.query.subtensorModule.metagraph(1)) as unknown as Record<string, unknown> & {
      uids?: { length: number };
      ranking?: { toJSON: () => unknown };
    };
    console.log(`metagraph(1): ${(Date.now() - t) / 1000}s`);
    console.log("uids:", mg.uids?.length);
    const rk = mg.ranking?.toJSON?.() as number[] | undefined;
    console.log("ranking[0..4]:", rk?.slice(0, 4));
    console.log("keys:", Object.keys(mg).join(","));
  } catch (e) {
    console.log("metagraph failed:", e instanceof Error ? e.message.slice(0, 150) : e);
  }

  await api.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
