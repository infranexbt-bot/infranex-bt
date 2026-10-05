// Debug: dump raw chain identity for SN105 without Option assumptions.
import { ApiPromise, WsProvider } from "@polkadot/api";

const API_URL = "wss://entrypoint-finney.opentensor.ai:443";

async function main() {
  const provider = new WsProvider(API_URL);
  const api = await ApiPromise.create({ provider });

  const entries = await api.query.subnetModule.subnetIdentitiesV3.entries();
  console.log("entries:", entries.length);
  for (const [key, val] of entries) {
    const netuid = key.args[0].toNumber();
    if (netuid !== 105) continue;
    try { console.log("SN105 value:", JSON.stringify(val.toHuman(), null, 2).slice(0, 1200)); }
    catch (e) { console.log("toHuman err", String(e)); }
  }
  if (entries.length === 0) {
    console.log("storage methods:", Object.keys(api.query.subnetModule || {}).filter(k => /identity|name/i.test(k)));
    const v = await api.query.subnetModule.subnetIdentitiesV3(105);
    console.log("direct SN105:", JSON.stringify(v.toHuman(), null, 2)?.slice(0, 1200));
  }
  await api.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
