// Probe v3: decode identity names properly + understand Active vec semantics.
import { ApiPromise, WsProvider } from "@polkadot/api";
import { readFileSync } from "node:fs";

const METADATA_FILE = "/home/z/my-project/infranex-bt/.chain-metadata.json";
function loadCachedMetadata() {
  try { return JSON.parse(readFileSync(METADATA_FILE, "utf8")); } catch { return null; }
}
const provider = new WsProvider("wss://entrypoint-finney.opentensor.ai:443", 4000, undefined, 60_000);
const api = await ApiPromise.create({
  provider, noInitWarn: true, throwOnConnect: true, metadata: loadCachedMetadata(),
});
const mods = api.query.subtensorModule;

// 1. Identity name decoding for a few netuids
const ids = await mods.subnetIdentitiesV3.multi([1, 42, 64]);
for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  if (id && !id.isEmpty) {
    const v = id.unwrap();
    const nameField = v.subnetName;
    console.log(`netuid ${[1,42,64][i]}: toString=${String(nameField).slice(0, 30)} | toHuman=${JSON.stringify(nameField.toHuman())} | isVec=${Array.isArray(nameField.toHuman())}`);
    // Vec<u8> → try toUtf8 / hex decode
    try { console.log("  toUtf8:", nameField.toUtf8()); } catch (e) { console.log("  toUtf8 failed:", e.message?.slice(0, 80)); }
  }
}

// 2. Active/incentive/emission/dividends for subnet 64 (Chutes — known busy)
const [act64, inc64, em64, div64, vp64] = await Promise.all([
  mods.active(64), mods.incentive(64), mods.emission(64), mods.dividends(64), mods.validatorPermit(64),
]);
const act = act64.toJSON?.() ?? [];
const inc = inc64.toJSON?.() ?? [];
const em = em64.toJSON?.() ?? [];
const div = div64.toJSON?.() ?? [];
const vp = vp64.toJSON?.() ?? [];
const cnt = (arr, f) => arr.filter(f).length;
console.log(`\nsubnet 64 vec lens: active=${act.length} inc=${inc.length} em=${em.length} div=${div.length} vpermit=${vp.length}`);
console.log(`active=true: ${cnt(act, Boolean)}, inc>0: ${cnt(inc, x => Number(x) > 0)}, em>0: ${cnt(em, x => Number(x) > 0)}, div>0: ${cnt(div, x => Number(x) > 0)}, vpermit=true: ${cnt(vp, Boolean)}`);
// active && !vpermit = active miners
let activeMiners = 0, activeVals = 0;
for (let u = 0; u < act.length; u++) {
  if (act[u]) { if (vp[u]) activeVals++; else activeMiners++; }
}
console.log(`active && !vpermit (miners): ${activeMiners} | active && vpermit (validators): ${activeVals}`);
console.log(`sum emission: ${(em.reduce((a,b)=>a+Number(b||0),0)/1e9).toFixed(3)} TAO alpha`);
console.log(`first 20 active flags: ${act.slice(0,20).map(x=>x?1:0).join("")}`);

await api.disconnect();
process.exit(0);
