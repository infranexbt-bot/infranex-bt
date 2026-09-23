import type { Opportunity } from "./types";

// ---------------------------------------------------------------------------
// RENT-EARN ENGINE — "will a RENTED GPU/CPU (Akash / Vast / RunPod-class
// container or vCPU box) actually earn on this subnet?"
//
// The Miner's Ledger answers "is this subnet good"; this engine answers the
// operator's real follow-up: "is it good FOR A RENTED RIG AND A NEW SEAT".
// Three honest inputs the Ledger already tracks but never combined:
//
//   1. RENTABILITY GATE — some subnets' own docs forbid container clouds
//      (bare metal / TEE / static-IP fleets). A rented rig can't run them
//      AT ALL, no matter what the $/mo column says.
//   2. SEAT REALITY — rewardedRatio (share of slots that earned last epoch)
//      and top10IncentiveShare (whale dominance). A subnet where 2 UIDs take
//      100% of rewards is a knife fight; a new miner lands in the 97% that
//      earn nothing — while the headline $/mo was computed as the MEAN OF
//      THOSE 2 WHALES ("whale-mean inflation").
//   3. NEW-ENTRANT EV — expected net for someone registering today:
//      P(earn a seat) × median earner's share × the Ledger's net figure.
//
// Output: a 0–100 RENT-EARN score + GREAT/OK/POOR/NO band, rendered as the
// "Rent earn" column and the "Rented-friendly" filter on Opportunities.
// ---------------------------------------------------------------------------

/** Curated rent restrictions from the all-subnet README audit
 *  (worklog subnet-hosting-audit-1, verbatim evidence). Used as fallback
 *  when the live scraper has no hosting flags for the subnet yet. */
export const CURATED_RENT_BLOCKS: Record<
  number,
  { reason: string; source: string }
> = {
  64: {
    reason:
      "Bare metal + Intel TDX + static 1:1 IPs required (chutes-miner README) — container clouds (RunPod/Vast/Akash) explicitly excluded",
    source: "curated README audit",
  },
  4: {
    reason:
      "NVIDIA Confidential Compute (TEE) required per the repo's Current Implementation — rented containers have no CC mode",
    source: "curated README audit",
  },
  28: {
    reason:
      "Miner must run as a Phala Cloud Intel TDX CVM — not a plain rented container",
    source: "curated README audit",
  },
  51: {
    reason:
      "Executor must run inside an Intel TDX confidential VM with attestation (dstacktee) — needs a TEE-capable bare host",
    source: "curated README audit",
  },
  90: {
    reason:
      "Whole mechanism is TEE-attested Kubernetes clusters (Intel TDX + NVIDIA CC, 8-GPU passthrough, Kata+CoCo)",
    source: "curated README audit",
  },
};

export type RentEarnBand = "GREAT" | "OK" | "POOR" | "NO";

