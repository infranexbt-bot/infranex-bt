// ---------------------------------------------------------------------------
// TAO ENGINE — validator staking yield engine (pure math, no network).
//
// Answers one question: "given S TAO, which subnet validator accumulates the
// most honest TAO?" Layered as:
//   1. screenSubnetsForLane(snap)     — pure screen over a live network
//                                      snapshot (validator-lane TAO/day).
//   2. research (scripts/…)           — per-subnet metagraph deep-dive:
//                                      capture shares, takes, stakes (frozen
//                                      in tao-engine-baseline.json).
//   3. computeSubnetStakeOpportunity  — per-(subnet, validator) sustainable vs
//                                      instant APY for the user's stake S.
//   4. rankSubnetOpportunities        — root-baseline-gated ranking.
//
// Model (chain-verified 2026-11-05, scripts/tao-engine-probe.ts):
//   - validators  = uids with dividends > 0 (u16 scale, Σdiv ≈ 65535)
//   - captureShare= div[V]/Σdiv                    (Yuma lane share)
//   - take        = delegates(hotkey) u16/65535    (11796 → 18%; 0–18% spread)
//   - stake       = TotalHotkeyAlpha(hotkey, netuid)  (α-denominated)
//   - lane α/day  = Σ_u em[u]·div[u]/(div[u]+inc[u]) / tempo · 7200
//
// For a stake S on (subnet N, validator V):
//   entry α       = poolAlpha · S/(poolTao + S)      [balancer mint side]
//   exitSlip%     = entryα/(poolAlpha + entryα)      [round-trip haircut]
//   taoPerDay     = captureα/day · (1−take) ÷ laneStake_α · S · realizable
//   sustainableAPY= taoPerDay · 365 / S · 100        [headline — lane-level
//                  equilibrium: stake inflow arbitrages outliers down]
//   instantAPY    = captureα/day · (1−take) · share · realizable · 365 / S · 100
//                  [transient upside of joining ONE validator now]
//   band          = sustainable × (1 − 0.25 + drift⁻) … (1 + 0.25 + drift⁺)
//
// HONESTY CONTRACT (same as staking.ts / tao-accumulation.ts):
//   - sustainable APY ranks; instant APY is displayed upside, never ranked.
//   - pools < MIN_POOL_TAO can never beat root (exit slippage dominates).
//   - missing chain data downgrades; it never fabricates.
// ---------------------------------------------------------------------------

export const TAO_ENGINE = {
  /** Chain default delegate take — used when the chain read fails. */
  DEFAULT_TAKE: 0.18,
  /** Root gross APY baseline (market-observed: Coinbase 5.25, 2026). */
  ROOT_GROSS_APY_PCT: 5.25,
  /** Take applied to root staking figures. */
  ROOT_TAKE_PCT: 0.18,
  /** Pools below this TAO depth can never beat root honestly. */
  MIN_POOL_TAO: 1_000,
  /** Pools above this depth are considered deep (risk model). */
  DEEP_POOL_TAO: 100_000,
  /** Validators with less α staked than this are ignored (dust lanes). */
  MIN_VALIDATOR_STAKE_ALPHA: 1_000,
  /** Default stake for APY math when the caller passes none. */
  REFERENCE_STAKE_TAO: 100,
  /** Take clamp — anything above 50% is a chain-read artifact. */
  MAX_TAKE: 0.5,
  /** 24h α drift clamp for the honest band (%). */
  DRIFT_CLAMP_PCT: 60,
  /** Band half-width at zero drift. */
  BAND_BASE: 0.25,
  /** Dilution ratio above which a note fires. */
  DILUTION_NOTE_RATIO: 3,
  /** |α 24h| below which a deep pool counts as calm (risk model). */
  CALM_DRIFT_PCT: 8,
  /** Lane concentration above which the lane is whale-dominated. */
  WHALE_SHARE: 0.5,
} as const;

