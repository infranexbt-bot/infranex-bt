import type { LiveOpportunity } from "./live-merge";

// ---------------------------------------------------------------------------
// NET-EARNINGS-1 — "Rank opportunities by expected net earnings, not
// emissions." The user-facing estimate of what YOUR miner actually banks:
//
//   realistic rewards  (competition · validator scoring · uptime · ramp)
//   − electricity      (owned basis; rent stands in on the rented one)
//   − cooling          (owned basis — % uplift on the electricity line)
//   − registration     (burn, amortized)
//   − maintenance      (owned basis)
//   − hardware recovery (rig capex depreciated — owned basis)
//   − storage / infra / other opex
//   = NET, shown as CONSERVATIVE / BASE / OPTIMISTIC, each with a
//     CONFIDENCE level derived from the data behind it.
//
// The profit-opportunity this encodes: never spend money on a popular subnet
// where a NEW miner is unlikely to cover its costs — the conservative month
// is the honest test, and a negative one is flagged in the UI (RAMP-LOSS).
//
// HONESTY CONTRACT — mirrors live-merge: every factor is traceable to a
// chain measurement (reward vector, top-10 share, free slots, ramp), a repo
// scrape, curated mechanics, or an explicitly-labelled operating assumption
// (uptime). No source → factor 1.0 or the documented default, never invented.
// ---------------------------------------------------------------------------

export type NetEarningsKey = "conservative" | "base" | "optimistic";

export interface NetEarningsFactors {
  /** Bond-EMA / validator-scoring ramp fraction while a fresh UID builds trust. */
  ramp: number;
  /** Your execution uptime vs the measured (online) median miner. */
  uptime: number;
  /** Seat-share squeeze from whale concentration / zero free slots. */
  competition: number;
  /** Stressed realizable alpha price (the −40% class of downside). */
  alpha: number;
}

export type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW";

export interface NetEarningsScenario {
  key: NetEarningsKey;
  label: string;
  /** Assumption sentence shown under the number. */
  note: string;
  grossMonthlyUsd: number;
  netMonthlyUsd: number;
  meetsTarget: boolean;
  /** Multiplicative factors applied to the base gross (base = all 1.0). */
  factors: NetEarningsFactors;
  /** 0–1 — how much data stands behind this scenario's number. */
  confidence: number;
  confidenceBand: ConfidenceBand;
  /** Why the confidence landed there (each driver named). */
  confidenceDrivers: string[];
}

/** What the worst month says about the play — the avoid-popular-traps verdict. */
export type ConservativeVerdict =
  // worst month still clears the user's minimum target
  | "RESILIENT"
  // worst month still cash-positive, below target
  | "CASH_POSITIVE"
  // worst month loses money (rewards don't cover the stack while ramping)
  | "RAMP_LOSS"
  // the BASE month itself is negative — every epoch worked loses money
  | "LOSS_MAKING";

export interface NetEarningsCostStack {
  /** Mode-aware GPU line: market rent (rented) or electricity (owned). */
  gpuOrElectricityUsd: number;
  coolingUsd: number;
  storageUsd: number;
  infrastructureUsd: number;
  maintenanceUsd: number;
  /** Amortized registration burn. */
  registrationUsd: number;
  /** Rig capex depreciation (owned; 0 rented). */
  hardwareRecoveryUsd: number;
  /** Misc opex. */
  otherUsd: number;
  totalUsd: number;
}

export interface NetEarningsEstimate {
  id: string;
  netuid: number;
  subnetName: string;
  conservative: NetEarningsScenario;
  base: NetEarningsScenario;
  optimistic: NetEarningsScenario;
  costs: NetEarningsCostStack;
  /** Wording for what the GPU line charges on the active cost basis. */
  costBasisNote: string;
  /** Cash you must survive before the first net dollar: burn + first month. */
  upfrontCashUsd: number;
  /** Months to recover upfront cash out of BASE net (null: never / no burn). */
  breakEvenMonths: number | null;
  conservativeVerdict: ConservativeVerdict;
  /** What a NEW miner should take away, in one sentence. */
  oneLine: string;
  /** True when the P&L was missing and the estimate could not be built. */
  missing: boolean;
}

