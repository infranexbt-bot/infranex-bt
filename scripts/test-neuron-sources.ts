import { ApiPromise, WsProvider } from "@polkadot/api";
import { readFileSync, existsSync } from "node:fs";

const WS_URL = "wss://entrypoint-finney.opentensor.ai:443";
const META_FILE = "/home/z/my-project/infranex-bt/.chain-metadata.json";

async function main() {
  const opts: Record<string, unknown> = {};
  if (existsSync(META_FILE)) {
    opts.metadata = JSON.parse(readFileSync(META_FILE, "utf8"));
  }
  const provider = new WsProvider(WS_URL, 4000, undefined, 60_000);
  const api = await ApiPromise.create({ provider, noInitWarn: true, throwOnConnect: true, ...opts });

  console.log("--- subtensorModule query sections ---");
  const sub = api.query.subtensorModule as unknown as Record<string, unknown>;
  console.log(Object.keys(sub).filter((k) => /rank|trust|incentive|consensus|dividend|emission|neuron|metagraph|uid|stake|active|lastupdate/i.test(k)).join(", ") || "(none matched)");

  console.log("--- api.call sections ---");
  const call = api.call as unknown as Record<string, Record<string, unknown>>;
  for (const [section, methods] of Object.entries(call)) {
    if (/subtensor|metagraph/i.test(section)) {
      console.log(section, "->", Object.keys(methods).join(", "));
    }
  }

  // Try metagraph runtime api
  try {
    const t = Date.now();
    const mg = await (api.call as unknown as Record<string, Record<string, (n: number) => Promise<Record<string, { length?: number }>>>>).subtensorModuleRuntimeApi.metagraph(1);
    console.log(`metagraph(1) via runtime api: ${(Date.now() - t) / 1000}s`);
    console.log("keys:", Object.keys(mg).join(","));
    const rankArr = mg.ranking as { length?: number };
    console.log("ranking length:", rankArr?.length);
  } catch (e) {
    console.log("runtime api metagraph failed:", e instanceof Error ? e.message.slice(0, 120) : e);
  }

  await api.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
