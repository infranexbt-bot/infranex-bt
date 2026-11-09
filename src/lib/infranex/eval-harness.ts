// ---------------------------------------------------------------------------
// EVAL-HARNESS — score replay: "where would MY model rank this epoch, and
// what would it earn?"
//
// The honest version of "local eval": we cannot rerun a subnet's validator
// scoring function locally (it is the validator's own model, often closed),
// but we CAN replay its OUTPUT — the per-UID incentive vector the chain
// publishes every epoch. That vector IS the ground truth of who got paid
// how much, measured, not modeled.
//
// Two replay modes over the same measured curve:
//
//   PROSPECT  (no UID yet) — you place yourself at a performance percentile
//             among the current cohort (top-1% … bottom-half). The harness
//             maps percentile → insertion rank on the OBSERVED curve → the
//             incentive share the UID at that rank earns → τ/day ×
//             realizability × TAO price = $/day. Nothing is invented: every
//             dollar figure is "what the UID currently sitting at that rank
//             actually earns".
//
//   MY-UID    (registered miner) — hotkey → live UID, its measured incentive,
//             its rank, staleness, and the gap to the last earning seat:
//             "you earn 0.0009; seat #241 earns 0.0002 — you out-score it
//             already" or "the last paid seat holds 0.004 — 4× your score".
//
// THE BAR (the "can I out-score the incumbents?" answer):
//   incentiveNeeded = (target$/mo ÷ 30 ÷ TAO) ÷ realizedPool
//   → the first rank whose observed incentive ≥ that share is the cohort you
//   must beat. If even rank #1 cannot clear the target, the subnet cannot pay
//   the target to ANYONE — honest verdict, not a pitch.
//
// Pure and client-safe: the API route supplies chain reads (getUidState) and
// snapshot rows. All inputs are chain-measured or explicitly user-declared.
// ---------------------------------------------------------------------------

import { computeSeatTierFromRatio, type WinTier } from "./win-odds";

/** Percentile stops a prospect may place themselves at (fraction of cohort). */
export const PROSPECT_PERCENTILES = [
  { key: "top1", label: "Top 1%", pct: 0.01 },
  { key: "top5", label: "Top 5%", pct: 0.05 },
  { key: "top10", label: "Top 10%", pct: 0.1 },
  { key: "top25", label: "Top 25%", pct: 0.25 },
  { key: "median", label: "Median", pct: 0.5 },
  { key: "bottomHalf", label: "Bottom half", pct: 0.85 },
] as const;

export type ProspectKey = (typeof PROSPECT_PERCENTILES)[number]["key"];

// ---------------------------------------------------------------------------
// Inputs — everything chain-measured except the user's self-placement
// ---------------------------------------------------------------------------

export interface EvalCurveInput {
  /** Live per-UID incentive shares (0-1, index = uid, sums to ~1). */
  incentive: number[];
  /** Subnet miner emission pool, τ/day (chain snapshot). */
  poolTaoPerDay: number | null;
  /** rewardRealizability (0-1) — share of the pool that actually lands. */
  rewardRealizability: number | null;
  /** True when realizability was absent and 0.6 was assumed (rank-sim rule). */
  estimated?: boolean;
  taoUsd: number;
  /** Operator income target, $/month (ProfitabilitySettings.monthlyTargetUsd). */
  targetUsdPerMonth: number | null;
  minersCount: number | null;
  rewardedMiners: number | null;
  top10IncentiveShare: number | null;
}

