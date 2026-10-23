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
  // SN51 removed from curated blocks (2026-10-23): the old entry was
  // Grail-era ("dstacktee CVM"). SN51 is now lium.io, a GPU rental marketplace
  // whose whole premise is that anyone can list a node — TDX is only required
  // for H100/H200/B200/GB200 tiers, consumer RTX cards run plain Sysbox
  // (playbook sn51 entry, docs.lium.io/providers, Datura-ai/lium-io).
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

// ---------------------------------------------------------------------------
// MODE-AWARE LABELS — the engine's mechanics are identical in both cost bases
// (hosting gate × seat reality × new-entrant EV, and the EV already reads the
// mode-aware ledger net). But the WORDS must follow the active
// ProfitabilityConfig.hardwareMode: a user who flipped the cost basis to
// "Owned" should never read "Rented-rig earn picks" or a "Rent earn" column.
// Every UI surface that renders this lens pulls its strings from here so the
// two stay in lockstep.
// ---------------------------------------------------------------------------
export interface RentEarnLabelSet {
  /** Summary card heading above the ranked table. */
  pickCardTitle: string;
  /** Summary card one-liner. */
  pickCardSubtitle: string;
  /** Card icon: cloud = rented fleet, zap = owned electricity. */
  pickCardIcon: "cloud" | "zap";
  /** "My GPU" filter option that selects GREAT/OK earn picks. */
  gpuFilterLabel: string;
  /** Table column header for the lens score. */
  columnLabel: string;
  columnTooltip: string;
  /** Table "Mining lenses" group header tooltip. */
  lensesTooltip: string;
  /** Dashboard picker Stat label + tooltip for the lens. */
  statLabel: string;
  statTooltip: string;
  /** Conviction formula fragment, e.g. "40% Rent earn + 35% … + 25% confidence". */
  convictionFormula: string;
  /** Dashboard picker Conviction Stat tooltip. */
  convictionStatTooltip: string;
  /** Dashboard picker footnote under the list. */
  convictionFootnote: string;
  /** Hardware icon tooltip for CPU-only rows. */
  cpuTitle: string;
}

export function rentEarnLabels(
  hardwareMode: "rent" | "owned" | undefined
): RentEarnLabelSet {
  if (hardwareMode === "owned") {
    return {
      pickCardTitle: "Owned-rig earn picks",
      pickCardSubtitle:
        "— your-rig economics × seat reality × new-entrant EV (Earn picks column) · hosting gates still apply",
      pickCardIcon: "zap",
      gpuFilterLabel: "Owned rig picks",
      columnLabel: "Earn picks",
      columnTooltip:
        "EARN PICKS (owned basis) — does a NEW seat have a real chance to earn on hardware you own? Combines the hosting gate (TEE / restricted fleets still apply), % of slots earning, top-10% reward concentration and new-entrant expected net (GPU line = owned electricity).",
      lensesTooltip:
        "Mining lenses — Earn picks (your-rig viability on the owned electricity basis) and Your odds (first-month earn odds if you register today).",
      statLabel: "Earn pick",
      statTooltip:
        "Hosting gate × seat reality × new-entrant EV — priced on owned electricity.",
      convictionFormula:
        "40% Earn pick + 35% Diligence pipeline + 25% confidence",
      convictionStatTooltip:
        "40% Earn pick + 35% Diligence pipeline + 25% model confidence, gated by the hosting gate, diligence fails and the minimum-profit rule",
      convictionFootnote:
        "Conviction = 40% Earn pick (hosting gate × seat reality × new-entrant EV, owned electricity basis) + 35% Diligence pipeline (14-stage health, hard-fail gated) + 25% model confidence — so a high number means your own rig can run the work, a new seat can realistically earn, and the pipeline found no deal-breaker. Click a row for the full breakdown; Mine opens the deploy flow.",
      cpuTitle: "CPU-only work — no GPU needed",
    };
  }
  return {
    pickCardTitle: "Rented-rig earn picks",
    pickCardSubtitle:
      "— rentable work × seat reality × new-entrant EV (Rent earn column)",
    pickCardIcon: "cloud",
    gpuFilterLabel: "Rented rig picks",
    columnLabel: "Rent earn",
    columnTooltip:
      "RENT-EARN — can a rented GPU/CPU (Akash/Vast-class) run this, and does a NEW seat have a real chance to earn? Combines rentability gate, % of slots earning, top-10% reward concentration and new-entrant expected net.",
    lensesTooltip:
      "Mining lenses — Rent earn (rented-rig viability) and Your odds (first-month earn odds if you register today).",
    statLabel: "Rent earn",
    statTooltip: "Rentability × seat reality × new-entrant EV.",
    convictionFormula:
      "40% Rent earn + 35% Diligence pipeline + 25% confidence",
    convictionStatTooltip:
      "40% Rent earn + 35% Diligence pipeline + 25% model confidence, gated by rentability, diligence fails and the minimum-profit rule",
    convictionFootnote:
      "Conviction = 40% Rent earn (rentability × seat reality × new-entrant EV) + 35% Diligence pipeline (14-stage health, hard-fail gated) + 25% model confidence — so a high number means a rented CPU/GPU rig can run the work, a new seat can realistically earn, and the pipeline found no deal-breaker. Click a row for the full breakdown; Mine opens the deploy flow.",
    cpuTitle: "CPU-only work — a rented vCPU box qualifies",
  };
}