export interface ValidatorStakeInput {
  uid: number;
  hotkey: string;
  /** Validator's own α stake on this subnet. */
  stakeAlpha: number;
  /** div[V]/Σdiv — Yuma lane share, 0..1. */
  captureShare: number;
  /** Delegate take fraction (0..0.5 after normalization). */
  take: number;
}

export interface SubnetStakeInputs {
  netuid: number;
  name: string | null;
  /** TAO reserve of the subnet pool (entry/exit liquidity). */
  poolTao: number;
  /** α reserve of the subnet pool. */
  poolAlpha: number;
  /** Honest spot: 1 α in TAO (tradeable price). */
  alphaSpotTao: number;
  /** realizablePriceTao — avg price of the subnet's daily α flow (≤ spot). */
  realizableTao: number;
  /** Validator-lane α per day (from the research deep-dive). */
  laneAlphaPerDay: number;
  validators: ValidatorStakeInput[];
  dilutionRatio: number | null;
  alphaChange24hPct: number | null;
  emissionEnabled: boolean;
}

export interface ValidatorStakeOption {
  uid: number;
  hotkey: string;
  stakeAlpha: number;
  captureShare: number;
  take: number;
  /** Validator's α/day from the lane (captureShare × lane α/day). */
  captureAlphaPerDay: number;
  /** Sustainable net TAO/day for the user's stake (take-adj, realizable). */
  taoPerDay: number;
  taoPerMonth: number;
  /** Sustainable net APY % for the user's stake — THE headline. */
  apySustainablePct: number;
  apyLowPct: number;
  apyHighPct: number;
  /** Transient upside APY % (join this validator's stake pool now). */
  apyInstantPct: number;
}

export interface SubnetStakeOpportunity {
  netuid: number;
  name: string;
  poolTao: number;
  poolAlpha: number;
  alphaSpotTao: number;
  realizableTao: number;
  laneAlphaPerDay: number;
  laneTaoPerDay: number;
  laneStakeAlpha: number;
  laneStakeTao: number;
  /** Round-trip exit slippage for the user's stake, %. */
  exitSlippagePct: number | null;
  validators: ValidatorStakeOption[];
  bestValidator: ValidatorStakeOption;
  bestApySustainablePct: number;
  beatsRoot: boolean;
  rootBaselineApyPct: number;
  dilutionRatio: number | null;
  alphaChange24hPct: number | null;
  /** Max captureShare, 0..1. */
  topValidatorConcentration: number;
  riskLevel: "low" | "medium" | "high";
  notes: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** Delegate take from the raw chain u16 (probe-verified 11796 → 18%).
 *  Anything non-finite, negative or > MAX_TAKE falls back to the default. */
export function normalizeTake(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0) return TAO_ENGINE.DEFAULT_TAKE;
  const frac = raw / 65535;
  return frac >= 0 && frac <= TAO_ENGINE.MAX_TAKE ? frac : TAO_ENGINE.DEFAULT_TAKE;
}

/** α minted when staking S TAO (balancer mint side; own impact priced in). */
export function entryAlphaForStake(poolAlpha: number, poolTao: number, stakeTao: number): number {
  if (!(poolAlpha > 0) || !(poolTao > 0) || !(stakeTao > 0)) return 0;
  return poolAlpha * (stakeTao / (poolTao + stakeTao));
}

/** Root baseline net APY % (market gross net of take). */
export function rootNetApyPct(): number {
  return r2(TAO_ENGINE.ROOT_GROSS_APY_PCT * (1 - TAO_ENGINE.ROOT_TAKE_PCT) * 100);
}

export interface RootBaselineRow {
  kind: "root";
  netuid: number;
  name: string;
  grossApyPct: number;
  netApyPct: number;
  takePct: number;
  taoPerDay: number;
  taoPerMonth: number;
  taoPerYear: number;
  notes: string[];
}

