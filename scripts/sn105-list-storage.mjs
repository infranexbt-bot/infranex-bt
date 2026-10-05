// Find identity storage across modules (plain JS).
import { ApiPromise, WsProvider } from "@polkadot/api";

const API_URL = "wss://entrypoint-finney.opentensor.ai:443";

async function main() {
  const provider = new WsProvider(API_URL, 10000, undefined, 60000);
  const api = await ApiPromise.create({ provider, noInitWarn: true });
  await api.isReady;

  const modules = Object.keys(api.query);
  console.log("modules:", modules.filter((m) => /subnet|tensor|admin/i.test(m)).join(", "));

  for (const mod of ["subtensorModule", "subnetModule", "adminModule"]) {
    const m = api.query[mod] || {};
    const keys = Object.keys(m);
    const hits = keys.filter((k) => /ident/i.test(k));
    if (hits.length) console.log(mod, "identity-ish:", hits.join(", "));
  }

  const sm = api.query.subtensorModule || {};
  if (sm.subnetIdentitiesV3) {
    const v = await sm.subnetIdentitiesV3(105);
    console.log("SN105 identity:", JSON.stringify(v.toHuman(), null, 2).slice(0, 1500));
  } else {
    console.log("no subnetIdentitiesV3; name-ish keys:",
      Object.keys(sm).filter((k) => /ident|name/i.test(k)).join(", "));
  }
  await api.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
