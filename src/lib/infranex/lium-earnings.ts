// ---------------------------------------------------------------------------
// LIUM EARNINGS LIB — the Host & Earn module's data + math.
//
// Answers the provider question the mining engine structurally CANNOT:
// "what does a GPU I OWN earn on SN51 (lium.io) as a rental provider?"
//
// Why the mining lens can't see this income: the Miner's Ledger counts
// CHAIN EMISSIONS only. SN51's provider income is mostly RENTAL FEES (paid
// from real inference demand) + IDLE-POOL PAY — neither appears in the
// subnet's incentive vector, so the engine prices SN51 as an 8xB300 mining
// job with median-seat revenue and calls it NO-GO. Hosting a card is a
// different activity with a different, measured income stream.
//
// HONESTY CONTRACT — the earnings table is TRAILING-30-DAY ACTUALS measured
// on lium.io's provider side on 2026-10-23 (worklog sn51-lium-research).
// They are observations, not guarantees: rental demand varies week to week,
// new fleets compress per-card yields, and idle-pool weights are set by
// validators and can change. Street prices are editable assumptions —
// the payback math is exact given the inputs, never the inputs themselves.
// ---------------------------------------------------------------------------

export type LiumTier = "consumer" | "pro" | "datacenter";

export interface LiumGpuRow {
  gpu: string;
  tier: LiumTier;
  /** Measured trailing-30d provider earnings, USD/month (2026-10-23). */
  monthlyUsd: number;
  /** Validator idle-pool weight — idle (unrented) cards still accrue pay.
   *  null = not covered by the research. */
  idleWeight: number | null;
  /** Board power draw in watts (used for the electricity line). */
  powerWatts: number;
  /** Default capex assumption for the payback calculator (USD). Editable. */
  streetPriceUsd: number;
  // --- Demand + pricing-strategy fields ---
  //   listedCount/rentedCount/marketAskUsdPerHr: fleet snapshot 2026-10-24
  //   (lium.io/pricing.json). Earnings, 30d rented%, soft limits: official
  //   provider tables, trailing 30d to 2026-10-23.
  /** Live fleet snapshot (lium.io pricing.json): GPUs listed on the marketplace. */
  listedCount: number | null;
  /** Same snapshot: GPUs currently rented. rented/listed = live tightness. */
  rentedCount: number | null;
  /** Official trailing-30d average time-rented (%). */
  avgRentedPct30d: number | null;
  /** Official trailing-30d average realized rental price (USD/GPU-hour). */
  avgUsdPerHr: number | null;
  /** Soft-limit reference price (USD/GPU-hour) — at/below it idle hours keep idle pay. */
  softLimitUsdPerHr: number | null;
  /** Observed above-limit ask (USD/GPU-hour; midpoint of the live range, if any). Forfeits idle pay. */
  marketAskUsdPerHr: number | null;
  vramGb: number;
  /** Where the price assumption comes from. */
  priceNote: string;
  note: string;
}

