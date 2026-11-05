// ---------------------------------------------------------------------------
// TAO ENGINE — RESEARCH PASS v2 (validator staking yields, all subnets).
//
// Model (chain-verified 2026-11-05, probe: scripts/tao-engine-probe.ts):
//   - Validators = uids with dividends > 0 (u16 scale, Σdiv ≈ 65535).
//   - captureShare_V = div[V]/Σdiv — the Yuma lane share (consensus-weighted).
//   - Lane α/day = Σ_u em[u]·div[u]/(div[u]+inc[u]) / tempo · 7200
//     (dual-role miner+validator uids split by inc/div weights — pure
//     validators are unaffected; verified: capture matches em exactly).
//   - Validator take = SubtensorModule.delegates(hotkey) u16/65535
//     (11796 = 18%; live spread 0–18% observed).
//   - Stake per hotkey = TotalHotkeyAlpha(hotkey, netuid) — α-denominated.
//
// For a reference stake S on (subnet N, validator V):
//   entry α      = poolAlpha · S/(poolTao + S)         [own entry priced in]
//   share        = entryα/(stakeV_α + entryα)
//   instant APY  = captureV·(1−take)·share·realizablePrice·365/S   [transient]
//   sustainable  = laneTAO/day·(1−take)/laneStakeTAOequiv · 365   [headline —
//                  the lane-level equilibrium after stake inflow arbitrages
//                  per-validator outliers down]
// Rank + root gate on SUSTAINABLE; report instant as upside.
// ---------------------------------------------------------------------------

import { writeFileSync } from "node:fs";
import { fetchLiveSnapshot, getChainApi } from "../src/lib/infranex/chain";

const RAO = 1e9;
const REFERENCE_STAKE_TAO = 100;
const TOP_SUBNETS_FOR_VALIDATORS = 36;
const DIV_SCALE = 65535;

type AnyApi = Awaited<ReturnType<typeof getChainApi>>;

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function vecOf(api: AnyApi, name: string, netuid: number): Promise<number[]> {
  const mods = api.query.subtensorModule as unknown as Record<string, (n: number) => Promise<unknown>>;
  const map = mods[name];
  if (!map) return [];
  try {
    const res = (await map(netuid)) as { toJSON?: () => unknown };
    const j = res.toJSON?.();
    return Array.isArray(j) ? j.map((x) => num(x)) : [];
  } catch {
    return [];
  }
}

async function multiMap(map: unknown, keys: unknown[]): Promise<unknown[]> {
  const m = map as { multi?: (k: unknown[]) => Promise<unknown[]> } | undefined;
  if (!m?.multi) return keys.map(() => null);
  try {
    return (await m.multi(keys)) as unknown[];
  } catch {
    return keys.map(() => null);
  }
}

function unwrapOpt(o: unknown): unknown | null {
  if (o == null) return null;
  const anyO = o as { isSome?: boolean; value?: unknown; inner?: unknown };
  if (typeof anyO.isSome === "boolean" && !anyO.isSome) return null;
  return anyO.value ?? anyO.inner ?? o;
}

function bytesToSs58(raw: unknown): string | null {
  try {
    const { encodeAddress } = require("@polkadot/util-crypto") as typeof import("@polkadot/util-crypto");
    const v = unwrapOpt(raw);
    if (v == null) return null;
    const bytes = v instanceof Uint8Array ? v : (v as { toU8a?: () => Uint8Array })?.toU8a?.();
    if (!bytes || bytes.length !== 32) return null;
    if (bytes.every((b) => b === 0)) return null;
    return encodeAddress(bytes, 42);
  } catch {
    return null;
  }
}

/** Delegate take per hotkey: u16 / 65535 (probe-verified: 11796 → 18%). */
async function fetchTakes(api: AnyApi, hotkeys: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (hotkeys.length === 0) return out;
  const mods = api.query.subtensorModule as unknown as Record<string, { multi?: (k: unknown[]) => Promise<unknown[]> }>;
  const rows = await multiMap(mods.delegates, hotkeys);
  rows.forEach((r, i) => {
    const raw = num(String((unwrapOpt(r) as { toString?: () => string })?.toString?.() ?? (r as unknown) ?? "0").replace(/[^0-9]/g, ""));
    const t = raw / DIV_SCALE;
    out.set(hotkeys[i], t >= 0 && t <= 0.5 ? t : 0.18);
  });
  return out;
}

interface ValidatorRow {
  uid: number;
  hotkey: string;
  stakeAlpha: number;
  captureShare: number;
  captureAlphaPerDay: number;
  take: number;
  /** lane-level sustainable net APY % (headline) */
  apySustainablePct: number;
  /** instant APY % at reference stake (transient upside) */
  apyInstantPct: number;
  apyLowPct: number;
  apyHighPct: number;
  taoPerDaySustainable: number;
}

