// Probe: (1) find the right storage name for validator takes,
// (2) check Σ validator hotkey stakes vs poolAlpha (stake data sanity),
// (3) inspect inc/div vector normalization for a dual-role uid.
import { fetchLiveSnapshot, getChainApi } from "../src/lib/infranex/chain";

const RAO = 1e9;
const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };

async function main() {
  const snap = await fetchLiveSnapshot();
  const api = await getChainApi();
  const mods = api.query.subtensorModule as unknown as Record<string, unknown>;

  // 1) storage names containing "delegate" (take map) / "take" / "commission"
  const names = Object.keys(mods).filter((k) => /delegate|take|commission|cut/i.test(k));
  console.log("[storage names]", names.join(", ") || "(none)");

  // 2) Gradients α56: pool vs Σ validator stakes
  const s = snap.subnets.find((x) => x.netuid === 56)!;
  console.log(`\n[α56] poolTao=${Math.round(s.subnetTao).toLocaleString()} poolAlpha=${Math.round(s.alphaIn).toLocaleString()} spot=${s.movingPrice.toPrecision(4)}`);
  const vec = async (name: string): Promise<number[]> => {
    const res = (await (mods[name] as (n: number) => Promise<{ toJSON?: () => unknown }>)(56)) as { toJSON?: () => unknown };
    const j = res.toJSON?.();
    return Array.isArray(j) ? j.map((x) => num(x)) : [];
  };
  const [active, inc, div, em] = [await vec("active"), await vec("incentive"), await vec("dividends"), await vec("emission")];
  const count = Math.min(active.length || div.length, 256);
  const vUids: number[] = [];
  for (let u = 0; u < count; u++) if ((div[u] ?? 0) > 0) vUids.push(u);
  console.log(`validators (div>0): ${vUids.length}, inc>0 among them: ${vUids.filter((u) => (inc[u] ?? 0) > 0).length}`);
  // hotkeys
  const keyRows = await (mods.keys as { multi?: (k: unknown[]) => Promise<unknown[]> })!.multi!(vUids.map((u) => [56, u]));
  const { encodeAddress } = await import("@polkadot/util-crypto");
  const hks: string[] = [];
  keyRows.forEach((r) => {
    const anyR = r as { isSome?: boolean; value?: unknown } | null;
    if (!anyR || (typeof anyR.isSome === "boolean" && !anyR.isSome)) { hks.push(""); return; }
    const v = anyR.value ?? anyR;
    const bytes = v instanceof Uint8Array ? v : (v as { toU8a?: () => Uint8Array })?.toU8a?.();
    hks.push(bytes && bytes.length === 32 ? encodeAddress(bytes, 42) : "");
  });
  const valid = hks.filter((h) => h);
  const stakeRows = await (mods.totalHotkeyAlpha as { multi?: (k: unknown[]) => Promise<unknown[]> })!.multi!(valid.map((h) => [h, 56]));
  const stakes = stakeRows.map((r) => {
    const raw = String((r as { toString?: () => string })?.toString?.() ?? "0").replace(/[^0-9]/g, "");
    return num(raw) / RAO;
  });
  const sumStakes = stakes.reduce((a, b) => a + b, 0);
  console.log(`Σ validator hotkey stakes = ${Math.round(sumStakes).toLocaleString()} α  (${((sumStakes / s.alphaIn) * 100).toFixed(1)}% of poolAlpha)`);
  vUids.forEach((u, i) => {
    if (i < 6) console.log(`  uid${String(u).padStart(3)} div=${div[u]} inc=${inc[u]} em=${(em[u] / RAO).toFixed(1)}α/epoch stake=${Math.round(stakes[i]).toLocaleString()}α`);
  });
  // inc/div scale check across all uids
  const maxDiv = Math.max(...div.slice(0, count));
  const maxInc = Math.max(...inc.slice(0, count));
  console.log(`[scale] maxDiv=${maxDiv} maxInc=${maxInc} (65535=u16 scale, ~1=float)`);

  // 3) takes probe — `delegates` is a single-key map (hotkey → u16 take)
  const hk = valid[0];
  try {
    const mm = mods.delegates as unknown as { multi?: (k: unknown[]) => Promise<unknown[]> };
    const rows = mm.multi ? await mm.multi(valid.slice(0, 8)) : [];
    rows.forEach((r, i) => {
      const raw = String((r as { toString?: () => string })?.toString?.() ?? "0");
      console.log(`[delegates] ${valid[i].slice(0, 10)}… raw=${raw} → ${(num(raw) / 65535 * 100).toFixed(2)}%`);
    });
    for (const nm of ["maxDelegateTake", "minDelegateTake"]) {
      const v = await (mods[nm] as () => Promise<unknown>)();
      console.log(`[${nm}] ${String((v as { toString?: () => string })?.toString?.() ?? v)}`);
    }
  } catch (e) {
    console.log(`[delegates] read failed: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }
  // 4) Σ all-uid emission sanity: epoch total × lanes
  const emSum = em.slice(0, count).reduce((a, b) => a + b, 0) / RAO;
  const incSum = inc.slice(0, count).reduce((a, b) => a + b, 0);
  const divSum = div.slice(0, count).reduce((a, b) => a + b, 0);
  console.log(`\n[α56 epoch] Σem=${emSum.toFixed(0)}α  Σinc=${incSum.toFixed(0)} Σdiv=${divSum.toFixed(0)} (inc+div should ≈ 65535×N?)`);
  // owner cut params
  try {
    const cut = await (mods.subnetOwnerCut as (n: number) => Promise<unknown>)(56);
    const enabled = await (mods.ownerCutEnabled as unknown as { entries?: () => Promise<unknown> } | undefined);
    console.log(`[ownerCut] subnetOwnerCut(56)=${String((cut as { toString?: () => string })?.toString?.() ?? cut)}`);
  } catch { /* ignore */ }
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