export interface RentEarnVerdict {
  /** Can a rented GPU/CPU from our catalog class (container/vCPU) run this? */
  rentable: boolean;
  /** Human-readable reason when not rentable. */
  rentBlock: string | null;
  /** "scraped README" | "curated README audit" | null */
  rentBlockSource: string | null;
  /** Share of slots that earned last epoch, % (chain fact). */
  earnChancePct: number | null;
  /** Top-10% of UIDs' share of epoch incentive, % (chain fact). */
  top10TakePct: number | null;
  /** rewardedRatio < 10% AND top10 ≥ 85% — winner-take-all seat. */
  knifeFight: boolean;
  /** rewardedRatio < 15% — the Ledger's $/mo is a mean over a handful of
   *  earning whales, not a forecast for a newcomer. */
  whaleMean: boolean;
  /** Free UID slots — "free-slot" = cheap entry, "displace" = must beat an incumbent. */
  entry: "free-slot" | "displace" | null;
  /** Expected net $/mo for a NEW seat: P(earn) × median share × Ledger net. */
  expectedNetMonthlyUsd: number | null;
  /** 0–100 RENT-EARN score. */
  score: number;
  band: RentEarnBand;
  /** One-line reasons behind the score. */
  notes: string[];
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function isCpuWork(o: Opportunity): boolean {
  return (
    o.minVramGb <= 0 ||
    (o.workType ?? "").toLowerCase().includes("cpu") ||
    /cpu/i.test(o.recommendedGpu ?? "")
  );
}

/** Compute the RENT-EARN verdict for one opportunity row. Pure — safe on
 *  client and server; takes the plain Opportunity shape so it works on any
 *  merged row (LiveOpportunity or curated fallback). */
export function computeRentEarn(o: Opportunity): RentEarnVerdict {
  const notes: string[] = [];

  // --- 1. Rentability gate -------------------------------------------------
  // Scraped hosting flags win; curated audit fills the gap; CPU work on a
  // rented vCPU box is always container-class.
  let rentable = true;
  let rentBlock: string | null = null;
  let rentBlockSource: string | null = null;
  const hosting = o.hosting ?? null;
  if (hosting && (hosting.bareMetalOnly || hosting.teeRequired)) {
    rentable = false;
    rentBlockSource = o.requirementsSource ? "scraped README" : "curated README audit";
    rentBlock = hosting.bareMetalOnly
      ? "Bare metal/VM required by the subnet's own docs — container clouds excluded"
      : "TEE/confidential hosting required — outside the rented catalog (Akash/Vast/RunPod)";
  } else if (CURATED_RENT_BLOCKS[o.netuid]) {
    rentable = false;
    rentBlock = CURATED_RENT_BLOCKS[o.netuid].reason;
    rentBlockSource = CURATED_RENT_BLOCKS[o.netuid].source;
  }
  if (rentable && isCpuWork(o)) {
    notes.push("CPU-class work — any rented vCPU box qualifies");
  }

  // --- 2. Seat reality ------------------------------------------------------
  const rew = o.rewardedRatio ?? null;
  const top10 = o.top10IncentiveShare ?? null;
  const earnChancePct = rew != null ? Math.round(rew * 1000) / 10 : null;
  const top10TakePct = top10 != null ? Math.round(top10 * 100) : null;
  const knifeFight = rew != null && top10 != null && rew < 0.1 && top10 >= 0.85;
  const whaleMean = rew != null && rew < 0.15;
  const freeSlots = o.freeSlots ?? null;
  const entry: RentEarnVerdict["entry"] =
    freeSlots == null ? null : freeSlots > 0 ? "free-slot" : "displace";
  if (knifeFight) {
    notes.push(
      `Knife fight — only ${earnChancePct}% of slots earned, top 10% of UIDs take ${top10TakePct}% of rewards`
    );
  } else if (whaleMean) {
    notes.push(
      `Whale-mean — just ${earnChancePct}% of slots earned; the $/mo headline is a mean over few earners`
    );
  }
  if (entry === "displace") {
    notes.push("Subnet full — a new seat must displace an incumbent");
  }

  // --- 3. New-entrant EV ----------------------------------------------------
  // P(earn a rewarded seat) × median earner's share of the mean × Ledger net.
  // On whale-mean rows the median share is noise (1-3 earners), so the EV is
  // flagged as a ceiling, not a forecast.
  const net = o.netMonthlyUsd ?? o.estimatedMonthlyRewardUsd ?? null;
  let ev: number | null = null;
  if (net != null && rew != null) {
    const medianShare = Math.min(Math.max(o.rewardMedianShare ?? 1, 0), 1.2);
    ev = net * rew * medianShare;
    if (whaleMean) {
      notes.push(
        `New-entrant EV ≈ $${Math.round(ev).toLocaleString()}/mo is a CEILING — treat as unproven until more UIDs earn`
      );
    }
  } else if (net != null) {
    ev = null;
  }

  // --- 4. Score ---------------------------------------------------------------
  // earn chance (50) — the platform's calibrated computeEarnChance pct
  //   (already folds top-10 dominance, full-subnet displacement, bond ramp)
  const earnPct = o.earnChance?.pct ?? null;
  const earnPts = earnPct != null ? clamp(earnPct, 0, 100) * 0.5 : 0;
  if (earnPct == null) notes.push("Earn chance unknown — no rewarded-ratio data");

  // rentability (20) — a rig we can't rent can't earn, whatever the sheet says
  const rentPts = rentable ? 20 : 0;

  // economics (20) — new-entrant EV vs a $2k/mo comfort line
  const evPts = ev != null ? clamp(ev / 2000, 0, 1) * 20 : 0;

  // distribution honesty (10) — broad rewards beat knife fights
  const distPts = knifeFight ? 0 : whaleMean ? 4 : 10;

  let score = Math.round(earnPts + rentPts + evPts + distPts);
  if (!rentable) score = Math.min(score, 24); // forced NO band

  const band: RentEarnBand =
    !rentable ? "NO" : score >= 65 ? "GREAT" : score >= 45 ? "OK" : score >= 25 ? "POOR" : "NO";

  if (!rentable) notes.unshift(rentBlock ?? "Not rentable");

  return {
    rentable,
    rentBlock,
    rentBlockSource,
    earnChancePct,
    top10TakePct,
    knifeFight,
    whaleMean,
    entry,
    expectedNetMonthlyUsd: ev != null ? Math.round(ev) : null,
    score: clamp(score, 0, 100),
    band,
    notes,
  };
}

/** Score a full list and return a Map keyed by row id — one pass for the
 *  whole Opportunities table (used for the Rent earn column + sort). */
export function computeRentEarnMap(
  rows: Opportunity[]
): Map<string, RentEarnVerdict> {
  const m = new Map<string, RentEarnVerdict>();
  for (const r of rows) m.set(r.id, computeRentEarn(r));
  return m;
}

export const RENT_EARN_BAND_STYLE: Record<
  RentEarnBand,
  { label: string; color: string; bg: string }
> = {
  GREAT: { label: "GREAT", color: "text-success", bg: "bg-success/10" },
  OK: { label: "OK", color: "text-primary", bg: "bg-primary/10" },
  POOR: { label: "POOR", color: "text-warning", bg: "bg-warning/10" },
  NO: { label: "NO", color: "text-destructive", bg: "bg-destructive/10" },
};
