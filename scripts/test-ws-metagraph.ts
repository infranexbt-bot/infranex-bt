import { ApiPromise, WsProvider, HttpProvider } from "@polkadot/api";

const WS_URL = "wss://entrypoint-finney.opentensor.ai:443";
const RPC_URL = "https://entrypoint-finney.opentensor.ai/rpc";

async function testWs() {
  console.log("--- WS provider test ---");
  const s = Date.now();
  try {
    const provider = new WsProvider(WS_URL, 5000, undefined, 60_000);
    const api = await ApiPromise.create({ provider, noInitWarn: true, throwOnConnect: true });
    console.log(`WS ApiPromise.create: ${(Date.now() - s) / 1000}s, connected: ${api.isConnected}`);
    const h = await api.rpc.chain.getHeader();
    console.log("WS block:", h.number.toNumber());
    await api.disconnect();
    return true;
  } catch (e) {
    console.log("WS failed:", e instanceof Error ? e.message.slice(0, 200) : e);
    return false;
  }
}

async function testMetagraphOverHttp() {
  console.log("--- metagraph over HTTP ---");
  const s = Date.now();
  const provider = new HttpProvider(RPC_URL);
  const api = await ApiPromise.create({ provider, noInitWarn: true, throwOnConnect: true });
  console.log(`HTTP create: ${(Date.now() - s) / 1000}s`);
  const t = Date.now();
  const mg = (await api.query.subtensorModule.metagraph(1)) as unknown as {
    uids: { length: number };
    ranking: { toJSON: () => unknown };
    incentive: unknown;
    trust: unknown;
    emission: unknown;
    consensus: unknown;
    validatorTrust: unknown;
    dividends: unknown;
    hotkeys: unknown;
  };
  console.log(`metagraph(1): ${(Date.now() - t) / 1000}s, uids: ${mg.uids?.length}`);
  const rankArr = mg.ranking?.toJSON?.() as number[] | undefined;
  console.log("ranking sample:", rankArr?.slice(0, 5));
  console.log("fields:", Object.keys(mg as unknown as object).slice(0, 20).join(","));
  await api.disconnect();
}

async function main() {
  const wsOk = await testWs();
  if (!wsOk) await testMetagraphOverHttp();
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
