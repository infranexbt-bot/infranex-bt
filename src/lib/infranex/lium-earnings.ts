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
    idleWeight: 0.025,
    powerWatts: 600,
    streetPriceUsd: 8500,
    vramGb: 96,
    priceNote: "research base case $8.5k (alt scenario $12k)",
    note: "Best new-buy payback (~8 mo @ $8.5k). Passively cooled — needs a proper server chassis.",
  },
  {
    gpu: "RTX PRO 6000 Blackwell Workstation",
    tier: "pro",
    monthlyUsd: 942,
    idleWeight: 0.027,
    powerWatts: 600,
    streetPriceUsd: 9500,
    vramGb: 96,
    priceNote: "assumed street price — edit to your quote",
    note: "Active cooling — fits a workstation. Slightly lower yield than the Server Edition.",
  },
  {
    gpu: "NVIDIA A100",
    tier: "datacenter",
    monthlyUsd: 778,
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
    idleWeight: null,
    powerWatts: 350,
    streetPriceUsd: 800,
    vramGb: 24,
    priceNote: "used market ~$800 — edit to your quote",
    note: "Legacy — barely clears electricity at retail rates.",
  },
];

export const LIUM_MEASURED_AT = "2026-10-23";
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
