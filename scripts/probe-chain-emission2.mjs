// Probe v2: confirm emission units, subnet identities, dynamic info fields.
import { ApiPromise, WsProvider } from "@polkadot/api";
import { readFileSync } from "node:fs";

const METADATA_FILE = "/home/z/my-project/infranex-bt/.chain-metadata.json";
const WS_URL = "wss://entrypoint-finney.opentensor.ai:443";

function loadCachedMetadata() {
  try { return JSON.parse(readFileSync(METADATA_FILE, "utf8")); } catch { return null; }
}

const provider = new WsProvider(WS_URL, 4000, undefined, 60_000);
const api = await ApiPromise.create({
  provider, noInitWarn: true, throwOnConnect: true, metadata: loadCachedMetadata(),
});

const mods = api.query.subtensorModule;
const allNetuids = Array.from({ length: 129 }, (_, i) => i);

// 1. Per-neuron emission vecs for ALL subnets (batched) + Active + Incentive + Dividends for subnet 1 only
const t0 = Date.now();
const emissionVecs = await mods.emission.multi(allNetuids);
console.log(`Emission.multi(129) took ${Date.now() - t0}ms`);

// 2. Subnet-level alpha emission maps
const [alphaInEmis, alphaOutEmis, taoInEmis, tempos, nCount] = await Promise.all([
  mods.subnetAlphaInEmission.multi(allNetuids),
  mods.subnetAlphaOutEmission.multi(allNetuids),
  mods.subnetTaoInEmission.multi(allNetuids),
  mods.tempo.multi(allNetuids),
  mods.subnetworkN.multi(allNetuids),
]);

const rao = (x) => Number(x?.toString() ?? "0") || 0;
console.log("\nnetuid | tempo | N | alphaInEmis(TAO) | alphaOutEmis(TAO) | sumEmissionVec(TAO) | ratio(vec/alphaOut)");
for (const i of [0, 1, 2, 3, 5, 8, 18, 42, 64, 100]) {
  const vec = emissionVecs[i]?.toJSON?.() ?? [];
  const sumVec = vec.reduce((a, b) => a + (Number(b) || 0), 0) / 1e9;
  const ao = rao(alphaOutEmis[i]) / 1e9;
  const ai = rao(alphaInEmis[i]) / 1e9;
  const tempo = rao(tempos[i]);
  const n = rao(nCount[i]);
  const ratio = ao > 0 ? (sumVec / ao).toFixed(2) : "n/a";
  console.log(`${String(i).padStart(3)} | ${tempo} | ${n} | ${ai.toFixed(4)} | ${ao.toFixed(4)} | ${sumVec.toFixed(4)} | ${ratio}`);
}

// totals
let totalAO = 0, totalVec = 0;
for (let i = 0; i < 129; i++) {
  totalAO += rao(alphaOutEmis[i]) / 1e9;
  const vec = emissionVecs[i]?.toJSON?.() ?? [];
  totalVec += vec.reduce((a, b) => a + (Number(b) || 0), 0) / 1e9;
}
console.log(`\nTOTAL alphaOutEmission: ${totalAO.toFixed(4)} TAO (per block?) | total sum(Emission vecs): ${totalVec.toFixed(4)} TAO`);

// 3. Subnet identities (names on chain!)
try {
  const identities = await mods.subnetIdentitiesV3.multi(allNetuids);
  let named = 0;
  console.log("\n=== SubnetIdentitiesV3 (first 12 with data) ===");
  for (let i = 0; i < 129 && named < 12; i++) {
    const id = identities[i];
    if (id && !id.isEmpty) {
      const h = id.toHuman();
      console.log(`netuid ${i}:`, JSON.stringify(h).slice(0, 300));
      named++;
    }
  }
  const withData = identities.filter((x) => x && !x.isEmpty).length;
  console.log(`subnets with on-chain identity: ${withData}/129`);
} catch (e) {
  console.log("SubnetIdentitiesV3 failed:", e.message?.slice(0, 150));
}

// 4. getAllDynamicInfo — check fields
try {
  const t1 = Date.now();
  const dyn = await api.call.subnetInfoRuntimeApi.getAllDynamicInfo();
  console.log(`\ngetAllDynamicInfo took ${Date.now() - t1}ms, len=${dyn.length}`);
  const h = dyn[1]?.toHuman();
  console.log("DynamicInfo[1]:", JSON.stringify(h, null, 1).slice(0, 900));
} catch (e) {
  console.log("getAllDynamicInfo failed:", e.message?.slice(0, 200));
}

// 5. For subnet 1: check Incentive/Dividends split to derive miner vs validator emission
const [inc1, div1] = await Promise.all([mods.incentive(1), mods.dividends(1)]);
const incArr = inc1.toJSON?.() ?? [];
const divArr = div1.toJSON?.() ?? [];
const emArr = emissionVecs[1]?.toJSON?.() ?? [];
let minerEm = 0, validatorEm = 0, rewardingMiners = 0, validators = 0;
for (let u = 0; u < emArr.length; u++) {
  const e = Number(emArr[u]) || 0;
  const inc = Number(incArr[u]) || 0;
  const div = Number(divArr[u]) || 0;
  if (inc > 0 && e > 0) { minerEm += e; rewardingMiners++; }
  if (div > 0 && e > 0) { validatorEm += e; validators++; }
}
console.log(`\nSubnet 1: minerEmission=${(minerEm / 1e9).toFixed(4)} TAO (epoch), validatorEmission=${(validatorEm / 1e9).toFixed(4)}, rewardingMiners=${rewardingMiners}, validators=${validators}`);
const tempo1 = rao(tempos[1]);
const ao1 = rao(alphaOutEmis[1]) / 1e9;
console.log(`alphaOutEmis(1)=${ao1.toFixed(6)} TAO; epoch sum=${(minerEm / 1e9 + validatorEm / 1e9).toFixed(4)}; alphaOut*tempo=${(ao1 * tempo1).toFixed(4)}; alphaOut*720=${(ao1 * 720).toFixed(4)}`);

await api.disconnect();
process.exit(0);
