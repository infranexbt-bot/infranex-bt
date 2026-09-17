// Probe Finney chain metadata: find subnet-level emission storage, subnet
// names, and available runtime APIs. Read-only, no mutations.
import { ApiPromise, WsProvider } from "@polkadot/api";
import { readFileSync } from "node:fs";

const METADATA_FILE = "/home/z/my-project/infranex-bt/.chain-metadata.json";
const WS_URL = "wss://entrypoint-finney.opentensor.ai:443";

function loadCachedMetadata() {
  try {
    if (readFileSync(METADATA_FILE, "utf8")) return JSON.parse(readFileSync(METADATA_FILE, "utf8"));
  } catch { return null; }
  return null;
}

const provider = new WsProvider(WS_URL, 4000, undefined, 60_000);
const api = await ApiPromise.create({
  provider,
  noInitWarn: true,
  throwOnConnect: true,
  metadata: loadCachedMetadata(),
});

const metaRaw = await api.rpc.state.getMetadata();
const meta = metaRaw.asLatest;
const pallet = meta.pallets.find((p) => p.name.toString() === "SubtensorModule");
const storage = pallet.storage.unwrap();
const names = storage.items.map((i) => i.name.toString());
console.log("=== SubtensorModule storage entries ===");
console.log(names.join(", "));

// Interesting candidates for emission / names
const interesting = names.filter((n) =>
  /emission|name|issuance|pending|block|stake|alpha/i.test(n)
);
console.log("\n=== Emission/name candidates ===");
console.log(interesting.join(", "));

// Runtime APIs available via api.call
console.log("\n=== Runtime API namespaces (api.call) ===");
console.log(Object.keys(api.call).join(", "));
for (const ns of Object.keys(api.call)) {
  const methods = Object.keys(api.call[ns] ?? {});
  const relevant = methods.filter((m) => /subnet|emission|info|name/i.test(m));
  if (relevant.length) console.log(`  ${ns}: ${relevant.join(", ")}`);
}

// Try to read subnet-level emission a few ways for a sample of netuids
const sample = [1, 2, 3, 42, 100];
const mods = api.query.subtensorModule;

// 1. If `emission` is a StorageValue<Vec<u64>> indexed by netuid
try {
  const v = await mods.emission();
  const json = v.toJSON();
  console.log("\nemission() as StorageValue ->", Array.isArray(json) ? `Vec len=${json.length}` : json);
  if (Array.isArray(json)) {
    console.log("  [1,2,3,42,100] =", sample.map((i) => json[i]));
  }
} catch (e) {
  console.log("\nemission() as StorageValue failed:", e.message?.slice(0, 120));
}

// 2. If `emission` is a StorageMap<u16,u64>
try {
  const arr = await mods.emission.multi(sample);
  console.log("emission.multi(sample) ->", arr.map((x) => x.toString()));
} catch (e) {
  console.log("emission.multi failed:", e.message?.slice(0, 120));
}

// 3. Pending emission variants
for (const key of ["pendingEmission", "subnetEmission", "subnetPendingEmission", "blockEmission"]) {
  if (mods[key]) {
    try {
      const v = await mods[key]();
      const json = v.toJSON?.();
      console.log(`${key}() ->`, Array.isArray(json) ? `Vec len=${json.length} sample=${sample.map(i=>json[i])}` : json);
    } catch (e) {
      console.log(`${key}() failed:`, e.message?.slice(0, 120));
    }
  }
}

// 4. Subnet names if available on chain
for (const key of ["subnetNames", "subnetName", "names", "networkName"]) {
  if (mods[key]) {
    try {
      const arr = await mods[key].multi(sample);
      console.log(`${key}.multi(sample) ->`, arr.map((x) => x.toString()));
    } catch (e) {
      console.log(`${key} failed:`, e.message?.slice(0, 120));
    }
  }
}

// 5. Try SubnetInfo runtime API for one subnet — often includes emission + name
try {
  const info = await api.call.subnetInfoRuntimeApi.getSubnetInfo(1);
  console.log("\ngetSubnetInfo(1) human:", JSON.stringify(info.toHuman(), null, 1).slice(0, 1200));
} catch (e) {
  console.log("\ngetSubnetInfo failed:", e.message?.slice(0, 200));
}

// 6. getSubnetsInfo — all subnets in one call
try {
  const all = await api.call.subnetInfoRuntimeApi.getSubnetsInfo();
  console.log("getSubnetsInfo() length:", all.length);
  if (all.length > 0) {
    console.log("first entry:", JSON.stringify(all[0].toHuman(), null, 1).slice(0, 1200));
  }
} catch (e) {
  console.log("getSubnetsInfo failed:", e.message?.slice(0, 200));
}

await api.disconnect();
process.exit(0);