export interface EvalMyUidInput {
  /** UID of the hotkey on this subnet (null = not registered). */
  uid: number | null;
  /** Blocks since the UID last updated (staleness signal). */
  lastUpdateBlock: number | null;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface EvalCohortLine {
  rank: number;
  uid: number;
  incentive: number;
}

export interface EvalReplayResult {
  netuid: number;
  /** Measured shape of the current epoch's reward vector. */
  curve: {
    registeredUids: number;
    earningUids: number;
    rewardedRatio: number | null;
    top10IncentiveShare: number | null;
    /** Incentive of the LAST earning seat — the floor of the paid cohort. */
    earnerFloorIncentive: number | null;
    /** Median incentive among earners. */
    medianEarnerIncentive: number | null;
    /** Mean incentive across the top-10% cohort. */
    topDecileMeanIncentive: number | null;
    /** Top-12 earning UIDs (uid + share) for the UI bar list. */
    topEarners: EvalCohortLine[];
    seatTier: WinTier | null;
  };
  money: {
    poolTaoPerDay: number | null;
    realizedPoolTaoPerDay: number | null;
    estimatedRealizability: boolean;
    taoUsd: number;
    targetUsdPerMonth: number | null;
  };
  /** PROSPECT mode — null in MY-UID mode. */
  prospect: {
    percentileKey: ProspectKey;
    label: string;
    /** 1-indexed insertion rank on the observed curve. */
    predictedRank: number;
    /** Observed incentive share of the UID currently at that rank. */
    predictedIncentive: number;
    tauPerDay: number | null;
    usdPerDay: number | null;
    usdPerMonth: number | null;
    meetsTarget: boolean | null;
  } | null;
  /** MY-UID mode — null in PROSPECT mode. */
  myUid: {
    uid: number;
    incentive: number;
    rank: number;
    lastUpdateBlock: number | null;
    /** Blocks since last update at read time. */
    stalenessBlocks: number | null;
    tauPerDay: number | null;
    usdPerDay: number | null;
    usdPerMonth: number | null;
    meetsTarget: boolean | null;
    /** Incentive × multiple vs the last earning seat (null if you earn more). */
    gapToEarnerFloor: { floorIncentive: number; floorRank: number; timesYouNeed: number | null } | null;
    /** The seat immediately above you on the curve — your next overtake. */
    seatAbove: EvalCohortLine | null;
    registered: boolean;
  } | null;
  /** The "beat the incumbents" bar — null when pool/target uncomputable. */
  bar: {
    /** Incentive share needed to clear the monthly target. */
    incentiveNeeded: number | null;
    /** First observed rank whose incentive clears the target (null = even #1 can't). */
    rankNeeded: number | null;
    /** Incentive of the UID at that rank (the score you must out-perform). */
    incentiveAtRank: number | null;
    /** τ/day the target demands (pre-realizability pool share). */
    targetTaoPerDay: number | null;
    /** True when rank #1's incentive × realized pool still misses the target. */
    impossibleForEveryone: boolean;
    note: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Curve building
// ---------------------------------------------------------------------------

export interface CurveRow {
  uid: number;
  incentive: number;
}

export function buildCurve(incentive: number[]): {
  sorted: CurveRow[];
  earners: CurveRow[];
} {
  const sorted = incentive
    .map((inc, uid) => ({ uid, incentive: inc }))
    .sort((a, b) => b.incentive - a.incentive || a.uid - b.uid);
  const earners = sorted.filter((r) => r.incentive > 0);
  return { sorted, earners };
}

// ---------------------------------------------------------------------------
// The replay
// ---------------------------------------------------------------------------

export function replayEval(
  netuid: number,
  input: EvalCurveInput,
  opts: { prospect?: ProspectKey; myUid?: EvalMyUidInput }
): EvalReplayResult {
  const { incentive, taoUsd } = input;
  const { sorted, earners } = buildCurve(incentive);
  const N = sorted.length;

  const pool = input.poolTaoPerDay;
  const estimated = input.estimated ?? input.rewardRealizability == null;
  const realFactor =
    input.rewardRealizability != null && input.rewardRealizability > 0
      ? input.rewardRealizability
      : estimated
        ? 0.6
        : 0;
  const realizedPool = pool != null ? pool * realFactor : null;

  const ratio =
    input.minersCount != null && input.rewardedMiners != null && input.minersCount > 0
      ? input.rewardedMiners / input.minersCount
      : null;
  const seatTier = computeSeatTierFromRatio({
    rewardedRatio: ratio,
    top10IncentiveShare: input.top10IncentiveShare,
  });

  // --- Observed curve stats -----------------------------------------------
  const topEarners: EvalCohortLine[] = earners.slice(0, 12).map((r) => ({
    rank: earners.indexOf(r) + 1,
    uid: r.uid,
    incentive: r.incentive,
  }));
  const earnerFloor = earners.length > 0 ? earners[earners.length - 1] : null;
  const medianEarner =
    earners.length > 0 ? earners[Math.floor((earners.length - 1) / 2)] : null;
  const decileSeats = N > 0 ? Math.max(1, Math.ceil(N * 0.1)) : null;
  const topDecileMean =
    decileSeats != null && sorted.length >= decileSeats
      ? sorted.slice(0, decileSeats).reduce((s, r) => s + r.incentive, 0) / decileSeats
      : null;

  const usdPerDay = (inc: number | null): number | null =>
    inc != null && realizedPool != null && taoUsd > 0 ? inc * realizedPool * taoUsd : null;

  // --- THE BAR -------------------------------------------------------------
  let bar: EvalReplayResult["bar"] = null;
  const targetUsd = input.targetUsdPerMonth;
  if (targetUsd != null && targetUsd > 0 && realizedPool != null && realizedPool > 0 && taoUsd > 0) {
    const targetTaoPerDay = targetUsd / 30 / taoUsd;
    const incentiveNeeded = targetTaoPerDay / realizedPool;
    const hit = earners.findIndex((r) => r.incentive >= incentiveNeeded);
    const rankNeeded = hit >= 0 ? hit + 1 : null;
    const impossible = rankNeeded == null && earners.length > 0 && earners[0].incentive < incentiveNeeded;
    bar = {
      incentiveNeeded,
      rankNeeded,
      incentiveAtRank: rankNeeded != null ? earners[rankNeeded - 1].incentive : null,
      targetTaoPerDay,
      impossibleForEveryone: impossible,
      note: impossible
        ? `Even the #1 earner (${(earners[0].incentive * 100).toFixed(2)}% share × realized pool ${realizedPool.toFixed(2)} τ/d) cannot clear $${targetUsd}/mo — no placement on this subnet reaches the target.`
        : rankNeeded != null
          ? `To make $${targetUsd}/mo you need ≥ ${(incentiveNeeded * 100).toFixed(2)}% of the realized pool — today that is rank #${rankNeeded} of ${N} (UID #${earners[rankNeeded - 1].uid}). Out-score that cohort.`
          : `Target needs ≥ ${(incentiveNeeded * 100).toFixed(2)}% of the realized pool — no current earner reaches it (the pool itself is too small).`,
    };
  }

  // --- PROSPECT mode --------------------------------------------------------
  let prospect: EvalReplayResult["prospect"] = null;
  if (opts.prospect) {
    const stop = PROSPECT_PERCENTILES.find((p) => p.key === opts.prospect) ?? PROSPECT_PERCENTILES[2];
    const predictedRank = N > 0 ? Math.max(1, Math.ceil(stop.pct * N)) : 1;
    const at = sorted.length >= predictedRank ? sorted[predictedRank - 1] : null;
    const predictedIncentive = at?.incentive ?? 0;
    const usdDay = usdPerDay(predictedIncentive);
    prospect = {
      percentileKey: stop.key,
      label: stop.label,
      predictedRank,
      predictedIncentive,
      tauPerDay: realizedPool != null ? predictedIncentive * realizedPool : null,
      usdPerDay: usdDay,
      usdPerMonth: usdDay != null ? usdDay * 30 : null,
      meetsTarget:
        usdDay != null && targetUsd != null && targetUsd > 0 ? usdDay * 30 >= targetUsd : null,
    };
  }

  // --- MY-UID mode ----------------------------------------------------------
  let myUid: EvalReplayResult["myUid"] = null;
  if (opts.myUid) {
    const { uid, lastUpdateBlock } = opts.myUid;
    const registered = uid != null && uid >= 0 && sorted.some((r) => r.uid === uid);
    if (registered && uid != null) {
      const mine = sorted.find((r) => r.uid === uid)!;
      const rank = sorted.findIndex((r) => r.uid === uid) + 1;
      const usdDay = usdPerDay(mine.incentive);
      const above = rank > 1 ? sorted[rank - 2] : null;
      let gap: NonNullable<EvalReplayResult["myUid"]>["gapToEarnerFloor"] = null;
      if (earnerFloor && mine.incentive < earnerFloor.incentive) {
        gap = {
          floorIncentive: earnerFloor.incentive,
          floorRank: earners.indexOf(earnerFloor) + 1,
          timesYouNeed:
            mine.incentive > 0
              ? earnerFloor.incentive / mine.incentive
              : null, // zero incentive — you need to enter the paid cohort, not multiply
        };
      }
      myUid = {
        uid,
        incentive: mine.incentive,
        rank,
        lastUpdateBlock: lastUpdateBlock ?? null,
        stalenessBlocks: null, // filled by the route with the current block
        tauPerDay: realizedPool != null ? mine.incentive * realizedPool : null,
        usdPerDay: usdDay,
        usdPerMonth: usdDay != null ? usdDay * 30 : null,
        meetsTarget:
          usdDay != null && targetUsd != null && targetUsd > 0 ? usdDay * 30 >= targetUsd : null,
        gapToEarnerFloor: gap,
        seatAbove: above
          ? { rank: rank - 1, uid: above.uid, incentive: above.incentive }
          : null,
        registered: true,
      };
    } else {
      myUid = {
        uid: uid ?? -1,
        incentive: 0,
        rank: N > 0 ? N : 0,
        lastUpdateBlock: lastUpdateBlock ?? null,
        stalenessBlocks: null,
        tauPerDay: 0,
        usdPerDay: 0,
        usdPerMonth: 0,
        meetsTarget: false,
        gapToEarnerFloor: earnerFloor
          ? { floorIncentive: earnerFloor.incentive, floorRank: earners.indexOf(earnerFloor) + 1, timesYouNeed: null }
          : null,
        seatAbove: null,
        registered: false,
      };
    }
  }

  return {
    netuid,
    curve: {
      registeredUids: N,
      earningUids: earners.length,
      rewardedRatio: ratio,
      top10IncentiveShare: input.top10IncentiveShare,
      earnerFloorIncentive: earnerFloor?.incentive ?? null,
      medianEarnerIncentive: medianEarner?.incentive ?? null,
      topDecileMeanIncentive: topDecileMean,
      topEarners,
      seatTier,
    },
    money: {
      poolTaoPerDay: pool,
      realizedPoolTaoPerDay: realizedPool,
      estimatedRealizability: estimated && realFactor === 0.6,
      taoUsd,
      targetUsdPerMonth: targetUsd,
    },
    prospect,
    myUid,
    bar,
  };
}