/** Measured 30-day provider earnings per card, sorted descending (2026-10-23). */
export const LIUM_GPUS: LiumGpuRow[] = [
  {
    gpu: "NVIDIA B300",
    tier: "datacenter",
    monthlyUsd: 6238,
    listedCount: 273,
    rentedCount: 242,
    avgRentedPct30d: 81,
    avgUsdPerHr: 8.34,
    softLimitUsdPerHr: 8.0,
    marketAskUsdPerHr: 8.15,
    idleWeight: 0.05,
    powerWatts: 1400,
    streetPriceUsd: 55000,
    vramGb: 288,
    priceNote: "assumed datacenter street price — edit to your quote",
    note: "Top earner; HGX fleet territory. TDX TEE tier.",
  },
  {
    gpu: "NVIDIA B200",
    tier: "datacenter",
    monthlyUsd: 4314,
    listedCount: 109,
    rentedCount: 100,
    avgRentedPct30d: 72,
    avgUsdPerHr: 6.12,
    softLimitUsdPerHr: 5.6,
    marketAskUsdPerHr: 5.75,
    idleWeight: null,
    powerWatts: 1000,
    streetPriceUsd: 45000,
    vramGb: 192,
    priceNote: "assumed datacenter street price — edit to your quote",
    note: "TDX TEE tier — needs an Intel TDX-capable server.",
  },
  {
    gpu: "NVIDIA H200",
    tier: "datacenter",
    monthlyUsd: 3118,
    listedCount: 170,
    rentedCount: 153,
    avgRentedPct30d: 89,
    avgUsdPerHr: 4.05,
    softLimitUsdPerHr: 3.65,
    marketAskUsdPerHr: 4.65,
    idleWeight: 0.56,
    powerWatts: 700,
    streetPriceUsd: 30000,
    vramGb: 141,
    priceNote: "assumed datacenter street price — edit to your quote",
    note: "Biggest validator idle-pool weight (0.56) — idle pay while waiting for rentals. TDX TEE tier.",
  },
  {
    gpu: "NVIDIA H100",
    tier: "datacenter",
    monthlyUsd: 1388,
    listedCount: 289,
    rentedCount: 160,
    avgRentedPct30d: 72,
    avgUsdPerHr: 1.92,
    softLimitUsdPerHr: 1.39,
    marketAskUsdPerHr: 3.13,
    idleWeight: null,
    powerWatts: 700,
    streetPriceUsd: 22000,
    vramGb: 80,
    priceNote: "assumed used-market price — edit to your quote",
    note: "TDX TEE tier; per-card yield compressed by H200/B200 fleets.",
  },
  {
    gpu: "RTX PRO 6000 Blackwell Server",
    tier: "pro",
    monthlyUsd: 1092,
    listedCount: 162,
    rentedCount: 145,
    avgRentedPct30d: 87,
    avgUsdPerHr: 1.43,
    softLimitUsdPerHr: 1.19,
    marketAskUsdPerHr: 1.84,
    idleWeight: 0.025,
    powerWatts: 600,
    streetPriceUsd: 8500,
    vramGb: 96,
    priceNote: "research base case $8.5k (alt $12k) — Workstation street hit ~$16k Oct 2026, verify your quote",
    note: "Best new-buy payback at the $8.5k research base (~8 mo). Passively cooled — needs a proper server chassis. Live 2026-10-24: 145/162 rented (90%); asks $1.85–2.09/hr.",
  },
  {
    gpu: "RTX PRO 6000 Blackwell Workstation",
    tier: "pro",
    monthlyUsd: 942,
    listedCount: 20,
    rentedCount: 19,
    avgRentedPct30d: 80,
    avgUsdPerHr: 1.24,
    softLimitUsdPerHr: 1.19,
    marketAskUsdPerHr: 1.93,
    idleWeight: 0.027,
    powerWatts: 600,
    streetPriceUsd: 16000,
    vramGb: 96,
    priceNote: "NVIDIA marketplace / Newegg / B&H $15,999–16,000 (Oct 2026, GDDR7 shortage; was $8,565 MSRP Mar 2025) — edit to your quote",
    note: "Active cooling — fits a workstation. Slightly lower yield than the Server Edition. Live 2026-10-24: 19/20 rented (95%), 1 idle; hosts asking $1.93/hr, above the $1.19 soft limit (forfeits idle pay). New-buy payback ~18 mo at $16k street — hosting a card you already own is the far better play.",
  },
  {
    gpu: "NVIDIA A100",
    tier: "datacenter",
    monthlyUsd: 778,
    listedCount: 54,
    rentedCount: 46,
    avgRentedPct30d: 67,
    avgUsdPerHr: 1.22,
    softLimitUsdPerHr: 0.7,
    marketAskUsdPerHr: 0.7,
    idleWeight: null,
    powerWatts: 400,
    streetPriceUsd: 12000,
    vramGb: 80,
    priceNote: "assumed used-market price — edit to your quote",
    note: "Ampere datacenter workhorse; steady legacy demand.",
  },
  {
    gpu: "RTX 6000 Ada",
    tier: "pro",
    monthlyUsd: 599,
    listedCount: 41,
    rentedCount: 39,
    avgRentedPct30d: 80,
    avgUsdPerHr: 0.78,
    softLimitUsdPerHr: 0.75,
    marketAskUsdPerHr: 0.75,
    idleWeight: null,
    powerWatts: 300,
    streetPriceUsd: 6800,
    vramGb: 48,
    priceNote: "assumed street price — edit to your quote",
    note: "Efficient pro card; modest yield on this marketplace.",
  },
  {
    gpu: "RTX 5090",
    tier: "consumer",
    monthlyUsd: 464,
    listedCount: 274,
    rentedCount: 273,
    avgRentedPct30d: 82,
    avgUsdPerHr: 0.57,
    softLimitUsdPerHr: 0.4,
    marketAskUsdPerHr: 1.3,
    idleWeight: 0.025,
    powerWatts: 575,
    streetPriceUsd: 6500,
    vramGb: 32,
    priceNote: "2026 street $5k-$9.3k (launch MSRP $1,999) — edit to your quote",
    note: "Strong rental demand; consumer Sysbox tier — NO TEE needed. ~15 mo payback @ $6.5k.",
  },
  {
    gpu: "RTX A6000",
    tier: "pro",
    monthlyUsd: 342,
    listedCount: 79,
    rentedCount: 70,
    avgRentedPct30d: 96,
    avgUsdPerHr: 0.42,
    softLimitUsdPerHr: 0.42,
    marketAskUsdPerHr: 0.49,
    idleWeight: null,
    powerWatts: 300,
    streetPriceUsd: 4300,
    vramGb: 48,
    priceNote: "assumed used-market price — edit to your quote",
    note: "Older pro card; thin yields on current demand.",
  },
  {
    gpu: "RTX 4090",
    tier: "consumer",
    monthlyUsd: 339,
    listedCount: 103,
    rentedCount: 103,
    avgRentedPct30d: 85,
    avgUsdPerHr: 0.45,
    softLimitUsdPerHr: 0.3,
    marketAskUsdPerHr: 0.7,
    idleWeight: 0.05,
    powerWatts: 450,
    streetPriceUsd: 2200,
    vramGb: 24,
    priceNote: "used market ~$2.2k — edit to your quote",
    note: "Best ROI on the board (~7 mo payback used). Consumer Sysbox tier — no TEE. Higher idle weight than 5090.",
  },
  {
    gpu: "RTX 3090",
    tier: "consumer",
    monthlyUsd: 135,
    listedCount: 95,
    rentedCount: 90,
    avgRentedPct30d: 81,
    avgUsdPerHr: 0.19,
    softLimitUsdPerHr: 0.16,
    marketAskUsdPerHr: 0.25,
    idleWeight: null,
    powerWatts: 350,
    streetPriceUsd: 800,
    vramGb: 24,
    priceNote: "used market ~$800 — edit to your quote",
    note: "Legacy — barely clears electricity at retail rates.",
  },
];

