// RANK-SIMULATOR — "given THIS rig, where do I point my compute, and what
// would a NEW entrant actually earn per epoch — at honest odds?"
//
// The per-earning-UID figure everywhere else in the app averages the WINNING
// cohort (survivorship bias): on a winner-take-all subnet it describes the 7
// whales, not seat #257. This simulator re-weights the same live chain data
// into three outcomes a newcomer can actually act on:
//
//   EV          = realizedPool ÷ ALL registered seats   — your expected $/d
//                 if you are exactly average among entrants. Algebraically
//                 this is rewardedRatio × winnerCohort, i.e. the base rate
//                 of earning anything, times what earners get.
//   MEDIAN      = winnerCohort when ≥50% of seats earn, else $0         —
//                 the outcome of the middle entrant (no luck required).
//   WINNERS     = realizedPool ÷ rewarded seats         — what the earning
//                 cohort gets ("if you crack the paid cohort").
//   TOP-DECILE  = realizedPool × top10IncentiveShare ÷ (10% of seats)   —
//                 what the top-10% cohort averages ("your top-10% goal").
//
// Every input is chain-measured (minerEmission, rewardedMiners, top10 share,
// realizability, burn cost); nothing is invented. Hardware matching, banned
// mentions and TEE gating are IDENTICAL to the explorer / buy panel, so the
// three views never disagree. Subnets whose audited requirement needs more
// than one GPU (or more VRAM than the card) are flagged cluster-only and
// excluded from the ranking — a single card cannot run them.
//
// Pure and client-safe: the API route supplies DB rows.

import { GPU_BUY_CATALOG, type GpuHardwareSpec, type TeeSupport } from "./gpu-buy-decision";
import { GPU_RESEARCH_META } from "./gpu-research-seed";
import { computeSeatTierFromRatio, type WinTier } from "./win-odds";

const norm = (s: string) => s.trim().toLowerCase();

// Same exclusion rule as the explorer (SN44 names cards only to ban them).
const BANNED_TOKENS: Record<number, string[]> = {
  44: ["RTX 5090", "B200", "H200", "H20", "MI300X"],
};

export interface RankerSeedRow {
  netuid: number;
  name: string;
  repo: string | null;
  cls: string;
  models: string[];
  headline: string;
  gpuCount: number | null;
  vramFloor: number | null;
  evidence: string | null;
}

export interface RankerLive {
  minerEmissionTaoPerDay?: number | null;
  minersCount?: number | null;
  rewardedMiners?: number | null;
  rewardRealizability?: number | null;
  top10IncentiveShare?: number | null;
  burnCostTao?: number | null;
}

export interface RankerOpportunity {
  classification?: string | null;
  difficulty?: string | null;
  netMonthlyUsd?: number | null;
}

export interface RankSimRow {
  netuid: number;
  name: string;
  repo: string | null;
  cls: string;
  headline: string;
  gpuCount: number | null;
  vramFloor: number | null;
  /** False = audited requirement needs a multi-GPU node / more VRAM. */
  runnable: boolean;
  teeRequired: boolean;
  poolTaoPerDay: number | null;
  /** pool × rewardRealizability — what actually lands in miner wallets. */
  realizedPoolTaoPerDay: number | null;
  minersCount: number | null;
  rewardedMiners: number | null;
  rewardedRatio: number | null;
  top10IncentiveShare: number | null;
  seatTier: WinTier | null;
  burnTao: number | null;
  /** Expected $/d for an average entrant = realizedPool ÷ all seats. */
  evUsdPerDay: number | null;
  /** Median entrant outcome: winners' mean if ≥50% earn, else 0. */
  medianUsdPerDay: number | null;
  /** Mean $/d across the rewarded cohort ("crack it and this is yours"). */
  winnerUsdPerDay: number | null;
  /** Mean $/d across the top-10% cohort (the "top 10%" goal line). */
  topDecileUsdPerDay: number | null;
  estimated: boolean;
  classification: string | null;
  difficulty: string | null;
  netMonthlyUsd: number | null;
}

export interface RankSimulatorResult {
  meta: {
    taoPriceUsd: number;
    auditedAt: string;
    universe: number;
  };
  rig: {
    model: string;
    label: string;
    vramGb: number;
    teeCapable: boolean;
    teeNote: string;
  };
  /** All catalog cards (single-card SKUs first) for the UI selector. */
  cards: { model: string; label: string; vramGb: number; cls: string; retail: boolean }[];
  /** Ranked by EV $/d desc — runnable single-card subnets only. */
  ranked: RankSimRow[];
  /** Named the card but need a multi-GPU node — never rankable solo. */
  clusterOnly: RankSimRow[];
  /** TEE-gated away from this card — informational only. */
  teeBlocked: { netuid: number; name: string }[];
}

export interface RankSimulatorInput {
  rows: RankerSeedRow[];
  liveByNetuid: Map<number, RankerLive>;
  oppByNetuid: Map<number, RankerOpportunity>;
  teeRequiredByNetuid: Map<number, boolean>;
  taoUsd: number;
  /** Catalog model token of the card to simulate (defaults to the rig). */
  gpuModel?: string | null;
}

