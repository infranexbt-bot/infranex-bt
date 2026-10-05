// Diff scan: for ALL subnets, compare old classifier rule vs proposed
// bandwidth→CPU rule. Fetch identities from chain, apply both rule sets.
import { ApiPromise, WsProvider } from "@polkadot/api";

const API_URL = "wss://entrypoint-finney.opentensor.ai:443";

// Words that MUST stay GPU even if 'bandwidth' appears (GPU-work subnets
// that merely mention bandwidth in passing).
const GPU_GUARD = /\b(gpu|inference|llm|training|video|image|render|diffusion|model)\b/i;

async function main() {
  const provider = new WsProvider(API_URL, 10000, undefined, 60000);
  const api = await ApiPromise.create({ provider, noInitWarn: true });
  await api.isReady;

  const entries = await api.query.subtensorModule.subnetIdentitiesV3.entries();
  const rows = [];
  for (const [key, val] of entries) {
    const netuid = key.args[0].toNumber();
    const id = val.toHuman() || {};
    const name = id.subnetName || "";
    const desc = id.description || "";
    const text = `${name} ${desc}`;

    // OLD: first-match rule list (abridged to the rules that can fire here)
    const oldBandwidth = /\b(compute|gpu|depin|edge|latency|bandwidth|network shar)\b/i.test(text);
    // NEW: bandwidth/dePIN-specific rule BEFORE compute-sharing, with GPU guard
    const newBandwidth =
      /\b(bandwidth|network shar|depin)\b/i.test(text) && !GPU_GUARD.test(text);

    if (oldBandwidth || newBandwidth) {
      rows.push({ netuid, name: name || `SN${netuid}`, desc: desc.slice(0, 90), oldBandwidth, newBandwidth });
    }
  }
  console.log("subnets hitting the compute/bandwidth bucket:\n");
  for (const r of rows) {
    const change = r.oldBandwidth !== r.newBandwidth ? "  <-- CHANGES" : "";
    console.log(`SN${r.netuid} ${r.name} | old(compute-share→4090): ${r.oldBandwidth} | new(bandwidth→CPU): ${r.newBandwidth}${change}`);
    console.log(`        "${r.desc}"`);
  }
  await api.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