export const LIUM_MEASURED_AT = "2026-10-23";
/** Hours in the lib's billing month (matches electricityMonthlyUsd). */
export const HOURS_PER_MONTH = 729.6;

// ---------------------------------------------------------------------------
// PROVIDER-MARKETPLACE REVENUE — the mining-lens blind spot, fixed at the root.
//
// SN51's miner IS a rental provider: the same hotkey that earns chain
// emission also receives 95% of renter payments + idle-pool pay + rented
// extra — paid OFF-CHAIN (daily to the coldkey), invisible to the subnet's
// incentive vector. The generic per-seat emission model priced SN51 revenue
// at a few hundred $/mo and flagged it AVOID; the measured provider table
// says an 8xB300 node actually grosses ~$49,900/mo (Lium rewards calculator,
// trailing 30d). The Miner's Ledger now uses that measured figure as the
// gross top line for subnets registered here, so RUN/WATCH/AVOID reflects
// the real income stream. The measured monthlyUsd ALREADY INCLUDES idle-pool
// emission — the ledger REPLACES (never adds) the emission estimate with it,
// so nothing is double-counted.
//
// Keyed by netuid. Today SN51 is the only Bittensor subnet whose miners are
// paid off-chain marketplace rental income; add a row here (with a measured
// source) when another one appears.
// ---------------------------------------------------------------------------
export const PROVIDER_MARKETPLACE_REVENUE: Record<
  number,
  { gpuKey: string; source: string }
