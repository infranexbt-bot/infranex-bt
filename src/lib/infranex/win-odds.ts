/**
 * WIN-ODDS-1 — "Can I win here?" — competition reality for a NEW seat.
 *
 * The blunt question a miner asks before spending a dollar: the top-10 of
 * many GPU subnets take essentially ALL of the incentive (datacenter farms
 * with dedicated code teams + stake-weighted validator trust). This module
 * turns the raw chain signals already merged onto every opportunity row —
 * rewardedRatio, top10IncentiveShare, rewardMedianShare, freeSlots,
 * rampWeeks, earnChance — into ONE honest tier + a list of reasons.
 *
 * Client-safe pure module: no db, no server imports.
 *
 * Tiers (worst → best evaluated first, first match wins):
 *   DONT_ENTER   — winner-take-all: <5% of slots earn anything, or the top
 *                  10% of UIDs take ≥95% of the pot. A new seat earns ≈ $0
 *                  and you pay the registration burn for the privilege.
 *   KNIFE_FIGHT  — pro farms take most of the pot: <20% rewarded or top-10%
 *                  share ≥85% or month-1 odds <20%. Expect scraps unless you
 *                  out-engineer incumbents.
 *   FIGHTABLE    — real odds but not easy: month-1 odds <50%, or the subnet
 *                  is full (you must displace an incumbent), or whales still
 *                  take ≥50%.
 *   OPEN_FIELD   — new seats actually earn here: rewarded share ≥~50%,
 *                  whales <50%, month-1 odds ≥50%.
 *   UNKNOWN      — no reward-spread data yet (never fabricate an answer).
 */

export type WinTier =
  | "OPEN_FIELD"
  | "FIGHTABLE"
  | "KNIFE_FIGHT"
  | "DONT_ENTER"
  | "UNKNOWN";

export interface WinTierStyle {
  label: string;
  chipClass: string;
  dotClass: string;
  headline: string;
}

export const WIN_TIER_STYLES: Record<WinTier, WinTierStyle> = {
  OPEN_FIELD: {
    label: "Open field",
    chipClass: "border-success/40 bg-success/10 text-success",
    dotClass: "bg-success",
    headline: "New seats earn here — enter without fear",
  },
  FIGHTABLE: {
    label: "Fightable",
    chipClass: "border-primary/40 bg-primary/10 text-primary",
    dotClass: "bg-primary",
    headline: "Real odds but not easy — read the warnings",
  },
  KNIFE_FIGHT: {
    label: "Knife fight",
    chipClass: "border-warning/40 bg-warning/10 text-warning",
    headline: "Pro farms take most of the pot — expect scraps",
    dotClass: "bg-warning",
  },
  DONT_ENTER: {
    label: "Don't enter",
    chipClass: "border-destructive/40 bg-destructive/10 text-destructive",
    dotClass: "bg-destructive",
    headline: "Winner-take-all — a new seat earns ≈ $0",
  },
  UNKNOWN: {
    label: "No data",
    chipClass: "border-border/60 bg-card/30 text-muted-foreground",
    dotClass: "bg-muted-foreground",
    headline: "No reward-spread data yet — no honest answer",
  },
};

/** Structural input — every merged opportunity row satisfies this. */
export interface WinOddsInput {
  id?: string;
  netuid: number;
  subnetName: string;
  subnetSymbol: string;
  category?: string;
  workType?: string;
  minVramGb?: number;
  earnChance?: {
    level: "high" | "medium" | "low" | "none";
    pct: number;
    note: string;
  } | null;
  rewardedRatio?: number | null;
  top10IncentiveShare?: number | null;
  rewardMedianShare?: number | null;
  freeSlots?: number | null;
  totalSlots?: number | null;
  rampWeeks?: number | null;
}

export interface WinOdds {
  netuid: number;
  subnetName: string;
  subnetSymbol: string;
  category: string;
  workType?: string;
  minVramGb: number;
  tier: WinTier;
  oddsPct: number | null;
  rewardedPct: number | null;
  top10Pct: number | null;
  medianSharePct: number | null;
  displacement: boolean;
  rampWeeks: number | null;
  freeSlots: number | null;
  totalSlots: number | null;
  why: string[];
}

const TIER_RANK: Record<WinTier, number> = {
  OPEN_FIELD: 0,
  FIGHTABLE: 1,
  KNIFE_FIGHT: 2,
  DONT_ENTER: 3,
  UNKNOWN: 4,
};

function pct(n: number): string {
  // Keep small rewarded shares honest ("1%" not "1.0%", "0.4%" not "0%").
  if (n > 0 && n < 1) return n.toFixed(1);
  return String(Math.round(n));
}

/**
 * Compute the competition-reality verdict for ONE subnet from raw signals.
 */
