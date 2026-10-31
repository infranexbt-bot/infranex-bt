// ---------------------------------------------------------------------------
// Profitability Engine — the miner's P&L statement, per subnet.
//
//   Expected Revenue
//     − GPU Rental
//     − Storage
//     − Infrastructure
//     − Other operating costs
//     = NET PROFIT
//
// then derives: ROI, daily / weekly / monthly profit, break-even, profit
// margin and risk-adjusted profit — and enforces the MINIMUM ENTRY RULE:
//
//     NET PROFIT < minNetProfitTargetUsd  →  AVOID
//
// Every number a business would ask for before renting the GPU. The target
// and every cost line are CONFIGURABLE (persisted server-side via
// /api/profitability-config) — nothing is buried in code.
// ---------------------------------------------------------------------------

import type { ScoreComponents } from "./miner-score";
import {
  OPPORTUNITY_WEIGHTS,
  sanitizeOpportunityWeights,
  type OpportunityWeightSet,
} from "./subnet-opportunity";

// ---------------------------------------------------------------------------
// Configuration — persisted in SQLite (ProfitabilitySettings singleton),
// editable from the UI, with sane market defaults.
// ---------------------------------------------------------------------------

export interface ProfitabilityConfig {
  /** MINIMUM ENTRY RULE: net profit below this monthly USD → AVOID. */
  minNetProfitTargetUsd: number;
  /** TAO-ACCUMULATION-1 — the α→TAO goal line (TAO/month, default 1).
   *  0 disables the goal; verdicts then just use net > 0. */
  targetTaoPerMonth: number;
  /** TAO-ACCUMULATION-2 — the long-term bet ($/TAO). When set, the
   *  accumulation view values banked TAO at this price (e.g. 500 = "TAO
   *  doubles") instead of the live price. null = follow the live price.
   *  Re-values every row equally → ranking never changes. */
  assumedTaoPriceUsd: number | null;
  /** Storage line: NVMe volume / disk for models, logs, datasets ($/mo). */
  storageMonthlyUsd: number;
  /** Infrastructure line: VPS, monitoring, alerting ($/mo). 0 = auto by work
   *  type (base 40, scraping 120 for proxies). */
  infraMonthlyUsd: number;
  /** Other operating costs: bandwidth overage, top-up fees, misc ($/mo). */
  otherOpexMonthlyUsd: number;
  /** rent = pay market GPU rental (tier rate); owned = electricity model. */
  hardwareMode: "rent" | "owned";
  /** Electricity price for owned hardware ($/kWh). */
  electricityUsdPerKwh: number;
  /** OWNED-RIG PROFILE — your GPU's VRAM in GB (0 = not set). Drives the
   *  owned-basis rig-fit gate: a subnet needing more VRAM than the rig has
   *  is not runnable, whatever the $/mo says. */
  rigGpuVramGb: number;
  /** OWNED-RIG PROFILE — does the rig support confidential compute
   *  (NVIDIA CC on H100/H200/RTX PRO 6000 Blackwell, or Intel TDX)?
   *  Unlocks TEE-gated subnets (SN4 Targon, SN90, SN64, SN28) on the owned
   *  basis. */
  rigTeeCapable: boolean;
  /** Count the registration burn as an upfront cost (amortized). */
  includeRegistrationBurn: boolean;
  /** Months over which the registration burn is amortized. */
  amortizeBurnMonths: number;
  /** Apply the seat/alpha/earning risk factor to net profit. */
  riskAdjustment: boolean;
  // --- NET-EARNINGS-1: the full ownership cost stack -----------------------
  // The miner's real bill is electricity PLUS cooling PLUS maintenance PLUS
  // the rig itself. Rented rates bundle all of these into the market price —
  // these lines apply ONLY on the owned basis (0 on rent, by construction).
  /** Cooling uplift as % of the electricity line (owned basis). */
  coolingUpliftPct: number;
  /** Maintenance: cleaning, fans, thermal paste, misc repairs ($/mo, owned). */
  maintenanceMonthlyUsd: number;
  /** Total rig build cost for hardware recovery ($, owned; 0 = not set). */
  rigCapexUsd: number;
  /** Months over which the rig capex is recovered (depreciation). */
  rigAmortizeMonths: number;
  // --- OPPORTUNITY-SCORE-2: the decision-engine knobs ---------------------
  /** Runtime-configurable component weights (normalized to sum 1). Editable
   *  in settings; persisted as JSON in the DB; defaults = documented spec. */
  opportunityWeights: OpportunityWeightSet;
  /** OPPORTUNITY-CONTROLS — max APPROVED GPU spend per deployment ($/mo).
   *  null = no cap. The deployment API refuses rentals above it. */
  maxApprovedSpendUsd: number | null;
}

