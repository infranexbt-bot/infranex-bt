/**
 * PROBE-EMISSION-SPLIT-2 — decode per-subnet emission split storages directly
 * (numeric keys only; .entries() trips the RPC work-limit budget).
 * Items: subnetOwnerCut(n), subnetEmissionWeights(n), ownerCutEnabled(n).
 */
import { ApiPromise, WsProvider } from "@polkadot/api";

async function main() {
  const api = await ApiPromise.create({
    provider: new WsProvider("wss://entrypoint-finney.opentensor.ai:443", 8000, undefined, 30_000),
  });
  await api.isReady;
  const mod = api.query.subtensorModule as unknown as Record<
    string,
    (n: number) => Promise<{ toHuman?: () => unknown; toJSON?: () => unknown }>
  >;
  for (const n of [0, 4, 8, 51, 64, 120]) {
    const parts: string[] = [];
    for (const name of ["subnetOwnerCut", "subnetEmissionWeights", "ownerCutEnabled"]) {
      try {
        const v = await mod[name]?.(n);
        parts.push(`${name}=${JSON.stringify(v?.toJSON?.() ?? v?.toHuman?.())}`);
      } catch (e) {
        parts.push(`${name}=ERR:${(e as Error).message.slice(0, 60)}`);
      }
    }
    console.log(`SN${n}:`, parts.join(" | "));
  }
  await api.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("probe2 failed:", e?.message ?? e);
  process.exit(1);
});