export function computeWinOdds(row: WinOddsInput): WinOdds {
  const rewarded = row.rewardedRatio ?? null;
  const top10 = row.top10IncentiveShare ?? null;
  const median = row.rewardMedianShare ?? null;
  const rewardedPct = rewarded != null ? rewarded * 100 : null;
  const top10Pct = top10 != null ? top10 * 100 : null;
  const medianSharePct = median != null ? median * 100 : null;
  const oddsPct = row.earnChance != null ? row.earnChance.pct : null;
  const displacement = row.freeSlots === 0;
  const why: string[] = [];

  // ---- reason collection (blunt, data-cited) ----
  if (rewardedPct != null) {
    why.push(
      rewarded === 0
        ? "0% of slots earned last epoch"
        : `only ${pct(rewardedPct)}% of slots earned last epoch`
    );
  }
  if (top10Pct != null && top10Pct >= 50) {
    why.push(`top-10% of UIDs take ${Math.round(top10Pct)}% of the pot`);
  }
  if (medianSharePct != null && medianSharePct < 50) {
    why.push(
      `median earner gets ${Math.round(medianSharePct)}% of the average payout`
    );
  }
  if (displacement) why.push("subnet full — you must displace an incumbent");
  if (row.rampWeeks != null && row.rampWeeks > 8) {
    why.push(`~${Math.round(row.rampWeeks)} wk bond ramp before full weight`);
  }
  if ((row.minVramGb ?? 0) > 0) {
    why.push(`needs ≥ ${row.minVramGb} GB VRAM`);
  }

  // ---- tier: worst-first, first match wins ----
  let tier: WinTier;
  if (
    (rewarded != null && rewarded < 0.05) ||
    (top10 != null && top10 >= 0.95) ||
    row.earnChance?.level === "none"
  ) {
    tier = "DONT_ENTER";
  } else if (
    (rewarded != null && rewarded < 0.2) ||
    (top10 != null && top10 >= 0.85) ||
    (oddsPct != null && oddsPct < 20)
  ) {
    tier = "KNIFE_FIGHT";
  } else if (
    (oddsPct != null && oddsPct < 50) ||
    displacement ||
    (top10 != null && top10 >= 0.5)
  ) {
    tier = "FIGHTABLE";
  } else if (
    oddsPct != null &&
    (rewarded == null || rewarded >= 0.5) &&
    (top10 == null || top10 < 0.5)
  ) {
    tier = "OPEN_FIELD";
  } else if (rewarded == null && top10 == null && row.earnChance == null) {
    tier = "UNKNOWN";
  } else {
    tier = "FIGHTABLE";
  }

  return {
    netuid: row.netuid,
    subnetName: row.subnetName,
    subnetSymbol: row.subnetSymbol,
    category: row.category ?? "",
    workType: row.workType,
    minVramGb: row.minVramGb ?? 0,
    tier,
    oddsPct,
    rewardedPct,
    top10Pct,
    medianSharePct,
    displacement,
    rampWeeks: row.rampWeeks ?? null,
    freeSlots: row.freeSlots ?? null,
    totalSlots: row.totalSlots ?? null,
    why,
  };
}

/**
 * Rank the whole network: best entry odds first. Tier dominates (you should
 * never scroll past a knife fight to reach an open field), then month-1 odds,
 * then rewarded share.
 */
export function rankWinOdds(rows: WinOddsInput[]): WinOdds[] {
  return rows
    .map(computeWinOdds)
    .sort(
      (a, b) =>
        TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
        (b.oddsPct ?? 0) - (a.oddsPct ?? 0) ||
        (b.rewardedPct ?? 0) - (a.rewardedPct ?? 0) ||
        a.netuid - b.netuid
    );
}

export function winTierCounts(rows: WinOdds[]): Record<WinTier, number> {
  const counts: Record<WinTier, number> = {
    OPEN_FIELD: 0,
    FIGHTABLE: 0,
    KNIFE_FIGHT: 0,
    DONT_ENTER: 0,
    UNKNOWN: 0,
  };
  for (const r of rows) counts[r.tier] += 1;
  return counts;
}

/** Lower = better seat (used by the flip watcher to rank improvements). */
export const WIN_TIER_RANK: Record<WinTier, number> = {
  OPEN_FIELD: 0,
  FIGHTABLE: 1,
  KNIFE_FIGHT: 2,
  DONT_ENTER: 3,
  UNKNOWN: 4,
};

/**
 * Raw tier from ONLY the fields persisted in ChainSnapshot.subnetsJson
 * (rewardedMiners/minersCount/top10IncentiveShare/rewardMedianShare) —
 * same thresholds as computeWinOdds minus the merge-time discounts
 * (earnChance bond-ramp / displacement). Boundary drift vs the panel is
 * possible by one tier when a subnet is full or the ramp is long; the flip
 * watcher therefore words its alerts as "reward spread now qualifies".
 * Returns null when the scan row carries no usable reward-spread data.
 */
export function computeRawWinTier(sub: {
  minersCount?: number | null;
  rewardedMiners?: number | null;
  top10IncentiveShare?: number | null;
  rewardMedianShare?: number | null;
}): WinTier | null {
  const miners = sub.minersCount ?? 0;
  const rewarded = sub.rewardedMiners;
  const top10 = sub.top10IncentiveShare ?? null;
  if ((rewarded == null && top10 == null) || miners <= 0) return null;
  const rewardedRatio = rewarded != null ? rewarded / miners : null;

  if (
    (rewardedRatio != null && rewardedRatio < 0.05) ||
    (top10 != null && top10 >= 0.95)
  ) {
    return "DONT_ENTER";
  }
  if (
    (rewardedRatio != null && rewardedRatio < 0.2) ||
    (top10 != null && top10 >= 0.85)
  ) {
    return "KNIFE_FIGHT";
  }
  // Without month-1 odds, a spread of <50% rewarded or whales ≥50% is at
  // best fightable — matches the panel's FIGHTABLE preconditions.
  if (
    (rewardedRatio != null && rewardedRatio < 0.5) ||
    (top10 != null && top10 >= 0.5)
  ) {
    return "FIGHTABLE";
  }
  return "OPEN_FIELD";
}