export const DEFAULT_PROFITABILITY_CONFIG: ProfitabilityConfig = {
  minNetProfitTargetUsd: 300,
  targetTaoPerMonth: 1,
  assumedTaoPriceUsd: null, // null = follow the live TAO price
  storageMonthlyUsd: 15,
  infraMonthlyUsd: 0, // 0 = auto by work type
  otherOpexMonthlyUsd: 25,
  hardwareMode: "rent",
  electricityUsdPerKwh: 0.12,
  rigGpuVramGb: 0,
  rigTeeCapable: false,
  includeRegistrationBurn: true,
  amortizeBurnMonths: 3,
  riskAdjustment: true,
  coolingUpliftPct: 15,
  maintenanceMonthlyUsd: 15,
  rigCapexUsd: 0,
  rigAmortizeMonths: 24,
  opportunityWeights: { ...OPPORTUNITY_WEIGHTS },
  maxApprovedSpendUsd: null, // null = no cap
};

/** Defensive parse of untrusted JSON (API body / DB row) → valid config. */
export function sanitizeProfitabilityConfig(raw: unknown): ProfitabilityConfig {
  const d = DEFAULT_PROFITABILITY_CONFIG;
  if (raw == null || typeof raw !== "object") return { ...d };
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n)
      ? Math.min(max, Math.max(min, n))
      : fallback;
  };
  return {
    minNetProfitTargetUsd: num(r.minNetProfitTargetUsd, d.minNetProfitTargetUsd, 0, 1_000_000),
    targetTaoPerMonth: num(r.targetTaoPerMonth, d.targetTaoPerMonth, 0, 10_000),
    // 0 / absent / non-finite → null (follow live); otherwise clamp 0..100k.
    assumedTaoPriceUsd: (() => {
      const n = typeof r.assumedTaoPriceUsd === "string" ? Number(r.assumedTaoPriceUsd) : r.assumedTaoPriceUsd;
      return typeof n === "number" && Number.isFinite(n) && n > 0
        ? Math.min(100_000, n)
        : null;
    })(),
    storageMonthlyUsd: num(r.storageMonthlyUsd, d.storageMonthlyUsd, 0, 100_000),
    infraMonthlyUsd: num(r.infraMonthlyUsd, d.infraMonthlyUsd, 0, 100_000),
    otherOpexMonthlyUsd: num(r.otherOpexMonthlyUsd, d.otherOpexMonthlyUsd, 0, 100_000),
    hardwareMode: r.hardwareMode === "owned" ? "owned" : "rent",
    electricityUsdPerKwh: num(r.electricityUsdPerKwh, d.electricityUsdPerKwh, 0, 10),
    rigGpuVramGb: num(r.rigGpuVramGb, d.rigGpuVramGb, 0, 4096),
    rigTeeCapable:
      typeof r.rigTeeCapable === "boolean" ? r.rigTeeCapable : d.rigTeeCapable,
    includeRegistrationBurn:
      typeof r.includeRegistrationBurn === "boolean"
        ? r.includeRegistrationBurn
        : d.includeRegistrationBurn,
    amortizeBurnMonths: Math.round(num(r.amortizeBurnMonths, d.amortizeBurnMonths, 1, 36)),
    riskAdjustment:
      typeof r.riskAdjustment === "boolean" ? r.riskAdjustment : d.riskAdjustment,
    coolingUpliftPct: num(r.coolingUpliftPct, d.coolingUpliftPct, 0, 200),
    maintenanceMonthlyUsd: num(r.maintenanceMonthlyUsd, d.maintenanceMonthlyUsd, 0, 100_000),
    rigCapexUsd: num(r.rigCapexUsd, d.rigCapexUsd, 0, 10_000_000),
    rigAmortizeMonths: Math.round(num(r.rigAmortizeMonths, d.rigAmortizeMonths, 1, 120)),
    // OPPORTUNITY-SCORE-2 — accepts the JSON object (API body) or the raw DB
    // JSON string; invalid/absent keys fall back to defaults, then normalize.
    opportunityWeights: sanitizeOpportunityWeights(
      r.opportunityWeights ?? r.opportunityWeightsJson
    ),
    // OPPORTUNITY-CONTROLS — positive finite → clamp ≤ $1M/mo; else no cap.
    maxApprovedSpendUsd: (() => {
      const n = typeof r.maxApprovedSpendUsd === "string" ? Number(r.maxApprovedSpendUsd) : r.maxApprovedSpendUsd;
      return typeof n === "number" && Number.isFinite(n) && n > 0
        ? Math.min(1_000_000, n)
        : null;
    })(),
  };
}

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