> = {
  51: {
    gpuKey: "NVIDIA B300",
    source:
      "Lium rewards calculator, trailing 30d: 95% of renter payments + idle pay + rented extra",
  },
};

/** Resolved measured provider revenue for a subnet, scaled to the priced GPU
 *  count. Returns null for subnets with no measured off-chain income stream
 *  (everywhere except SN51 today) — the caller keeps its emission top line. */
export function providerMarketplaceRevenueFor(
  netuid: number,
  gpuCount: number
): { monthlyUsd: number; perGpuUsd: number; source: string } | null {
  const entry = PROVIDER_MARKETPLACE_REVENUE[netuid];
  if (!entry) return null;
  const row = LIUM_GPUS.find((g) => g.gpu === entry.gpuKey);
  if (!row || !(row.monthlyUsd > 0)) return null;
  const count = Math.max(1, Math.round(gpuCount || 1));
  return {
    perGpuUsd: row.monthlyUsd,
    monthlyUsd: row.monthlyUsd * count,
    source: entry.source,
  };
}
export const LIUM_FLEET_SUMMARY =
  "Fleet snapshot 2026-10-24 (lium.io pricing.json): 1,820 GPUs listed, 1,586 rented (87.1%).";
export const LIUM_SOURCE =
  "Trailing-30-day provider earnings measured on lium.io (2026-10-23). Observations, not guarantees.";
export const LIUM_DOCS = "https://docs.lium.io/providers";

/** Tier badge styling shared with the view. */
export const LIUM_TIER_STYLE: Record<
  LiumTier,
  { label: string; className: string }
> = {
  consumer: {
    label: "Consumer",
    className: "bg-success/10 text-success border-success/30",
  },
  pro: {
    label: "Pro",
    className: "bg-primary/10 text-primary border-primary/30",
  },
  datacenter: {
    label: "Datacenter",
    className: "bg-warning/10 text-warning border-warning/30",
  },
};

// --- Payback math -----------------------------------------------------------

/** Electricity for a card running 24/7: watts × 729.6 h/month ÷ 1000 × rate. */
export function electricityMonthlyUsd(watts: number, usdPerKwh: number): number {
  return (watts * 24 * 30.4 * usdPerKwh) / 1000;
}

export interface PaybackInput {
  capexUsd: number;
  monthlyRevenueUsd: number;
  powerWatts: number;
  usdPerKwh: number;
}

export interface PaybackResult {
  monthlyElectricityUsd: number;
  monthlyNetUsd: number;
  paybackMonths: number | null;
  net12MoUsd: number;
  net24MoUsd: number;
  /** True when 24 months of net never clears capex. */
  neverPays: boolean;
}

/** Exact payback math given the inputs. Negative net → payback impossible. */
export function computePayback(i: PaybackInput): PaybackResult {
  const elec = electricityMonthlyUsd(i.powerWatts, i.usdPerKwh);
  const net = i.monthlyRevenueUsd - elec;
  const payback = net > 0 ? i.capexUsd / net : null;
  return {
    monthlyElectricityUsd: elec,
    monthlyNetUsd: net,
    paybackMonths: payback,
    net12MoUsd: net * 12 - i.capexUsd,
    net24MoUsd: net * 24 - i.capexUsd,
    neverPays: net <= 0 || i.capexUsd > net * 24,
  };
}

