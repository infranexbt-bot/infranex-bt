import { ApiPromise, HttpProvider } from "@polkadot/api";

const RPC_URL = "https://entrypoint-finney.opentensor.ai/rpc";
const t = (label: string, start: number) => console.log(`${label}: ${(Date.now() - start) / 1000}s`);

async function main() {
  const s0 = Date.now();
  const provider = new HttpProvider(RPC_URL);
  console.log("connecting...");
  const api = await ApiPromise.create({ provider, noInitWarn: true, throwOnConnect: true });
  t("ApiPromise.create", s0);

  const s1 = Date.now();
  const header = await api.rpc.chain.getHeader();
  t("getHeader", s1);
  console.log("block:", header.number.toNumber());

  const s2 = Date.now();
  const totalNetworks = await api.query.subtensorModule.totalNetworks();
  t("totalNetworks", s2);
  const total = Number(totalNetworks.toString());
  console.log("total subnets:", total);

  const mods = api.query.subtensorModule as never as Record<
    string,
    { multi: (keys: unknown[]) => Promise<unknown[]> }
  >;

  // Test one .multi() batch of 50
  const batch = Array.from({ length: 50 }, (_, i) => i);
  const s3 = Date.now();
  try {
    const miners = await mods.subnetworkN.multi(batch);
    t("subnetworkN.multi(50)", s3);
    console.log("sample:", miners.slice(0, 5).map((m) => m.toString()));
  } catch (e) {
    t("subnetworkN.multi(50) FAILED", s3);
    console.log("error:", e instanceof Error ? e.message : e);
  }

  // Test 7 parallel .multi() batches of 50
  const s4 = Date.now();
  try {
    await Promise.all([
      mods.subnetworkN.multi(batch),
      mods.subnetTAO.multi(batch),
      mods.subnetAlphaIn.multi(batch),
      mods.subnetAlphaOut.multi(batch),
      mods.tempo.multi(batch),
      mods.subnetEmissionEnabled.multi(batch),
      mods.subnetMovingPrice.multi(batch),
    ]);
    t("7 parallel .multi(50)", s4);
  } catch (e) {
    t("7 parallel .multi(50) FAILED", s4);
    console.log("error:", e instanceof Error ? e.message : e);
  }

  // Test neuron batch: rank.multi([[netuid, uid] x 50])
  const keys = Array.from({ length: 50 }, (_, uid) => [1, uid] as [number, number]);
  const s5 = Date.now();
  try {
    const ranks = await mods.rank.multi(keys);
    t("rank.multi(50 tuples)", s5);
    const nonEmpty = ranks.filter((r) => !("isEmpty" in (r as object) && (r as { isEmpty: boolean }).isEmpty)).length;
    console.log("non-empty ranks:", nonEmpty);
  } catch (e) {
    t("rank.multi(50 tuples) FAILED", s5);
    console.log("error:", e instanceof Error ? e.message : e);
  }

  await api.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