export type ProfitVerdict = "PROFITABLE" | "MARGINAL" | "AVOID";

// ---------------------------------------------------------------------------
// Bear / Base / Bull — a planning RANGE, not a promise. Answers the miner's
// real question: "what are the chances I earn the headline number every
// month?" — by showing the downside month, the modeled mid-pack month and
// today's upside reference side by side.
// ---------------------------------------------------------------------------

export interface ProfitScenario {
  /** Scenario gross revenue, monthly USD. */
  grossMonthlyUsd: number;
  /** Scenario net profit after the FULL cost stack, monthly USD. */
  netMonthlyUsd: number;
  /** True when the scenario still clears the minimum entry target. */
  meetsTarget: boolean;
  /** Short explanation of the scenario's assumptions. */
  note: string;
}

export interface ProfitScenarios {
  /** First month: bond-EMA ramp fraction of base revenue + alpha −40%. */
  bear: ProfitScenario;
  /** The base P&L — median rewarded miner after ramp, current prices. */
  base: ProfitScenario;
  /** Upside — what today's mean earning miner on this subnet grosses. */
  bull: ProfitScenario;
}

export interface ProfitabilityReport {
  // --- P&L waterfall (monthly USD) ---
  expectedRevenueUsd: number;
  gpuRentalUsd: number;
  storageUsd: number;
  infrastructureUsd: number;
  otherOperatingUsd: number;
  /** otherOperating + amortized registration burn (what "Other" sums to). */
  otherOperatingTotalUsd: number;
  /** Amortized registration burn inside Other (0 when disabled). */
  amortizedBurnUsd: number;
  /** FULL upfront registration burn before amortization (0 when disabled). */
  registrationBurnUsd: number;
  /** Cooling uplift on the electricity line (owned basis; 0 rented). */
  coolingUsd: number;
  /** Maintenance line (owned basis; 0 rented). */
  maintenanceUsd: number;
  /** Hardware recovery: rig capex / amortize months (owned; 0 rented or unset). */
  hardwareRecoveryUsd: number;
  /** True when owned basis and rigCapexUsd is unset — recovery line is missing. */
  hardwareRecoveryIncomplete: boolean;
  /** GPU Rental + Storage + Infrastructure + Other operating + cooling +
   *  maintenance + hardware recovery. */
  totalCostsUsd: number;
  // --- NET PROFIT ---
  netMonthlyUsd: number;
  netWeeklyUsd: number;
  netDailyUsd: number;
  // --- Derived metrics ---
  /** Net profit ÷ total operating cost, monthly %. */
  roiMonthlyPct: number;
  /** ROI compounded ×12 (simple annualization). */
  roiAnnualPct: number;
  /** Days to recover upfront capital (burn + first-month costs), incl. ramp. */
  breakEvenDays: number | null;
  /** Net ÷ revenue, %. */
  profitMarginPct: number;
  /** Net × (1 − risk factor) — what the P&L looks like after seat/alpha risk. */
  riskAdjustedMonthlyUsd: number;
  /** 0–0.6 — the haircut applied from seat/alpha/earning risk pillars. */
  riskFactor: number;
  // --- Minimum entry rule ---
  targetUsd: number;
  meetsMinimum: boolean;
  /** How far below the target the net profit is (0 when it passes). */
  shortfallUsd: number;
  verdict: ProfitVerdict;
  // --- Bear / Base / Bull planning range (net monthly USD) ---
  scenarios: ProfitScenarios;
}

