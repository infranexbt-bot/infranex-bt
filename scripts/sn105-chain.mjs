
import { ApiPromise, WsProvider } from "@polkadot/api";

const API_URL = "wss://entrypoint-finney.opentensor.ai:443";
const NETUIDS = [105, 64, 96, 4];

async function main() {
  const provider = new WsProvider(API_URL);
  const api = await ApiPromise.create({ provider });
  const out = [];
  for (const n of NETUIDS) {
    try {
      const identity = await api.query.subnetModule.subnetIdentitiesV3(n);
      const id = identity.isSome ? identity.unwrap().toHuman() : null;
      const name = await api.query.subnetModule.subnetNames(n);
      out.push({
        netuid: n,
        name: name.isSome ? name.unwrap().toHuman() : null,
        identity: id,
      });
    } catch (e) { out.push({ netuid: n, error: String(e) }); }
  }
  console.log(JSON.stringify(out, null, 2));
  await api.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
