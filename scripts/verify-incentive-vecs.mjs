// Verify incentive/emission vecs for suspicious subnets straight from the chain.
import { ApiPromise, WsProvider } from "@polkadot/api";

const WS_URL = "wss://entrypoint-finney.opentensor.ai:443";

async function main() {
  const api = await ApiPromise.create({ provider: new WsProvider(WS_URL), noInitWarn: true });
  const mods = api.query.subtensorModule;
  const netuids = [0, 1, 4, 9, 51, 56, 64, 107];

  for (const n of netuids) {
    try {
      const [inc, em, div, subnN] = await Promise.all([
        mods.incentive(n),
        mods.emission(n),
        mods.dividends(n),
        mods.subnetworkN(n),
      ]);
      const incJ = inc.toJSON();
      const emJ = em.toJSON();
      const divJ = div.toJSON();
      const incArr = Array.isArray(incJ) ? incJ : [];
      const emArr = Array.isArray(emJ) ? emJ : [];
      const divArr = Array.isArray(divJ) ? divJ : [];
      const incNonzero = incArr.filter((x) => Number(x) > 0).length;
      const incSum = incArr.reduce((a, b) => a + Number(b), 0);
      const emNonzero = emArr.filter((x) => Number(x) > 0).length;
      const divNonzero = divArr.filter((x) => Number(x) > 0).length;
      const top10 = (() => {
        if (incSum <= 0) return null;
        const sorted = [...incArr].sort((a, b) => b - a);
        const topN = Math.max(1, Math.ceil(sorted.length * 0.1));
        return (sorted.slice(0, topN).reduce((a, b) => a + Number(b), 0) / incSum).toFixed(3);
      })();
      console.log(
        `SN${String(n).padStart(3)} neurons=${subnN.toString().padStart(4)} len(inc)=${incArr.length} inc>0=${incNonzero} incSum=${incSum} em>0=${emNonzero} div>0=${divNonzero} top10=${top10}`
      );
      // show top few incentive values
      const top = [...incArr].sort((a, b) => b - a).slice(0, 5);
      console.log("        top inc vals:", top.join(","));
    } catch (e) {
      console.log(`SN${n} ERROR ${e.message}`);
    }
  }
  await api.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