// ---------------------------------------------------------------------------
// Risk factor — from the three risk-bearing pillars of the Miner's Ledger.
// A subnet can have great paper economics but a knife-fight seat or a dying
// alpha price; the risk-adjusted line discounts for that.
// ---------------------------------------------------------------------------

export function computeRiskFactor(c: ScoreComponents): number {
  const composite =
    c.seat_safety * 0.4 + c.alpha_economics * 0.3 + c.earning_reality * 0.3;
  // composite 90+ → ~0.1 haircut; composite 50 → 0.35; composite 20 → capped 0.6
  return Math.min(0.6, Math.max(0.05, 1 - composite / 100));
}

// ---------------------------------------------------------------------------
// AUDIT-AI-5 (2026-11-01) — ONE electricity model for every surface. There
// used to be two divergent copies: this one (150 W host + 30-day month) and
// lium-earnings' (GPU-only + 30.4-day month) — 10-14% apart for identical
// inputs, so the Host & Earn and payback surfaces disagreed on cost.
// Shared constants: HOURS_PER_MONTH = 729.6 h (30.4-day billing month);
// host overhead is an explicit opt-in so GPU-only surfaces stay GPU-only.
// ---------------------------------------------------------------------------

/** Billing month length used across the lib (30.4-day month, 729.6 h). */
export const HOURS_PER_MONTH = 729.6;

export function electricityMonthlyUsd(
  powerWatts: number,
  usdPerKwh: number,
  opts?: { hostWatts?: number }
): number {
  const hostWatts = Math.max(opts?.hostWatts ?? 0, 0);
  const kw = (Math.max(powerWatts, 0) + hostWatts) / 1000;
  return kw * HOURS_PER_MONTH * usdPerKwh;
}

// ---------------------------------------------------------------------------
// The engine — takes the Miner's Ledger outputs for one subnet plus the
// user's config and produces the full P&L report.
// ---------------------------------------------------------------------------

export interface ProfitabilityInputs {
  /** Expected revenue (newcomer mid-pack monthly USD) from the ledger. */
  grossMonthlyUsd: number;
  /** Market GPU rental for the work type's tier ($/mo). */
  gpuRentMonthlyUsd: number;
  /** Tier power draw in W (for owned-hardware electricity mode). */
  gpuPowerWatts: number;
  /** Auto infra from the work-type classifier ($/mo) — used when config.infraMonthlyUsd is 0. */
  autoInfraMonthlyUsd: number;
  /** Registration burn in TAO (upfront seat cost), null when unknown. */
  burnCostTao: number | null;
  /** Newcomer ramp estimate in weeks (delays first revenue). */
  rampWeeks: number | null;
  /** Mean-earner upside gross (perEarningDailyTao × 30 × TAO), when known. */
  bullGrossMonthlyUsd?: number;
  /** TAO spot price in USD. */
  taoUsd: number;
  score: ScoreComponents;
  config: ProfitabilityConfig;
}