/** The root staking row every subnet pick must beat. */
export function rootBaselineRow(stakeTao: number): RootBaselineRow {
  const net = rootNetApyPct();
  return {
    kind: "root",
    netuid: 0,
    name: "Root network staking",
    grossApyPct: TAO_ENGINE.ROOT_GROSS_APY_PCT,
    netApyPct: net,
    takePct: r2(TAO_ENGINE.ROOT_TAKE_PCT * 100),
    taoPerDay: r4((stakeTao * (net / 100)) / 365),
    taoPerMonth: r2((stakeTao * (net / 100)) / 12),
    taoPerYear: r2(stakeTao * (net / 100)),
    notes: [
      "Market-observed gross 5.25% (Coinbase 2026) net of the 18% take.",
      "Paid in TAO — no α price exposure, unstake is liquid.",
      "The baseline every subnet staking pick must beat on risk-adjusted yield.",
    ],
  };
}

function dilutionNote(ratio: number): string {
  const shown = Number.isInteger(ratio) ? `${ratio}×` : `${Math.round(ratio * 10) / 10}×`;
  return `dilution ${shown} — α rewards exceed TAO inflow`;
}

/** Raw lane estimate from a live subnet row: validator-lane TAO/day ÷ spot.
 *  (emissionTaoPerDay − minerEmissionTaoPerDay) is the validator lane in
 *  TAO-value terms; the research deep-dive refines it per-uid. */
export function validatorLaneAlphaPerDay(
  sub: { emissionTaoPerDay?: number | null; minerEmissionTaoPerDay?: number | null; movingPrice?: number | null }
): number {
  const em = sub.emissionTaoPerDay ?? 0;
  const miner = Math.min(sub.minerEmissionTaoPerDay ?? 0, em);
  const spot = sub.movingPrice ?? 0;
  if (!(em > 0) || !(spot > 0)) return 0;
  return (em - miner) / spot;
}

export interface ScreenLaneRow {
  netuid: number;
  name: string | null;
  /** Validator-lane TAO/day (realizable-priced). */
  laneTaoPerDay: number;
  /** laneTaoPerDay ÷ spot — first-order lane α estimate. */
  laneAlphaPerDay: number;
  poolTao: number;
  alphaSpotTao: number;
  realizableTao: number;
  dilutionRatio: number | null;
  alphaChange24hPct: number | null;
  needsDeepDive: boolean;
}

/** Pure screen over a live network snapshot: candidate subnets for the
 *  validator-staking deep dive, ranked by validator-lane TAO/day. */
export function screenSubnetsForLane(
  snap: { subnets?: Array<Record<string, unknown>> }
): ScreenLaneRow[] {
  const rows: ScreenLaneRow[] = [];
  for (const raw of snap.subnets ?? []) {
    const s = raw as {
      netuid: number; name?: string | null; emissionTaoPerDay?: number | null;
      minerEmissionTaoPerDay?: number | null; movingPrice?: number | null;
      subnetTao?: number | null; realizablePriceTao?: number | null;
      dilutionRatio?: number | null; alphaPriceChange24h?: number | null;
    };
    if (s.netuid === 0) continue; // root is the baseline, not a candidate
    const em = s.emissionTaoPerDay ?? 0;
    const spot = s.movingPrice ?? 0;
    const poolTao = s.subnetTao ?? 0;
    if (!(em > 0) || !(spot > 0) || !(poolTao > 0)) continue;
    const miner = Math.min(s.minerEmissionTaoPerDay ?? 0, em);
    const realizable = (s.realizablePriceTao ?? 0) > 0 ? (s.realizablePriceTao as number) : spot;
    const laneTaoPerDay = (em - miner) * realizable;
    rows.push({
      netuid: s.netuid,
      name: s.name ?? null,
      laneTaoPerDay,
      laneAlphaPerDay: spot > 0 ? laneTaoPerDay / spot : 0,
      poolTao,
      alphaSpotTao: spot,
      realizableTao: realizable,
      dilutionRatio: s.dilutionRatio ?? null,
      alphaChange24hPct: s.alphaPriceChange24h ?? null,
      needsDeepDive: true, // the metagraph deep-dive refines per-validator
    });
  }
  rows.sort((a, b) => b.laneTaoPerDay - a.laneTaoPerDay);
  return rows;
}