export type NetEarningsContext = {
  /** Minimum acceptable net profit, USD/month (settings). */
  minNetTargetUsd?: number;
  /** Active cost basis — decides the cost-stack wording. When omitted it is
   *  inferred from the P&L lines (rented leaves cooling/maintenance/recovery
   *  at exactly 0 by construction). */
  hardwareMode?: "rent" | "owned";
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r0 = (n: number) => Math.round(n);
const usd = (n: number) => `$${Math.abs(Math.round(n)).toLocaleString()}`;

// --- Operating assumptions (labelled, not hidden) ---------------------------
// Uptime: the measured median earner is online and scoring — that IS the
// base. The conservative month models YOUR execution risk on top.
const UPTIME = { conservative: 0.92, base: 1, optimistic: 1 } as const;
// Alpha price stress in the conservative month: the realizable price of a
// fresh miner's rewards sits well below spot (thin pools, sell pressure).
const ALPHA = { conservative: 0.6, base: 1, optimistic: 1 } as const;

// --- Confidence model -------------------------------------------------------
// Confidence is a property of the DATA, not of optimism. Drivers are additive
// (audit-friendly); scenario modifiers reflect assumption stacking: the
// conservative month stacks 4 factors (widest error bars), the upside leans
// on today's winners repeating (the least certain claim of all).

export function confidenceBandOf(c: number): ConfidenceBand {
  if (c >= 0.7) return "HIGH";
  if (c >= 0.45) return "MEDIUM";
  return "LOW";
}

function buildConfidence(
  o: LiveOpportunity,
  scenario: NetEarningsKey
): { confidence: number; band: ConfidenceBand; drivers: string[] } {
  const drivers: string[] = [];
  let c = 0.1; // floor — some number is always better than none
  if (o.rewardedRatio != null) {
    c += 0.2;
    drivers.push("+ live reward vector (who earned, measured)");
  }
  if (o.mechanics) {
    c += 0.2;
    drivers.push("+ payout mechanism verified against official sources");
  }
  if (o.requirementsSource) {
    c += 0.15;
    drivers.push("+ hardware requirements repo-documented");
  }
  if (o.revenueBasis === "provider-marketplace") {
    c += 0.15;
    drivers.push("+ revenue is measured off-chain provider income, not modeled emission");
  }
  if (o.demandScore != null) {
    c += 0.1;
    if (o.demandBand === "real-demand") {
      c += 0.05;
      drivers.push("+ on-chain demand backs the rewards (real-demand)");
    } else if (o.demandBand === "emission-funded") {
      c -= 0.1;
      drivers.push("− rewards lean on staking dilution, not external demand");
    } else {
      drivers.push("+ on-chain demand composite available (mixed)");
    }
  }
  if (o.rampWeeks != null) {
    c += 0.05;
    drivers.push("+ ramp curve estimated from subnet age + mechanics");
  }
  if (typeof o.confidence === "number" && o.confidence > 0) {
    c += o.confidence * 0.15;
  }
  // Scenario modifiers.
  if (scenario === "conservative") {
    c *= 0.9;
    drivers.push("× 0.9 — four stacked assumptions widen the error bars");
  } else if (scenario === "optimistic") {
    c *= 0.85;
    drivers.push("× 0.85 — upside assumes today's winners repeat");
  }
  // Round to display precision BEFORE banding — the chip shows 2 decimals,
  // so the band must agree with the number the user can actually see.
  const confidence = Math.round(clamp(c, 0.05, 0.95) * 100) / 100;
  return { confidence, band: confidenceBandOf(confidence), drivers };
}

// --- Factor decomposition (rewards side) ------------------------------------

function conservativeCompetition(o: LiveOpportunity): { f: number; why: string[] } {
  const why: string[] = [];
  let f = 1;
  const top10 = o.top10IncentiveShare;
  if (top10 != null && top10 >= 0.7) {
    f *= top10 >= 0.85 ? 0.55 : 0.75;
    why.push(
      top10 >= 0.85
        ? `top-10 holders take ${(top10 * 100).toFixed(0)}% of incentive flow — a new seat's share is squeezed hard`
        : `concentrated incentive flow (top-10 ${(top10 * 100).toFixed(0)}%) trims the new seat's share`
    );
  }
  if (o.freeSlots != null && o.freeSlots <= 0) {
    f *= 0.9;
    why.push("no free slots — entry buys a queue position, earnings wait");
  }
  return { f, why };
}

function conservativeRamp(o: LiveOpportunity): { f: number; why: string | null } {
  const w = o.rampWeeks;
  if (w == null) return { f: 1, why: null };
  if (w <= 4) return { f: 1, why: `fast ramp (≈${Math.round(w)} wk) — trust builds quickly` };
  return {
    f: Math.max(4 / w, 0.15),
    why: `first month on a ≈${Math.round(w)}-week ramp — bonds/EMA build slowly, validators score the new UID late`,
  };
}

// --- The engine --------------------------------------------------------------

export function computeNetEarningsEstimate(
  o: LiveOpportunity,
  ctx: NetEarningsContext = {}
): NetEarningsEstimate | null {
  const prof = o.profitability;
  if (!prof) return null; // no P&L → no estimate; the UI shows "—" honestly

  const target = ctx.minNetTargetUsd ?? prof.targetUsd ?? 300;
  const inferredOwned =
    (prof.coolingUsd ?? 0) > 0 ||
    (prof.maintenanceUsd ?? 0) > 0 ||
    (prof.hardwareRecoveryUsd ?? 0) > 0 ||
    prof.hardwareRecoveryIncomplete === true;
  const owned = ctx.hardwareMode ? ctx.hardwareMode === "owned" : inferredOwned;

  // Cost stack — the SAME monthly bill in every scenario (costs run whether
  // or not rewards arrive), straight from the P&L so table, gates and this
  // estimate can never disagree.
  const costs: NetEarningsCostStack = {
    gpuOrElectricityUsd: prof.gpuRentalUsd,
    coolingUsd: prof.coolingUsd ?? 0,
    storageUsd: prof.storageUsd,
    infrastructureUsd: prof.infrastructureUsd,
    maintenanceUsd: prof.maintenanceUsd ?? 0,
    registrationUsd: prof.amortizedBurnUsd,
    hardwareRecoveryUsd: prof.hardwareRecoveryUsd ?? 0,
    otherUsd: prof.otherOperatingUsd,
    totalUsd: prof.totalCostsUsd,
  };
  const costBasisNote = owned
    ? "owned basis: electricity + cooling + maintenance + hardware recovery charged (rent is $0)"
    : "rented basis: market GPU rent bundles cooling, maintenance and the hardware itself";

  // Rewards side.
  const baseGross = prof.expectedRevenueUsd;
  const ramp = conservativeRamp(o);
  const comp = conservativeCompetition(o);
  const consFactors: NetEarningsFactors = {
    ramp: ramp.f,
    uptime: UPTIME.conservative,
    competition: comp.f,
    alpha: ALPHA.conservative,
  };
  const consGross =
    baseGross > 0
      ? baseGross * consFactors.ramp * consFactors.uptime * consFactors.competition * consFactors.alpha
      : 0;
  const optGross = Math.max(prof.scenarios.bull.grossMonthlyUsd, baseGross);

  const mkScenario = (
    key: NetEarningsKey,
    label: string,
    gross: number,
    factors: NetEarningsFactors,
    note: string
  ): NetEarningsScenario => {
    const net = gross > 0 ? gross - prof.totalCostsUsd : -prof.totalCostsUsd;
    const { confidence, band, drivers } = buildConfidence(o, key);
    return {
      key,
      label,
      note,
      grossMonthlyUsd: r0(gross),
      netMonthlyUsd: r0(net),
      meetsTarget: net >= target,
      factors,
      confidence: Math.round(confidence * 100) / 100,
      confidenceBand: band,
      confidenceDrivers: drivers,
    };
  };

  const conservativeNote = [
    ramp.why,
    comp.why.length ? comp.why.join("; ") : null,
    "your uptime ~92% vs the measured median",
    "alpha realizable at ~60% of spot",
  ]
    .filter(Boolean)
    .join(" · ");

  const conservative = mkScenario(
    "conservative",
    "Conservative",
    consGross,
    consFactors,
    conservativeNote ||
      "first month: fresh-UID trust, stressed alpha price, execution risk"
  );
  const base = mkScenario(
    "base",
    "Base",
    baseGross,
    { ramp: 1, uptime: 1, competition: 1, alpha: 1 },
    "median rewarded miner after ramp, current prices — the number the gates use"
  );
  const optimistic = mkScenario(
    "optimistic",
    "Optimistic",
    optGross,
    { ramp: 1, uptime: 1, competition: 1, alpha: 1 },
    "mean of currently-rewarded miners (today's earners) — upside for a well-run top seat"
  );

  // Verdict on the worst month — the "don't fund a trap" test.
  const conservativeVerdict: ConservativeVerdict =
    base.netMonthlyUsd < 0
      ? "LOSS_MAKING"
      : conservative.netMonthlyUsd >= target
        ? "RESILIENT"
        : conservative.netMonthlyUsd >= 0
          ? "CASH_POSITIVE"
          : "RAMP_LOSS";

  const upfrontCashUsd = r0(prof.registrationBurnUsd + prof.totalCostsUsd);
  const breakEvenMonths =
    prof.breakEvenDays != null ? Math.round((prof.breakEvenDays / 30) * 10) / 10 : null;

  const oneLine =
    conservativeVerdict === "LOSS_MAKING"
      ? `Every scenario loses money (base ${usd(base.netMonthlyUsd)}/mo) — do not fund.`
      : conservativeVerdict === "RAMP_LOSS"
        ? `First months run at ${usd(conservative.netMonthlyUsd)}/mo before ramping to ${usd(base.netMonthlyUsd)}/mo — budget ${usd(upfrontCashUsd)} upfront (burn + first-month costs).`
        : conservativeVerdict === "CASH_POSITIVE"
          ? `Worst month still banks ${usd(conservative.netMonthlyUsd)}; base ${usd(base.netMonthlyUsd)}/mo at ${base.confidenceBand.toLowerCase()} confidence.`
          : `Even the conservative month clears your $${Math.round(target).toLocaleString()} target (${usd(conservative.netMonthlyUsd)}); base ${usd(base.netMonthlyUsd)}/mo.`;

  return {
    id: o.id,
    netuid: o.netuid,
    subnetName: o.subnetName,
    conservative,
    base,
    optimistic,
    costs,
    costBasisNote,
    upfrontCashUsd,
    breakEvenMonths,
    conservativeVerdict,
    oneLine,
    missing: false,
  };
}

/** One pass over all rows — same pattern as computeOpportunityScoreMap. */
export function computeNetEarningsMap(
  rows: LiveOpportunity[],
  ctx: NetEarningsContext = {}
): Map<string, NetEarningsEstimate> {
  const m = new Map<string, NetEarningsEstimate>();
  for (const r of rows) {
    if (!r?.id) continue;
    try {
      const e = computeNetEarningsEstimate(r, ctx);
      if (e) m.set(r.id, e);
    } catch {
      // A row that cannot be estimated must never break the table.
    }
  }
  return m;
}

export const CONFIDENCE_BAND_STYLE: Record<ConfidenceBand, { label: string; className: string }> = {
  HIGH: { label: "High conf.", className: "text-success border-success/40 bg-success/10" },
  MEDIUM: { label: "Med conf.", className: "text-warning border-warning/40 bg-warning/10" },
  LOW: { label: "Low conf.", className: "text-destructive border-destructive/40 bg-destructive/10" },
};

export const CONSERVATIVE_VERDICT_META: Record<
  ConservativeVerdict,
  { label: string; className: string; detail: string }
> = {
  RESILIENT: {
    label: "Resilient",
    className: "text-success border-success/40 bg-success/10",
    detail: "Even the conservative month clears your minimum net-profit target.",
  },
  CASH_POSITIVE: {
    label: "Cash-positive",
    className: "text-primary border-primary/40 bg-primary/10",
    detail: "Worst month still banks cash, but below your target — size the position accordingly.",
  },
  RAMP_LOSS: {
    label: "Ramp loss",
    className: "text-warning border-warning/40 bg-warning/10",
    detail: "A new miner runs at a loss while ramping — budget the upfront cash before entering.",
  },
  LOSS_MAKING: {
    label: "Loss-making",
    className: "text-destructive border-destructive/40 bg-destructive/10",
    detail: "The base month itself is negative — every epoch worked loses money.",
  },
};