interface SubnetResult {
  netuid: number;
  name: string | null;
  poolTao: number;
  poolAlpha: number;
  alphaSpotTao: number;
  realizableTao: number | null;
  emissionTaoPerDay: number;
  laneAlphaPerDay: number;
  laneTaoPerDay: number;
  laneStakeTao: number;
  dilutionRatio: number | null;
  alphaChange24hPct: number | null;
  validatorsResearched: number;
  validators: ValidatorRow[];
  bestApySustainablePct: number;
  medianTake: number;
  topValidatorConcentration: number | null;
  notes: string[];
}

interface SubnetInput {
  netuid: number; name: string | null; subnetTao: number; alphaIn: number;
  movingPrice: number; realizablePriceTao: number | null; emissionTaoPerDay: number | null;
  minerEmissionTaoPerDay: number | null; dilutionRatio: number | null;
  alphaPriceChange24h: number | null; tempo: number;
}

async function researchSubnet(api: AnyApi, s: SubnetInput): Promise<SubnetResult | null> {
  const emission = s.emissionTaoPerDay ?? 0;
  if (emission <= 0) return null;
  const poolTao = s.subnetTao;
  const poolAlpha = s.alphaIn;
  const spot = s.movingPrice;
  const realizable = s.realizablePriceTao ?? spot;
  if (poolTao <= 0 || poolAlpha <= 0 || spot <= 0) return null;

  const [actives, inc, div, em] = await Promise.all([
    vecOf(api, "active", s.netuid),
    vecOf(api, "incentive", s.netuid),
    vecOf(api, "dividends", s.netuid),
    vecOf(api, "emission", s.netuid),
  ]);
  const count = Math.min(actives.length || div.length, 256);
  if (count === 0) return null;
  const vUids: number[] = [];
  for (let u = 0; u < count; u++) if ((div[u] ?? 0) > 0) vUids.push(u);
  if (vUids.length === 0) return null;

  const tempo = Math.max(s.tempo, 1);
  // Lane α/day with dual-role split (pure validators unaffected).
  const divSum = vUids.reduce((a, u) => a + (div[u] ?? 0), 0);
  if (divSum <= 0) return null;
  let laneAlphaPerDay = 0;
  for (const u of vUids) {
    const d = div[u] ?? 0;
    const i = inc[u] ?? 0;
    const vPart = ((em[u] ?? 0) * d) / Math.max(d + i, 1);
    laneAlphaPerDay += vPart;
  }
  laneAlphaPerDay = (laneAlphaPerDay / RAO / tempo) * 7200;
  if (laneAlphaPerDay <= 0) return null;

  // Hotkeys + stakes + takes.
  const mods = api.query.subtensorModule as unknown as Record<string, { multi?: (k: unknown[]) => Promise<unknown[]> }>;
  const keyRows = await multiMap(mods.keys, vUids.map((u) => [s.netuid, u]));
  const hotkeyByUid = new Map<number, string>();
  keyRows.forEach((r, i) => {
    const hk = bytesToSs58(r);
    if (hk) hotkeyByUid.set(vUids[i], hk);
  });
  const hotkeys = [...new Set([...hotkeyByUid.values()])];
  const stakeRows = await multiMap(mods.totalHotkeyAlpha, hotkeys.map((h) => [h, s.netuid]));
  const stakeByHotkey = new Map<string, number>();
  stakeRows.forEach((r, i) => {
    const raw = String((unwrapOpt(r) as { toString?: () => string })?.toString?.() ?? (r as unknown) ?? "0").replace(/[^0-9]/g, "");
    const alpha = num(raw) / RAO;
    if (alpha > 0) stakeByHotkey.set(hotkeys[i], alpha);
  });
  const takeByHotkey = await fetchTakes(api, hotkeys);

  const laneTaoPerDay = laneAlphaPerDay * realizable;
  const entryAlpha = poolAlpha * (REFERENCE_STAKE_TAO / (poolTao + REFERENCE_STAKE_TAO));

  const rows: ValidatorRow[] = [];
  for (const uid of vUids) {
    const hk = hotkeyByUid.get(uid);
    if (!hk) continue;
    const stakeAlpha = stakeByHotkey.get(hk) ?? 0;
    if (stakeAlpha <= 0) continue;
    const take = takeByHotkey.get(hk) ?? 0.18;
    const captureShare = (div[uid] ?? 0) / divSum;
    const captureAlphaPerDay = laneAlphaPerDay * captureShare;
    if (captureAlphaPerDay <= 0) continue;

    // Sustainable: your TAO joins the lane pot; take-adjusted, realizable-priced.
    // laneStakeTAO is computed AFTER all rows (needs Σ stakes) — placeholder here.
    rows.push({
      uid, hotkey: hk, stakeAlpha, captureShare,
      captureAlphaPerDay: Math.round(captureAlphaPerDay * 100) / 100,
      take,
      apySustainablePct: 0, apyInstantPct: 0, apyLowPct: 0, apyHighPct: 0,
      taoPerDaySustainable: 0,
      // keep raw for the second pass below
      ...({} as Record<string, never>),
    });
    (rows[rows.length - 1] as ValidatorRow & { _stakeAlpha: number })._stakeAlpha = stakeAlpha;
    (rows[rows.length - 1] as ValidatorRow & { _capture: number })._capture = captureAlphaPerDay;
  }
  if (rows.length === 0) return null;

  const laneStakeAlpha = rows.reduce((a, r) => a + (r as ValidatorRow & { _stakeAlpha: number })._stakeAlpha, 0);
  const laneStakeTao = laneStakeAlpha * spot;
  const drift = Math.max(-60, Math.min(60, s.alphaPriceChange24h ?? 0)) / 100;
  const down = -0.25 + Math.min(0, drift);
  const up = 0.25 + Math.max(0, drift);

  for (const r of rows) {
    const raw = r as ValidatorRow & { _stakeAlpha: number; _capture: number };
    const take = r.take;
    const taoPerDaySustainable = (raw._capture * (1 - take) / Math.max(laneStakeAlpha, 1)) * REFERENCE_STAKE_TAO * realizable;
    // instant: your 100 TAO joins THIS validator's stake pool
    const share = entryAlpha / (raw._stakeAlpha + entryAlpha);
    const instantTaoPerDay = raw._capture * (1 - take) * share * realizable;
    const susApy = (taoPerDaySustainable * 365 * 100) / REFERENCE_STAKE_TAO;
    const insApy = (instantTaoPerDay * 365 * 100) / REFERENCE_STAKE_TAO;
    r.taoPerDaySustainable = Math.round(taoPerDaySustainable * 1e4) / 1e4;
    r.apySustainablePct = Math.round(susApy * 100) / 100;
    r.apyInstantPct = Math.round(insApy * 100) / 100;
    r.apyLowPct = Math.round(susApy * (1 + down) * 100) / 100;
    r.apyHighPct = Math.round(susApy * (1 + up) * 100) / 100;
  }
  rows.sort((a, b) => b.apySustainablePct - a.apySustainablePct);

  const takes = rows.map((r) => r.take).sort((a, b) => a - b);
  const medianTake = takes[Math.floor(takes.length / 2)] ?? 0.18;
  const maxShare = Math.max(...rows.map((r) => r.captureShare));

  const notes: string[] = [];
  if (poolTao < 100_000) notes.push("shallow pool — exit slippage for large stakes");
  if ((s.dilutionRatio ?? 1) > 3) notes.push(`dilution ${(s.dilutionRatio as number).toFixed(1)}× — α rewards exceed TAO inflow`);
  const d24 = s.alphaPriceChange24h;
  if (d24 != null && d24 < -8) notes.push(`α ${d24.toFixed(1)}%/24h — falling pool price`);
  if (maxShare > 0.5) notes.push(`top validator holds ${(maxShare * 100).toFixed(0)}% of the lane`);
  if (REFERENCE_STAKE_TAO > poolTao * 0.01) notes.push("reference stake >1% of pool — per-validator instant figures inflated");

  return {
    netuid: s.netuid, name: s.name,
    poolTao: Math.round(poolTao), poolAlpha: Math.round(poolAlpha),
    alphaSpotTao: spot, realizableTao: realizable,
    emissionTaoPerDay: Math.round(emission * 100) / 100,
    laneAlphaPerDay: Math.round(laneAlphaPerDay),
    laneTaoPerDay: Math.round(laneTaoPerDay * 100) / 100,
    laneStakeTao: Math.round(laneStakeTao),
    dilutionRatio: s.dilutionRatio, alphaChange24hPct: s.alphaPriceChange24h,
    validatorsResearched: rows.length,
    validators: rows.slice(0, 8),
    bestApySustainablePct: rows[0].apySustainablePct,
    medianTake: Math.round(medianTake * 1000) / 1000,
    topValidatorConcentration: Math.round(maxShare * 1000) / 1000,
    notes,
  };
}

