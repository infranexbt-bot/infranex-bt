/**
 * PROBE — verify which SubtensorModule stake queries exist on live Finney
 * (used to design the read-only Stake Portfolio). Run:
 *   bun scripts/probe-stake-queries.ts [hotkey]
 */
import { getChainApi } from "../src/lib/infranex/chain";

const HOTKEY = process.argv[2] ?? "5EKtvzbEvYZPRJdo42ug7mWrHdt4AurCNMs5CAefuBHfQmhq";

const api = await getChainApi();
const head = await api.rpc.chain.getHeader();
console.log(`head #${head.number.toNumber()} spec ${api.runtimeVersion.specVersion.toNumber()}`);

const show = (label: string, fn: () => Promise<unknown>) =>
  Promise.resolve()
    .then(fn)
    .then((v) => {
      const s = String(v);
      console.log(`OK  ${label}: ${s.length > 400 ? s.slice(0, 400) + "…" : s}`);
    })
    .catch((e) => console.log(`NO  ${label}: ${String(e).split("\n")[0].slice(0, 140)}`));

// 1. dTAO per-netuid alpha — double map (hotkey, netuid)
for (const n of [64, 4, 68, 36]) {
  await show(`totalHotkeyAlpha(hk,${n})`, () => api.query.subtensorModule.totalHotkeyAlpha(HOTKEY, n));
}
await show("hotkeyAlpha(hk,64)", () => api.query.subtensorModule.hotkeyAlpha(HOTKEY, 64));
// 2. TAO-equivalent total stake
await show("totalHotkeyStake", () => api.query.subtensorModule.totalHotkeyStake(HOTKEY));
// 3. coldkey that owns the hotkey
await show("owner", () => api.query.subtensorModule.owner(HOTKEY));
// 4. legacy per-stake info
await show("stakeInfo (legacy)", () => api.query.subtensorModule.stakeInfo(HOTKEY));
// 5. runtime API batch (newer path)
await show("stakeInfoRuntimeApi.stakeInfoBatch", () =>
  (api.call.stakeInfoRuntimeApi as any)?.stakeInfoBatch([HOTKEY])
);
// 6. swap rate runtime APIs
await show("swapRuntimeApi.alphaToTao(64,1e12)", () =>
  (api.call.swapRuntimeApi as any)?.alphaToTao(64, "1000000000000")
);
await show("swapRuntimeApi.taoToAlpha(64,1e12)", () =>
  (api.call.swapRuntimeApi as any)?.taoToAlpha(64, "1000000000000")
);
await show("swap.alphaToTaoPerNetuid? (storage)", () =>
  (api.query.swap as any)?.alphaToTaoPerNetuid?.(64)
);
// 7. coldkey free balance via owner — grab owner first
const owner = await api.query.subtensorModule.owner(HOTKEY).catch(() => null);
const cold = owner ? String((owner as any).value ?? owner) : null;
if (cold && cold.startsWith("5") && !cold.includes(",")) {
  console.log(`owner coldkey: ${cold}`);
  await show("system.account(cold).free", async () => {
    const acc: any = await api.query.system.account(cold);
    return `free=${acc.data?.free?.toString()} reserved=${acc.data?.reserved?.toString()}`;
  });
} else {
  console.log(`owner coldkey parse: ${cold}`);
}
// 8. per-hotkey emissions / shares useful for "how fast alpha accrues"
await show("hotkeyShares", () => api.query.subtensorModule.hotkeyShares(HOTKEY));
await show("totalHotkeyShares", () => api.query.subtensorModule.totalHotkeyShares(HOTKEY));

process.exit(0);
