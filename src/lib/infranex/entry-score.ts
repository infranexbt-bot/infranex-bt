/**
 * ENTRY-SCORE-1 — "If I register a NEW seat here today, what are my odds?"
 *
 * Extends the Win-Odds tier (win-odds.ts, categorical: open field → don't
 * enter) into a continuous 0-100 score built ONLY from signals the chain
 * scan already measures per subnet:
 *
 *   breadth   — rewardedMiners / minersCount: the fraction of seats that
 *               actually earned incentive last epoch (0-40 pts). This is the
 *               single best proxy for "does a fresh UID get polled & paid".
 *   openPot   — 1 − top10IncentiveShare: the slice of the pot NOT captured
 *               by the top-10% whale cohort (0-35 pts). 100% concentration
 *               ⇒ 0 pts no matter how many seats are paid.
 *   fairness  — incentiveMedianShare: what the MEDIAN earning UID receives
 *               relative to the mean (0-10 pts). ≪1 ⇒ a few whales eat the
 *               average and a mid-pack seat sees far less than the mean.
 *   prize     — minerEmissionTaoPerDay / rewardedMiners = TAO/day per
 *               earning seat (0-15 pts, log-scaled across the network so a
 *               huge prize on a tiny subnet doesn't dominate).
 *
 * Missing components drop out of BOTH the numerator and denominator — the
 * module never invents data. Score is null when breadth AND concentration
 * are both unknown (same honesty rule as computeRawWinTier).
 *
 * Derived guidance (labeled as estimates, mean-based):
 *   newcomerOddsPct ≈ breadth × openPot × 100  — blunt month-1 odds for a
 *                   fresh seat: it must both land in the earning set AND in
 *                   the non-whale pot.
 *   newcomerEvTao   ≈ prizePerSeat × breadth × openPot — expected TAO/day
 *                   for that seat; whale-heavy subnets actually pay the
 *                   median earner less (see fairness).
 *
 * Also surfaced per subnet: displacement (subnet full — a new registration
 * evicts the lowest-incentive UID, i.e. the newcomer), immunity runway
 * (immunityBlocks × 12 s — how long a zero-earning newcomer is protected
 * before becoming evictable) and the live registration burn (entry cost).
 *
 * Client-safe pure module: no db, no server imports.
 */

export interface EntryScoreInput {
  netuid: number;
  minersCount: number | null;
  rewardedMiners: number | null;
  top10IncentiveShare: number | null;
  incentiveMedianShare: number | null;
  minerEmissionTaoPerDay: number;
  maxUids: number | null;
  immunityBlocks: number | null;
  burnCostTao: number | null;
}

export interface EntryScore {
  netuid: number;
  /** 0-100, null when breadth AND concentration are both unknown. */
  score: number | null;
  grade: "A" | "B" | "C" | "D" | "F" | "?";
  /** rewarded / registered (0-1), null when unmeasured. */
  breadth: number | null;
  /** 1 − top10IncentiveShare (0-1), null when unmeasured. */
  openPot: number | null;
  /** incentiveMedianShare (0-1), null when unmeasured. */
  fairness: number | null;
  /** minerEmissionTaoPerDay ÷ rewardedMiners, null when no paid miners. */
  prizePerSeatTao: number | null;
  /** Month-1 odds estimate for a fresh seat (0-100, %). */
  newcomerOddsPct: number | null;
  /** Expected TAO/day for a fresh seat (mean-based estimate). */
  newcomerEvTao: number | null;
  /** Immunity runway in hours before a zero-earning UID is evictable. */
  runwayHours: number | null;
  /** maxUids − minersCount; negative ⇒ registration competes. */
  freeSlots: number | null;
  /** Subnet full — a new seat displaces an incumbent (usually the newcomer). */
  displacement: boolean;
  /** Live registration burn (TAO). */
  burnTao: number | null;
  /** Data-cited factors, worst first — rendered as the chip tooltip. */
  reasons: string[];
}