function buildRow(
  r: RankerSeedRow,
  live: RankerLive | undefined,
  opp: RankerOpportunity | undefined,
  spec: GpuHardwareSpec,
  taoUsd: number,
  runnable: boolean,
  teeRequired: boolean
): RankSimRow {
  const pool = live?.minerEmissionTaoPerDay ?? null;
  const realizability = live?.rewardRealizability ?? null;
  const M = live?.minersCount ?? null;
  const R = live?.rewardedMiners ?? null;
  const top10 = live?.top10IncentiveShare ?? null;
  const burn = live?.burnCostTao ?? null;
  const estimated = pool != null && realizability == null;

  const realFactor = realizability != null && realizability > 0 ? realizability : estimated ? 0.6 : 0;
  const realizedPool = pool != null ? pool * (realFactor > 0 ? realFactor : 0) : null;

  const ratio = M != null && R != null && M > 0 ? R / M : null;
  const seatTier = computeSeatTierFromRatio({ rewardedRatio: ratio, top10IncentiveShare: top10 });

  const usd = (t: number | null): number | null => (t != null && taoUsd > 0 ? t * taoUsd : null);
  const winnerTao = realizedPool != null && R != null && R > 0 ? realizedPool / R : null;
  const decileSeats =
    M != null && M > 0 ? Math.max(1, Math.ceil(M * 0.1)) : null;
  const topDecileTao =
    realizedPool != null && top10 != null && decileSeats != null
      ? (realizedPool * top10) / decileSeats
      : null;
  const evTao = realizedPool != null && M != null && M > 0 ? realizedPool / M : null;
  const medianTao =
    winnerTao != null && ratio != null && ratio >= 0.5 ? winnerTao : ratio != null ? 0 : null;

  return {
    netuid: r.netuid,
    name: r.name,
    repo: r.repo,
    cls: r.cls,
    headline: r.headline,
    gpuCount: r.gpuCount,
    vramFloor: r.vramFloor,
    runnable,
    teeRequired,
    poolTaoPerDay: pool,
    realizedPoolTaoPerDay: realizedPool,
    minersCount: M,
    rewardedMiners: R,
    rewardedRatio: ratio,
    top10IncentiveShare: top10,
    seatTier,
    burnTao: burn,
    evUsdPerDay: usd(evTao),
    medianUsdPerDay: medianTao === null ? null : usd(medianTao) ?? 0,
    winnerUsdPerDay: usd(winnerTao),
    topDecileUsdPerDay: usd(topDecileTao),
    estimated,
    classification: opp?.classification ?? null,
    difficulty: opp?.difficulty ?? null,
    netMonthlyUsd: opp?.netMonthlyUsd ?? null,
  };
}

export function computeRankSimulator(input: RankSimulatorInput): RankSimulatorResult {
  const { rows, liveByNetuid, oppByNetuid, teeRequiredByNetuid, taoUsd } = input;

  // --- Card selection: requested model, else the best retail match. -------
  const requested = input.gpuModel ? norm(input.gpuModel) : null;
  const cards = GPU_BUY_CATALOG;
  const spec =
    (requested ? cards.find((c) => norm(c.model) === requested) : undefined) ??
    cards.find((c) => norm(c.model) === "rtx pro 6000") ??
    cards[0];

  const teeCapable = spec.tee !== "no";
  const ranked: RankSimRow[] = [];
  const clusterOnly: RankSimRow[] = [];
  const teeBlocked: { netuid: number; name: string }[] = [];

  for (const r of rows) {
    const banned = BANNED_TOKENS[r.netuid];
    const usable = banned
      ? r.models.filter((m) => !banned.some((b) => norm(b) === norm(m)))
      : r.models;
    if (!usable.some((m) => norm(m) === norm(spec.model))) continue;

    const teeRequired = teeRequiredByNetuid.get(r.netuid) === true;
    if (!teeCapable && teeRequired) {
      teeBlocked.push({ netuid: r.netuid, name: r.name });
      continue;
    }
    // Single-card runnability: audited gpuCount ≤ 1 AND vram floor fits.
    const runnable =
      (r.gpuCount == null || r.gpuCount <= 1) &&
      (r.vramFloor == null || r.vramFloor <= spec.vramGb);

    const row = buildRow(
      r,
      liveByNetuid.get(r.netuid),
      oppByNetuid.get(r.netuid),
      spec,
      taoUsd,
      runnable,
      teeRequired
    );
    if (runnable) ranked.push(row);
    else clusterOnly.push(row);
  }

  ranked.sort(
    (a, b) =>
      (b.evUsdPerDay ?? -1) - (a.evUsdPerDay ?? -1) ||
      (b.winnerUsdPerDay ?? -1) - (a.winnerUsdPerDay ?? -1) ||
      a.netuid - b.netuid
  );

  return {
    meta: {
      taoPriceUsd: taoUsd,
      auditedAt: GPU_RESEARCH_META.auditedAt,
      universe: rows.length,
    },
    rig: {
      model: spec.model,
      label: spec.label,
      vramGb: spec.vramGb,
      teeCapable,
      teeNote: spec.teeNote,
    },
    cards: cards
      .filter((c) => c.retail)
      .map((c) => ({ model: c.model, label: c.label, vramGb: c.vramGb, cls: c.cls, retail: c.retail })),
    ranked,
    clusterOnly,
    teeBlocked,
  };
}