export interface StakeOpportunityOptions {
  /** The user's stake in TAO (default: TAO_ENGINE.REFERENCE_STAKE_TAO). */
  stakeTao?: number;
}

/** Per-(subnet, validator) staking opportunity for the user's stake S.
 *  Returns null on dead inputs — never a fabricated row. */
export function computeSubnetStakeOpportunity(
  inputs: SubnetStakeInputs,
  opts?: StakeOpportunityOptions
): SubnetStakeOpportunity | null {
  const stakeTao = Math.max(opts?.stakeTao ?? TAO_ENGINE.REFERENCE_STAKE_TAO, 0) || TAO_ENGINE.REFERENCE_STAKE_TAO;
  if (!inputs.emissionEnabled) return null;
  if (!(inputs.laneAlphaPerDay > 0)) return null;
  if (!(inputs.poolTao > 0)) return null;
  if (!(inputs.alphaSpotTao > 0)) return null;

  const vals = inputs.validators.filter(
    (v) => v && Number.isFinite(v.stakeAlpha) && v.stakeAlpha >= TAO_ENGINE.MIN_VALIDATOR_STAKE_ALPHA
  );
  if (vals.length === 0) return null;

  const spot = inputs.alphaSpotTao;
  const realizable = inputs.realizableTao > 0 ? Math.min(inputs.realizableTao, spot) : spot;
  const laneStakeAlpha = vals.reduce((s, v) => s + v.stakeAlpha, 0);
  if (!(laneStakeAlpha > 0)) return null;

  const drift = Math.max(
    -TAO_ENGINE.DRIFT_CLAMP_PCT,
    Math.min(TAO_ENGINE.DRIFT_CLAMP_PCT, inputs.alphaChange24hPct ?? 0)
  ) / 100;
  const down = -TAO_ENGINE.BAND_BASE + Math.min(0, drift);
  const up = TAO_ENGINE.BAND_BASE + Math.max(0, drift);

  const entryAlpha = entryAlphaForStake(inputs.poolAlpha, inputs.poolTao, stakeTao);
  const exitSlippagePct =
    entryAlpha > 0 && inputs.poolAlpha > 0
      ? r2((entryAlpha / (inputs.poolAlpha + entryAlpha)) * 100)
      : null;

  const rows: ValidatorStakeOption[] = vals.map((v) => {
    const take = Math.max(0, Math.min(TAO_ENGINE.MAX_TAKE, v.take));
    const share = Math.max(0, Math.min(1, v.captureShare));
    const captureAlphaPerDay = inputs.laneAlphaPerDay * share;
    const taoPerDay = (captureAlphaPerDay * (1 - take) / laneStakeAlpha) * stakeTao * realizable;
    const susApy = (taoPerDay * 365 * 100) / stakeTao;
    const instShare = entryAlpha > 0 ? entryAlpha / (v.stakeAlpha + entryAlpha) : 0;
    const instantTaoPerDay = captureAlphaPerDay * (1 - take) * instShare * realizable;
    const insApy = (instantTaoPerDay * 365 * 100) / stakeTao;
    return {
      uid: v.uid,
      hotkey: v.hotkey,
      stakeAlpha: Math.round(v.stakeAlpha),
      captureShare: share,
      take,
      captureAlphaPerDay: r4(captureAlphaPerDay),
      taoPerDay: r4(taoPerDay),
      taoPerMonth: r2(taoPerDay * 30),
      apySustainablePct: r2(susApy),
      apyLowPct: r2(susApy * (1 + down)),
      apyHighPct: r2(susApy * (1 + up)),
      apyInstantPct: r2(insApy),
    };
  });
  rows.sort((a, b) => b.apySustainablePct - a.apySustainablePct);

  const rootNet = rootNetApyPct();
  const concentration = Math.max(...rows.map((v) => v.captureShare));
  const notes: string[] = [];
  if (inputs.poolTao < TAO_ENGINE.MIN_POOL_TAO) {
    notes.push(`pool below minimum depth (${inputs.poolTao} TAO) — staking yield cannot honestly beat root`);
  } else if (inputs.poolTao < TAO_ENGINE.DEEP_POOL_TAO) {
    notes.push("shallow pool — exit slippage for large stakes");
  }
  if (inputs.dilutionRatio != null && inputs.dilutionRatio > TAO_ENGINE.DILUTION_NOTE_RATIO) {
    notes.push(dilutionNote(inputs.dilutionRatio));
  }
  const d24 = inputs.alphaChange24hPct;
  if (d24 != null && d24 < -8) notes.push(`α ${d24.toFixed(1)}%/24h — falling pool price`);
  if (concentration > TAO_ENGINE.WHALE_SHARE) {
    notes.push(`top validator captures ${Math.round(concentration * 100)}% of the lane`);
  }
  if (exitSlippagePct != null && exitSlippagePct > 3) {
    notes.push(`exit slippage ${exitSlippagePct}% for a ${stakeTao} TAO round trip`);
  }
  if (stakeTao > inputs.poolTao * 0.01) {
    notes.push("stake >1% of pool — instant figures inflated; sustainable is the honest read");
  }

  const best = rows[0];
  const beatsRoot = inputs.poolTao >= TAO_ENGINE.MIN_POOL_TAO && best.apySustainablePct > rootNet;
  const riskLevel: SubnetStakeOpportunity["riskLevel"] =
    inputs.poolTao >= TAO_ENGINE.DEEP_POOL_TAO &&
    Math.abs(d24 ?? 0) <= TAO_ENGINE.CALM_DRIFT_PCT &&
    concentration <= TAO_ENGINE.WHALE_SHARE
      ? "medium"
      : "high";

  return {
    netuid: inputs.netuid,
    name: inputs.name ?? `Subnet ${inputs.netuid}`,
    poolTao: inputs.poolTao,
    poolAlpha: inputs.poolAlpha,
    alphaSpotTao: spot,
    realizableTao: realizable,
    laneAlphaPerDay: inputs.laneAlphaPerDay,
    laneTaoPerDay: r2(inputs.laneAlphaPerDay * realizable),
    laneStakeAlpha: Math.round(laneStakeAlpha),
    laneStakeTao: Math.round(laneStakeAlpha * spot),
    exitSlippagePct,
    validators: rows,
    bestValidator: best,
    bestApySustainablePct: best.apySustainablePct,
    beatsRoot,
    rootBaselineApyPct: rootNet,
    dilutionRatio: inputs.dilutionRatio ?? null,
    alphaChange24hPct: d24,
    topValidatorConcentration: concentration,
    riskLevel,
    notes,
  };
}

export interface RankOptions {
  /** Max rows across both buckets (default: no limit). */
  limit?: number;
}

/** Root-gated ranking: beats-root first by sustainable APY, then the rest. */
export function rankSubnetOpportunities<T extends { bestApySustainablePct: number; beatsRoot: boolean }>(
  list: T[],
  opts?: RankOptions
): { beatingRoot: T[]; belowRoot: T[] } {
  const sorted = [...list].sort((a, b) => b.bestApySustainablePct - a.bestApySustainablePct);
  const beating = sorted.filter((r) => r.beatsRoot);
  const below = sorted.filter((r) => !r.beatsRoot);
  if (opts?.limit == null) return { beatingRoot: beating, belowRoot: below };
  const limit = Math.max(opts.limit, 0);
  return {
    beatingRoot: beating.slice(0, limit),
    belowRoot: below.slice(0, Math.max(0, limit - beating.length)),
  };
}
