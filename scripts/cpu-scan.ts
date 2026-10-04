/**
 * CPU subnet earnings scanner — live chain read for the 49 CPU-only subnets.
 *
 * For each subnet:
 *   - Keys.entries(netuid)        -> registered UID count
 *   - Active(netuid)              -> per-UID active flags (miners that respond)
 *   - Incentive(netuid)           -> per-UID u16 incentive (0..65535)
 *   - Emission(netuid)            -> per-UID rAO per block (alpha to miners)
 *
 * Cross-check: sum(Emission)/1e9 should match taostats per-block emission
 * for SN107 (~0.0125 TAO/blk).
 *
 * Output: scripts/cpu-scan-result.json
 */
import { WsProvider, ApiPromise } from "@polkadot/api";
import { writeFileSync } from "node:fs";

const WS = "wss://entrypoint-finney.opentensor.ai:443";
const BLOCKS_PER_DAY = 7200;
const CPU = [2,5,6,7,8,11,13,15,18,19,21,22,23,25,37,41,43,46,48,50,52,56,60,61,62,63,65,66,67,69,71,77,78,79,83,88,89,93,98,101,104,107,111,115,119,121,124,127,128];

interface SubnetResult {
  netuid: number;
  block: number;
  registered: number;
  activeTrue: number | null;
  earningUids: number;        // incentive > 0
  earningMedian: number;      // median incentive among earning (0-1)
  earningP90: number;         // p90 incentive among earning
  topIncentive: number;
  emissionSumRao: number;     // sum per-block rAO over all uids
  emissionTopRao: number;     // best miner per-block rAO
  emissionFloorRao: number;   // min emission among earning uids
  emissionMedianRao: number;  // median among earning uids
  taoInRao: number | null;    // subnetTaoInEmission — TAO injected per block
}

async function main() {
  const provider = new WsProvider(WS, 10000, undefined, 60000);
  const api = await ApiPromise.create({ provider, noInitWarn: true });
  await api.isReady;
  const block = (await api.rpc.chain.getHeader()).number.toNumber();
  console.log("connected, block", block);

  const sm: any = (api.query as any).subtensorModule;
  const out: SubnetResult[] = [];

  for (const netuid of CPU) {
    try {
      // registered UIDs
      const entries = await sm.keys.entries(netuid);
      const registered = entries.length;

      // vectors (probe lowercase + legacy names for spec drift)
      const readVec = async (names: string[]): Promise<number[] | null> => {
        for (const n of names) {
          try {
            const v = await sm[n](netuid);
            if (!v) continue;
            const arr = v.toArray ? v.toArray() : [];
            if (arr.length) return arr.map((x: any) => Number(x.toString()));
          } catch { continue; }
        }
        return null;
      };
      const readScalar = async (names: string[]): Promise<number | null> => {
        for (const n of names) {
          try {
            const v = await sm[n](netuid);
            if (v === null || v === undefined) continue;
            const val = typeof v.toNumber === "function" ? v : await v;
            return Number(val.toString());
          } catch { continue; }
        }
        return null;
      };
      const incentive = await readVec(["incentive", "Incentive"]);
      const emission = await readVec(["emission", "Emission"]);
      const activeRaw = await readVec(["active", "Active"]);
      const activeTrue = activeRaw ? activeRaw.filter((x) => x > 0).length : null;
      const taoIn = await readScalar(["subnetTaoInEmission", "SubnetTaoInEmission"]);

      let earningUids = 0, earningMedian = 0, earningP90 = 0, topIncentive = 0;
      if (incentive && incentive.length) {
        const norm = incentive.map((x) => x / 65535);
        topIncentive = Math.max(...norm);
        const earning = norm.filter((x) => x > 0).sort((a, b) => a - b);
        earningUids = earning.length;
        if (earning.length) {
          const q = (p: number) => earning[Math.min(earning.length - 1, Math.floor(p * earning.length))];
          earningMedian = q(0.5);
          earningP90 = q(0.9);
        }
      }

      let emissionSumRao = 0, emissionTopRao = 0, emissionFloorRao = 0, emissionMedianRao = 0;
      if (emission && emission.length && incentive && incentive.length) {
        emissionSumRao = emission.reduce((a, b) => a + b, 0);
        emissionTopRao = Math.max(...emission);
        const earnEm = emission.filter((_, i) => incentive[i] > 0).sort((a, b) => a - b);
        if (earnEm.length) {
          emissionFloorRao = earnEm[0];
          emissionMedianRao = earnEm[Math.floor(earnEm.length / 2)];
        }
      }

      const r: SubnetResult = { netuid, block, registered, activeTrue, earningUids, earningMedian, earningP90, topIncentive, emissionSumRao, emissionTopRao, emissionFloorRao, emissionMedianRao, taoInRao: taoIn };
      // per-miner earnings distribution from the incentive vector:
      // miner pool = taoIn * 7200 blocks/day * 41% miner share (TAO-equiv per day)
      if (incentive && incentive.length && taoIn !== null && taoIn > 0) {
        const I = incentive.map((x) => x / 65535);
        const sumI = I.reduce((a, b) => a + b, 0);
        if (sumI > 0) {
          const pool = (taoIn / 1e9) * BLOCKS_PER_DAY * 0.41; // TAO-equiv per day
          const earn = I.filter((x) => x > 0).map((x) => (x / sumI) * pool).sort((a, b) => a - b);
          const q = (p: number) => earn[Math.min(earn.length - 1, Math.floor(p * earn.length))];
          (r as any).earnP10 = q(0.1); (r as any).earnP50 = q(0.5); (r as any).earnP90 = q(0.9); (r as any).earnTop = earn[earn.length - 1];
        }
      }
      out.push(r);
      console.log(`SN${netuid}: reg=${registered} active=${activeTrue} earning=${earningUids} sumEm=${(emissionSumRao/1e9).toFixed(4)} taoIn=${taoIn !== null ? (taoIn/1e9).toFixed(5) : "?"} top=${(emissionTopRao/1e9).toFixed(5)}`);
    } catch (e: any) {
      console.error(`SN${netuid} FAILED: ${e?.message ?? e}`);
      out.push({ netuid, block, registered: -1, activeTrue: null, earningUids: -1, earningMedian: 0, earningP90: 0, topIncentive: 0, emissionSumRao: -1, emissionTopRao: -1, emissionFloorRao: -1, emissionMedianRao: -1, taoInRao: null });
    }
  }

  writeFileSync("/home/z/my-project/scripts/cpu-scan-result.json", JSON.stringify({ block, scannedAt: new Date().toISOString(), results: out }, null, 1));
  console.log("saved", out.length, "subnets");
  await api.disconnect();
  process.exit(0);
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