export function computeProfitabilityReport(
  inputs: ProfitabilityInputs
): ProfitabilityReport {
  const {
    grossMonthlyUsd,
    gpuRentMonthlyUsd,
    gpuPowerWatts,
    autoInfraMonthlyUsd,
    burnCostTao,
    rampWeeks,
    taoUsd,
    score,
    config,
  } = inputs;

  // --- Cost line items -----------------------------------------------------
  const gpuRentalUsd =
    config.hardwareMode === "owned"
      ? electricityMonthlyUsd(gpuPowerWatts, config.electricityUsdPerKwh, { hostWatts: 150 })
      : gpuRentMonthlyUsd;
  const storageUsd = config.storageMonthlyUsd;
  const infrastructureUsd =
    config.infraMonthlyUsd > 0 ? config.infraMonthlyUsd : autoInfraMonthlyUsd;

  const burnUsd =
    config.includeRegistrationBurn && burnCostTao != null
      ? Math.max(burnCostTao, 0) * taoUsd
      : 0;
  const amortizedBurnUsd = burnUsd / Math.max(config.amortizeBurnMonths, 1);
  const otherOperatingTotalUsd = config.otherOpexMonthlyUsd + amortizedBurnUsd;

  // NET-EARNINGS-1 — owned-basis reality lines. On the rented basis the
  // market GPU rate already bundles cooling, maintenance and the hardware
  // itself; charging them again would double-count.
  const owned = config.hardwareMode === "owned";
  const electricityLine = owned ? gpuRentalUsd : 0;
  const coolingUsd = owned ? electricityLine * (config.coolingUpliftPct / 100) : 0;
  const maintenanceUsd = owned ? config.maintenanceMonthlyUsd : 0;
  const hardwareRecoveryUsd =
    owned && config.rigCapexUsd > 0
      ? config.rigCapexUsd / Math.max(config.rigAmortizeMonths, 1)
      : 0;
  const hardwareRecoveryIncomplete = owned && config.rigCapexUsd <= 0;

  const totalCostsUsd =
    gpuRentalUsd +
    storageUsd +
    infrastructureUsd +
    otherOperatingTotalUsd +
    coolingUsd +
    maintenanceUsd +
    hardwareRecoveryUsd;

  // --- NET PROFIT ----------------------------------------------------------
  // Zero-revenue subnets are honest losers: you still pay the cost stack.
  const netMonthlyUsd = grossMonthlyUsd > 0
    ? grossMonthlyUsd - totalCostsUsd
    : -totalCostsUsd;
  const netDailyUsd = netMonthlyUsd / 30;
  const netWeeklyUsd = netMonthlyUsd / 30 * 7;

  // --- Derived metrics ------------------------------------------------------
  const roiMonthlyPct =
    totalCostsUsd > 0 ? (netMonthlyUsd / totalCostsUsd) * 100 : 0;

  // Break-even: recover the upfront capital (registration burn + first month
  // of operating costs) out of net daily profit, plus the bond-EMA ramp while
  // a fresh UID earns little. No profit → never breaks even.
  const upfrontCapitalUsd = burnUsd + totalCostsUsd;
  const rampDays = (rampWeeks ?? 0) * 7;
  const breakEvenDays =
    netDailyUsd > 0
      ? Math.ceil(upfrontCapitalUsd / netDailyUsd + rampDays)
      : null;

  const profitMarginPct =
    grossMonthlyUsd > 0 ? (netMonthlyUsd / grossMonthlyUsd) * 100 : 0;

  const riskFactor = computeRiskFactor(score);
  // AUDIT-AI-2: the risk haircut models uncertainty about FUTURE profit — it
  // must shrink a positive net, not soften a loss (a −$30k/mo rig was being
  // displayed as −$12k with rf=0.6, understating the downside).
  const riskAdjustedMonthlyUsd = config.riskAdjustment
    ? netMonthlyUsd > 0
      ? netMonthlyUsd * (1 - riskFactor)
      : netMonthlyUsd
    : netMonthlyUsd;

  // --- Minimum entry rule ---------------------------------------------------
  const meetsMinimum = netMonthlyUsd >= config.minNetProfitTargetUsd;
  const shortfallUsd = Math.max(0, config.minNetProfitTargetUsd - netMonthlyUsd);

  const verdict: ProfitVerdict = !meetsMinimum
    ? "AVOID"
    : profitMarginPct < 15 ||
        (config.riskAdjustment && riskAdjustedMonthlyUsd < config.minNetProfitTargetUsd)
      ? "MARGINAL"
      : "PROFITABLE";

  // --- Bear / Base / Bull scenarios -----------------------------------------
  // BEAR ≈ your FIRST month on the subnet: bonds build via EMA so revenue is
  //        only a fraction of base (~4/rampWeeks, floored at 15%), alpha
  //        price stressed −40%, while the full cost stack runs regardless.
  // BASE = the P&L above (median rewarded miner after ramp, current prices).
  // BULL = what TODAY'S mean earner on this subnet grosses — upside for a
  //        well-run top seat, never a starting point.
  const rampFraction =
    rampWeeks != null && rampWeeks > 4 ? Math.max(4 / rampWeeks, 0.15) : 1;
  const bearGross =
    grossMonthlyUsd > 0 ? grossMonthlyUsd * rampFraction * 0.6 : 0;
  const bullGross = Math.max(
    inputs.bullGrossMonthlyUsd ?? grossMonthlyUsd,
    grossMonthlyUsd
  );
  const mkScenario = (gross: number, note: string): ProfitScenario => {
    const net = gross > 0 ? gross - totalCostsUsd : -totalCostsUsd;
    return {
      grossMonthlyUsd: Math.round(gross),
      netMonthlyUsd: Math.round(net),
      meetsTarget: net >= config.minNetProfitTargetUsd,
      note,
    };
  };
  const scenarios: ProfitScenarios = {
    bear: mkScenario(
      bearGross,
      rampWeeks != null && rampWeeks > 4
        ? `first month: ramp-up (~${Math.round(rampWeeks)} wk to full bonds) + alpha price −40%`
        : "first month: soft alpha price (−40%)"
    ),
    base: mkScenario(
      grossMonthlyUsd,
      "median rewarded miner after ramp · current prices"
    ),
    bull: mkScenario(
      bullGross,
      "mean of currently-rewarded miners (today's earners)"
    ),
  };

  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    expectedRevenueUsd: r1(grossMonthlyUsd),
    gpuRentalUsd: r1(gpuRentalUsd),
    storageUsd: r1(storageUsd),
    infrastructureUsd: r1(infrastructureUsd),
    otherOperatingUsd: r1(config.otherOpexMonthlyUsd),
    otherOperatingTotalUsd: r1(otherOperatingTotalUsd),
    amortizedBurnUsd: r1(amortizedBurnUsd),
    registrationBurnUsd: r1(burnUsd),
    coolingUsd: r1(coolingUsd),
    maintenanceUsd: r1(maintenanceUsd),
    hardwareRecoveryUsd: r1(hardwareRecoveryUsd),
    hardwareRecoveryIncomplete,
    totalCostsUsd: r1(totalCostsUsd),
    netMonthlyUsd: Math.round(netMonthlyUsd),
    netWeeklyUsd: Math.round(netWeeklyUsd),
    netDailyUsd: Math.round(netDailyUsd * 100) / 100,
    roiMonthlyPct: Math.round(roiMonthlyPct * 10) / 10,
    roiAnnualPct: Math.round(roiMonthlyPct * 12 * 10) / 10,
    breakEvenDays,
    profitMarginPct: Math.round(profitMarginPct * 10) / 10,
    riskAdjustedMonthlyUsd: Math.round(riskAdjustedMonthlyUsd),
    riskFactor: Math.round(riskFactor * 100) / 100,
    targetUsd: config.minNetProfitTargetUsd,
    meetsMinimum,
    shortfallUsd: Math.round(shortfallUsd),
    verdict,
    scenarios,
  };
}