/** Bittensor block time — 4096-block default immunity ≈ 13.65 h. */
const BLOCK_SECONDS = 12;
const PRIZE_PTS_MAX = 15;
const FAIRNESS_PTS_MAX = 10;
const OPENPOT_PTS_MAX = 35;
const BREADTH_PTS_MAX = 40;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function computeEntryScore(
  sub: EntryScoreInput,
  prizeScale: { lo: number; hi: number } | null,
): EntryScore {
  const breadth =
    sub.rewardedMiners != null &&
    sub.minersCount != null &&
    sub.minersCount > 0
      ? clamp01(sub.rewardedMiners / sub.minersCount)
      : null;
  const openPot =
    sub.top10IncentiveShare != null
      ? clamp01(1 - clamp01(sub.top10IncentiveShare))
      : null;
  const fairness =
    sub.incentiveMedianShare != null
      ? clamp01(sub.incentiveMedianShare)
      : null;
  const prizePerSeatTao =
    sub.rewardedMiners != null &&
    sub.rewardedMiners > 0 &&
    sub.minerEmissionTaoPerDay > 0
      ? sub.minerEmissionTaoPerDay / sub.rewardedMiners
      : null;

  // ---- component points (null components drop out of the scale) ----
  const breadthPts =
    breadth != null ? Math.min(1, breadth / 0.9) * BREADTH_PTS_MAX : null;
  const openPotPts = openPot != null ? openPot * OPENPOT_PTS_MAX : null;
  const fairnessPts =
    fairness != null ? fairness * FAIRNESS_PTS_MAX : null;
  let prizePts: number | null = null;
  if (prizePerSeatTao != null && prizeScale && prizeScale.hi > prizeScale.lo) {
    const t =
      (Math.log10(Math.max(prizePerSeatTao, 1e-6)) -
        Math.log10(prizeScale.lo)) /
      (Math.log10(prizeScale.hi) - Math.log10(prizeScale.lo));
    prizePts = clamp01(t) * PRIZE_PTS_MAX;
  }

  const earned = [breadthPts, openPotPts, fairnessPts, prizePts].reduce<number>(
    (a, v) => a + (v ?? 0),
    0,
  );
  // Missing components drop out of the denominator — never invent data.
  const possible =
    (breadthPts != null ? BREADTH_PTS_MAX : 0) +
    (openPotPts != null ? OPENPOT_PTS_MAX : 0) +
    (fairnessPts != null ? FAIRNESS_PTS_MAX : 0) +
    (prizePts != null ? PRIZE_PTS_MAX : 0);

  const hasCore = breadth != null || sub.top10IncentiveShare != null;
  const score =
    hasCore && possible > 0
      ? Math.round(Math.min(100, Math.max(0, (earned / possible) * 100)))
      : null;
  const grade: EntryScore["grade"] =
    score == null
      ? "?"
      : score >= 80
        ? "A"
        : score >= 65
          ? "B"
          : score >= 50
            ? "C"
            : score >= 35
              ? "D"
              : "F";

  const newcomerOddsPct =
    breadth != null && openPot != null
      ? Math.round(breadth * openPot * 1000) / 10
      : null;
  const newcomerEvTao =
    prizePerSeatTao != null && breadth != null && openPot != null
      ? Math.round(prizePerSeatTao * breadth * openPot * 1000) / 1000
      : null;

  const runwayHours =
    sub.immunityBlocks != null && sub.immunityBlocks > 0
      ? Math.round(((sub.immunityBlocks * BLOCK_SECONDS) / 3600) * 10) / 10
      : null;
  const freeSlots =
    sub.maxUids != null && sub.minersCount != null
      ? sub.maxUids - sub.minersCount
      : null;
  const displacement = freeSlots != null && freeSlots <= 0;

  // ---- reasons (blunt, data-cited, worst first) ----
  const reasons: string[] = [];
  if (breadth != null) {
    const pct = Math.round(breadth * 100);
    reasons.push(
      sub.rewardedMiners === 0
        ? "0 of the registered seats earned last epoch"
        : `${pct}% of seats earned last epoch`,
    );
  }
  if (sub.top10IncentiveShare != null && sub.top10IncentiveShare >= 0.5) {
    reasons.push(
      `top-10% of UIDs take ${Math.round(sub.top10IncentiveShare * 100)}% of the pot`,
    );
  }
  if (fairness != null && fairness < 0.5) {
    reasons.push(
      `median earner gets ${Math.round(fairness * 100)}% of the average payout`,
    );
  }
  if (prizePerSeatTao != null) {
    reasons.push(
      `≈${prizePerSeatTao >= 10 ? prizePerSeatTao.toFixed(1) : prizePerSeatTao.toFixed(2)} TAO/day per earning seat`,
    );
  }
  if (displacement) {
    reasons.push("subnet full — you must displace an incumbent");
  } else if (freeSlots != null && freeSlots > 0) {
    reasons.push(`${freeSlots} free slot${freeSlots === 1 ? "" : "s"}`);
  }
  if (runwayHours != null) {
    reasons.push(`~${runwayHours}h immunity runway before evictable`);
  }
  if (sub.burnCostTao != null && sub.burnCostTao > 0) {
    reasons.push(`entry burn ≈${sub.burnCostTao.toFixed(2)} TAO`);
  }

  return {
    netuid: sub.netuid,
    score,
    grade,
    breadth,
    openPot,
    fairness,
    prizePerSeatTao,
    newcomerOddsPct,
    newcomerEvTao,
    runwayHours,
    freeSlots,
    displacement,
    burnTao: sub.burnCostTao,
    reasons,
  };
}

/**
 * Score a whole network. The prize component is log-scaled across the
 * subnets that HAVE prize data, so every row shares one honest scale.
 * Returns scores keyed by netuid plus the top picks (score desc, data
 * complete first) for the "best entry points" strip.
 */
export function rankEntryScores(subs: EntryScoreInput[]): {
  byNetuid: Map<number, EntryScore>;
  topPicks: EntryScore[];
} {
  const prizes = subs
    .map(
      (s) =>
        s.rewardedMiners != null &&
        s.rewardedMiners > 0 &&
        s.minerEmissionTaoPerDay > 0
          ? s.minerEmissionTaoPerDay / s.rewardedMiners
          : null,
    )
    .filter((v): v is number => v != null && v > 0);
  const prizeScale =
    prizes.length >= 3
      ? {
          lo: Math.min(...prizes),
          hi: Math.max(...prizes),
        }
      : null;

  const scored = subs.map((s) => computeEntryScore(s, prizeScale));
  const byNetuid = new Map<number, EntryScore>();
  for (const s of scored) byNetuid.set(s.netuid, s);

  const topPicks = scored
    .filter((s) => s.score != null)
    .sort(
      (a, b) =>
        (b.score ?? 0) - (a.score ?? 0) ||
        (b.newcomerOddsPct ?? 0) - (a.newcomerOddsPct ?? 0) ||
        a.netuid - b.netuid,
    )
    .slice(0, 5);

  return { byNetuid, topPicks };
}

/** Grade chip styling — app theme tokens, same taxonomy as Win-Odds chips. */
export const ENTRY_GRADE_STYLES: Record<EntryScore["grade"], string> = {
  A: "border-success/40 bg-success/10 text-success",
  B: "border-success/25 bg-success/5 text-success/90",
  C: "border-warning/40 bg-warning/10 text-warning",
  D: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  F: "border-destructive/40 bg-destructive/10 text-destructive",
  "?": "border-border/60 bg-card/30 text-muted-foreground",
};
