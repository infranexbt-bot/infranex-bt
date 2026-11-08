/**
 * PROBE-EMISSION-SPLIT — one-shot runtime probe (not part of the app).
 *
 * Goal: discover whether the current Finney runtime exposes the per-subnet
 * emission split (eTAO: [burn, recycle, owner, validator, miner] weights) in
 * subtensorModule storage, so the emission leaderboard can show the REAL
 * owner/validator/miner split per subnet instead of assuming the 18/41/41
 * default.
 *
 * Prints any subtensorModule storage item whose name matches
 * split|owner|emission|burn|recycle, plus decodes the values for a couple of
 * hot subnets (SN51, SN4) if found.
 */
import { ApiPromise, WsProvider } from "@polkadot/api";

async function main() {
  const ws = "wss://entrypoint-finney.opentensor.ai:443";
  console.log("connecting to", ws);
  const provider = new WsProvider(ws, 8000, undefined, 30_000);
  const api = await ApiPromise.create({ provider });
  await api.isReady;

  const mod = api.query.subtensorModule as unknown as Record<string, unknown>;
  const keys = Object.keys(mod);
  const rx = /split|owner|burn|recycl|emission/i;
  const hits = keys.filter((k) => rx.test(k));
  console.log("subtensorModule storage count:", keys.length);
  console.log("candidate items:", hits.join(", "));

  // Try decoding the most likely split storages for SN51 / SN4 / SN0.
  for (const name of hits) {
    if (!/split|owner|recycl/i.test(name)) continue;
    const q = mod[name] as { entries?: () => Promise<unknown[]>; (n: number): Promise<unknown> };
    try {
      if (typeof q.entries === "function") {
        const entries = (await (q as { entries: () => Promise<[unknown, unknown][]> }).entries())
          .slice(0, 6);
        for (const [key, val] of entries) {
          const netuid = (key as { toHuman?: () => unknown }).toHuman?.();
          const human = (val as { toHuman?: () => unknown }).toHuman?.();
          console.log(`${name}`, JSON.stringify(netuid), "=>", JSON.stringify(human));
        }
      } else {
        for (const n of [0, 4, 51]) {
          const val = await (q as (n: number) => Promise<{ toHuman?: () => unknown }>)(n);
          console.log(`${name}(${n}) =>`, JSON.stringify(val?.toHuman?.()));
        }
      }
    } catch (e) {
      console.log(`${name} decode failed:`, (e as Error).message.slice(0, 120));
    }
  }

  await api.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("probe failed:", e?.message ?? e);
  process.exit(1);
});