async function main() {
  console.log("[1/3] Live snapshot (129 subnets, pools, prices)…");
  const snap = await fetchLiveSnapshot();
  if (snap.source !== "live" || snap.subnets.length === 0) {
    throw new Error(`snapshot source=${snap.source} error=${snap.error ?? "-"}`);
  }
  console.log(`  block=${snap.blockNumber} subnets=${snap.subnets.length} TAO=$${snap.taoPriceUsd}`);

  const root = snap.subnets.find((s) => s.netuid === 0);
  const rootPoolTao = root?.subnetTao ?? 0;
  const rootEmPerDay = root?.emissionTaoPerDay ?? 0;
  const rootNaiveApy = rootPoolTao > 0 ? ((rootEmPerDay * 365) / rootPoolTao) * 100 : 0;
  const ROOT_MARKET_GROSS = 5.25;
  const ROOT_TAKE = 0.18;
  const rootNetApy = Math.round(ROOT_MARKET_GROSS * (1 - ROOT_TAKE) * 100) / 100;
  console.log(`[root] pool=${Math.round(rootPoolTao).toLocaleString()} TAO emission=${rootEmPerDay.toFixed(0)} TAO/day → naive ${rootNaiveApy.toFixed(2)}% | market baseline net ${rootNetApy}%`);

  const candidates = snap.subnets
    .filter((s) => s.netuid !== 0 && (s.emissionTaoPerDay ?? 0) > 0)
    .map((s) => {
      const em = s.emissionTaoPerDay ?? 0;
      const minerEm = Math.min(s.minerEmissionTaoPerDay ?? 0, em);
      return { s, validatorEm: em - minerEm };
    })
    .filter((c) => c.validatorEm > 0 && c.s.movingPrice > 0 && c.s.subnetTao > 0)
    .sort((a, b) => b.validatorEm - a.validatorEm);
  console.log(`[2/3] Stage-1 screen: ${candidates.length} emitting subnets; deep-diving top ${TOP_SUBNETS_FOR_VALIDATORS}…`);

  const api = await getChainApi();
  const results: SubnetResult[] = [];
  for (const c of candidates.slice(0, TOP_SUBNETS_FOR_VALIDATORS)) {
    try {
      const r = await researchSubnet(api, c.s);
      if (r) results.push(r);
    } catch (e) {
      console.log(`  α${c.s.netuid} failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  results.sort((a, b) => b.bestApySustainablePct - a.bestApySustainablePct);

  const gated = results.filter((r) => r.bestApySustainablePct > rootNetApy);
  console.log(`[3/3] ${results.length} researched; ${gated.length} beat root-net (${rootNetApy}%) sustainably.`);

  console.log("\n=== TOP SUBNETS FOR VALIDATOR STAKING (sustainable net APY @ 100 TAO) ===");
  console.log("netuid  name                       sust-APY%   [band]        medTake  poolTAO     α24h%  flags");
  for (const r of gated.slice(0, 15)) {
    const top = r.validators[0];
    const nm = (r.name ?? `Subnet ${r.netuid}`).slice(0, 26).padEnd(26);
    console.log(
      `α${String(r.netuid).padEnd(4)}  ${nm}  ${String(top.apySustainablePct).padStart(8)}%  [${top.apyLowPct}..${top.apyHighPct}]  ${(r.medianTake * 100).toFixed(1).padStart(5)}%  ${String(Math.round(r.poolTao).toLocaleString()).padStart(9)}  ${String(r.alphaChange24hPct?.toFixed(1) ?? "-").padStart(6)}  ${r.notes.join("; ")}`
    );
  }

  console.log("\n=== TOP VALIDATORS PER BEST SUBNET ===");
  for (const r of gated.slice(0, 5)) {
    console.log(`α${r.netuid} ${r.name ?? ""} (lane ${r.laneTaoPerDay} TAO/day, lane-stake ${r.laneStakeTao.toLocaleString()} TAO):`);
    for (const v of r.validators.slice(0, 3)) {
      console.log(`   uid${String(v.uid).padStart(3)} take=${(v.take * 100).toFixed(1).padStart(5)}%  capShare=${(v.captureShare * 100).toFixed(1).padStart(4)}%  stake=${Math.round(v.stakeAlpha).toLocaleString().padStart(9)}α  sust=${v.apySustainablePct}%  instant=${v.apyInstantPct}%  ${v.hotkey.slice(0, 12)}…`);
    }
  }

  const payload = {
    model: "tao-engine-research-v2",
    fetchedAt: new Date().toISOString(),
    block: snap.blockNumber,
    taoPriceUsd: snap.taoPriceUsd,
    referenceStakeTao: REFERENCE_STAKE_TAO,
    rootBaseline: {
      poolTao: Math.round(rootPoolTao),
      emissionTaoPerDay: Math.round(rootEmPerDay * 100) / 100,
      naiveChainApyPct: Math.round(rootNaiveApy * 100) / 100,
      marketGrossApyPct: ROOT_MARKET_GROSS,
      takePct: ROOT_TAKE * 100,
      netApyPct: rootNetApy,
    },
    subnets: gated,
    allResearched: results,
  };
  writeFileSync("scripts/tao-engine-research.json", JSON.stringify(payload, null, 2));
  console.log("\nSaved → scripts/tao-engine-research.json");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