// --- Pricing strategy: soft-limit vs market-ask -----------------------------

export type PricingStrategy = "soft_limit" | "market_ask";

/**
 * Monthly revenue for a card under a pricing strategy, scaled by the demand
 * slider (100 = trailing-30d actuals).
 *
 * soft_limit — the measured monthlyUsd, which INCLUDES the idle-pool pay the
 *   card earned while waiting for renters. Pricing at/below the model's soft
 *   limit keeps that stream alive (plus the other eligibility conditions).
 * market_ask — re-price the rented hours at the observed above-limit ask and
 *   drop idle pay entirely: pricing above the soft limit forfeits it. Rented
 *   time stays at the official 30d average, scaled by the demand slider.
 *   Above-limit demand is thinner — treat this as the upside case and stress
 *   it with the slider. Cards with no observed above-limit ask fall back to
 *   the soft-limit number (fellBack = true).
 */
export function monthlyRevenueAt(
  g: LiumGpuRow,
  strategy: PricingStrategy,
  demandPct: number
): { usd: number; fellBack: boolean } {
  if (
    strategy === "market_ask" &&
    g.marketAskUsdPerHr != null &&
    g.avgRentedPct30d != null &&
    g.marketAskUsdPerHr > (g.softLimitUsdPerHr ?? 0)
  ) {
    return {
      usd:
        g.marketAskUsdPerHr *
        HOURS_PER_MONTH *
        (g.avgRentedPct30d / 100) *
        (demandPct / 100),
      fellBack: false,
    };
  }
  return { usd: g.monthlyUsd * (demandPct / 100), fellBack: strategy === "market_ask" };
}

/**
 * Derived residual of the measured monthly figure: what "official 30d rented
 * time × avg realized price" does NOT explain — i.e. idle-pool pay plus small
 * deltas between Lium's two published tables. An estimate, never a promise.
 */
export function idlePayEstimate(g: LiumGpuRow): number | null {
  if (g.avgUsdPerHr == null || g.avgRentedPct30d == null) return null;
  const rental = g.avgUsdPerHr * HOURS_PER_MONTH * (g.avgRentedPct30d / 100);
  return Math.max(0, Math.round(g.monthlyUsd - rental));
}

// --- Payout comparator ------------------------------------------------------

export const USDT_FEE_PCT = 5;
export const USDT_MIN_PAYOUT_USD = 5;
/** Alpha rail scenario spread applied to the current alpha price. */
export const ALPHA_SCENARIO = 0.3;

export interface PayoutCompareInput {
  monthlyUsd: number;
  alphaPriceUsd: number;
}

export interface PayoutCompareResult {
  usdt: {
    netMonthlyUsd: number;
    feeUsd: number;
  };
  alpha: {
    tokensMonthly: number;
    valueNowUsd: number;
    valueBearUsd: number;
    valueBullUsd: number;
  };
}

/**
 * USDT rail: converted at payout, ~5% conversion fee, daily T+2 17:00 UTC,
 * min $5. Email/Google signups land here automatically.
 * Alpha rail: no conversion fee — full emission in SN51 alpha tokens at the
 * current price, with price risk (bear = -30%, bull = +30% scenarios).
 * Requires your own Bittensor hotkey + Discord connection.
 */
export function comparePayouts(i: PayoutCompareInput): PayoutCompareResult {
  const fee = (i.monthlyUsd * USDT_FEE_PCT) / 100;
  const tokens = i.alphaPriceUsd > 0 ? i.monthlyUsd / i.alphaPriceUsd : 0;
  return {
    usdt: { netMonthlyUsd: i.monthlyUsd - fee, feeUsd: fee },
    alpha: {
      tokensMonthly: tokens,
      valueNowUsd: i.monthlyUsd,
      valueBearUsd: i.monthlyUsd * (1 - ALPHA_SCENARIO),
      valueBullUsd: i.monthlyUsd * (1 + ALPHA_SCENARIO),
    },
  };
}
