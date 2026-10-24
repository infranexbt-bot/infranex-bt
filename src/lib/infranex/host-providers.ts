// ---------------------------------------------------------------------------
// HOST-PROVIDERS LIB — cross-provider GPU hosting earnings comparison.
//
// The Host & Earn module measured Lium (SN51) provider actuals; this lib
// answers the operator's next question: "WHO ELSE PAYS ME TO HOST — AND WHO
// PAYS MOST PER HOUR FOR MY SPECIFIC CARD?"
//
// ON THE BOARD — self-serve host programs with real, visible payouts:
//   lium (measured in lium-earnings.ts), Vast.ai, SaladCloud, io.net.
// REMOVED — no verifiable per-card pay for self-serve hosts (EXCLUDED_PROVIDERS):
//   RunPod (partner/quote onboarding only, no published host rates) and
//   TensorDock (datacenter-only vetting, no published per-card host rates).
//
// HONESTY CONTRACT — every number carries a data-basis label:
//   measured  → provider-published realized earnings (Salad's weekly earning-
//               rates table incl. job occupancy; Lium's trailing-30d actuals).
//   published → live marketplace asks / provider rate cards (Vast's hourly
//               ask table; io.net's published renter rates). Host-side take
//               may differ.
//   estimate  → our conversion of a published RENTER-side rate into a host
//               monthly figure with an assumed utilization; the platform's
//               host commission is not public. Verify before committing HW.
// Nothing here is a guarantee: all four markets reprice continuously.
// ---------------------------------------------------------------------------

import { LIUM_GPUS, type LiumGpuRow } from "./lium-earnings";

export type HostProviderId = "lium" | "vast" | "salad" | "ionet";

export type EarningsBasis = "measured" | "published" | "estimate" | "none";

/** A per-card demand signal the provider itself publishes. */
export interface ProviderDemand {
  /** Share in percent — rented/listed (lium) or job occupancy (salad). */
  pct: number;
  kind: "rented" | "occupancy";
  /** Extra context for the tooltip (snapshot counts, 30d average, window). */
  note?: string;
}

export type EntryBar = "easy" | "medium" | "strict";

export interface HostProvider {
  id: HostProviderId;
  name: string;
  tagline: string;
  kind: string;
  url: string;
  hostUrl: string;
  measuredAt: string;
  /** How you get paid. */
  payoutRail: string;
  payoutMin: string;
  platformTake: string;
  entryBar: EntryBar;
  entryNote: string;
  requirements: string[];
  pros: string[];
  cons: string[];
  /** Where our numbers came from + what they do NOT promise. */
  dataNote: string;
}

export const HOST_PROVIDERS: HostProvider[] = [
  {
    id: "lium",
    name: "Lium (SN51)",
    tagline: "Bittensor GPU marketplace — the measured baseline",
    kind: "Bittensor subnet marketplace",
    url: "https://lium.io",
    hostUrl: "https://docs.lium.io/providers",
    measuredAt: "2026-10-23",
    payoutRail: "USDT on Ethereum (daily T+2) or SN51 alpha tokens",
    payoutMin: "$5",
    platformTake: "Provider keeps ~95% of rent (measured); idle-pool pay on top",
    entryBar: "easy",
    entryNote:
      "Consumer RTX cards run plain Sysbox containers — no TEE, no datacenter needed. H100/H200/B200 tiers need Intel TDX.",
    requirements: [
      "1 or 8 GPUs per node (or GPU splitting on)",
      "Disk ≥ 1.5× total VRAM",
      "Price at/below the model's soft limit to keep idle pay",
      "Pass 15-min validator checks; Discord connected for alpha rail",
    ],
    pros: [
      "Highest MEASURED consumer yields on the board (4090 $339/mo, 5090 $464/mo)",
      "Idle-pool pay even when unrented (H200 weight 0.56)",
      "Stable-coin rail while you recover capex",
    ],
    cons: [
      "Newer marketplace — thinner demand than Vast for exotic cards",
      "Idle pay is conditional (pricing, disk, checks)",
      "Alpha rail carries token price risk",
    ],
    dataNote:
      "Trailing-30-day provider actuals measured on lium.io (2026-10-23) — see the Measured earnings table above for the per-card numbers.",
  },
  {
    id: "vast",
    name: "Vast.ai",
    tagline: "World's largest open GPU marketplace — you set the price",
    kind: "Open marketplace (on-demand / interruptible / reserved)",
    url: "https://vast.ai",
    hostUrl: "https://vast.ai/hosting",
    measuredAt: "2026-10-25",
    payoutRail: "Withdrawable host balance (methods vary by region)",
    payoutMin: "—",
    platformTake: "Platform fee on completed rentals (tiered, set per listing)",
    entryBar: "easy",
    entryNote:
      "Consumer cards list fine from a home connection; datacenter GPUs in real colo earn the top rates. You control pricing and rental type.",
    requirements: [
      "Any CUDA GPU; per-instance pricing for GPU/CPU/storage/bandwidth",
      "Stable connection + reliability score (uptime)",
      "Datacenter hardware for the blue-trust label & enterprise deals",
      "Docker-based instance hosting (their console handles it)",
    ],
    pros: [
      "200K+ active developers, 20K+ GPUs — deepest rental demand",
      "Live hourly asks on our board (2026-10-25): 4090 $0.23–0.49 · 5090 $0.41–0.76 · H100 $1.73–2.72 · H200 $3.27–4.34 per GPU-hr",
      "3 rental modes (on-demand / interruptible / reserved) + financing & presold enterprise capacity",
    ],
    cons: [
      "No idle pay — you earn only when rented",
      "Marketplace prices move continuously; a fleet wave compresses yields",
      "Self-managed support burden; reliability score drives placement",
    ],
    dataNote:
      "Live marketplace asks pulled from vast.ai/pricing (2026-10-25, from→median per card; prices update hourly). Hosts keep the listed price less commission; our monthly = ask × 729.6 h × 80% util. Host-article guidance (May 2026): 4×5090 rig @80% → $700–1,400/mo.",
  },
  {
    id: "salad",
    name: "SaladCloud",
    tagline: "Easiest entry — your gaming PC chops containers",
    kind: "Distributed consumer network (container engine)",
    url: "https://salad.com",
    hostUrl: "https://salad.com/earning-rates",
    measuredAt: "2026-10-25",
    payoutRail: "Weekly payouts — PayPal, crypto & other methods",
    payoutMin: "~$5 (verify current options in portal)",
    platformTake: "Not published; rates below are what machines actually earned",
    entryBar: "easy",
    entryNote:
      "A Windows/Linux desktop with a consumer GPU, 32 GB RAM and 500 GB storage qualifies. 190+ countries. Lowest friction on the board.",
    requirements: [
      "Consumer GPU (40+ classes, RTX 20-series → 50-series, some AMD)",
      "32 GB system RAM + 500 GB storage recommended",
      "Residential broadband; machine left running",
      "Runs container jobs only — no root, no VM passthrough",
    ],
    pros: [
      "Real measured rates published weekly — 4090 avg $0.291/hr at 98% job occupancy, top chefs $0.488",
      "98% job-occupancy on top cards + bandwidth-sharing income between jobs",
      "Works on gaming PCs and mid-range cards (4070/4080/3080) Lium doesn't list",
    ],
    cons: [
      "Lowest ceiling — mid cards earn $60–100/mo",
      "No bare-metal/root; some workloads (TEE, static IP) impossible",
      "Consumer-grade reliability expectations",
    ],
    dataNote:
      "salad.com/earning-rates trailing week (Oct 16–22 2026, page refreshed 2026-10-25): 'average' includes no-job hours; 'top chefs' = best-placed 1%; occupancy = share of hours with a container job running. Monthly = rate × 729.6 h.",
  },
  {
    id: "ionet",
    name: "io.net",
    tagline: "DePIN compute network — $IO token rewards on top",
    kind: "Decentralized physical infrastructure network (IO Worker)",
    url: "https://io.net",
    hostUrl: "https://io.net/blog/unlock-the-potential-of-your-underutilized-hardware-rent-your-gpus-cpus-with-io-worker",
    measuredAt: "2026-10-25",
    payoutRail: "$IO tokens (+ rental demand share)",
    payoutMin: "—",
    platformTake: "Not published — host share of the listed rate is opaque",
    entryBar: "medium",
    entryNote:
      "Install the IO Worker agent, keep 95%+ uptime for priority task assignment. Datacenter GPUs (A100/H100) earn 3–5× consumer cards.",
    requirements: [
      "IO Worker agent + Docker on an always-on machine",
      "95%+ uptime for priority job matching",
      "Decent CPU/RAM per their hardware tier table",
      "Wallet for $IO payouts",
    ],
    pros: [
      "Token upside on top of rental share (bull-case $IO)",
      "Health-checked network with real enterprise demand (2,752 verified GPUs, 138 countries)",
      "CPU workers also earn — spare boxes qualify",
    ],
    cons: [
      "Host commission not published — our figures are estimates",
      "Token price risk (earnings denominated in $IO)",
      "Consumer cards compete with cheaper supply — utilization varies",
    ],
    dataNote:
      "io.net's published renter rates: RTX 4090 $0.49/hr (homepage reconfirmed 2026-10-25), A100 80GB $1.49/hr (Jul 2025), H100 $1.85–2.20/hr (homepage floor now $2.19). Our monthly = renter rate × 729.6 h × 70% assumed utilization, BEFORE any platform cut — treat as a ceiling.",
  },
];

// --- Removed from the board --------------------------------------------------
// The operator asked for ONLY providers where you can self-serve host a GPU
// and see what it pays. These two fail that test — kept here with the reason
// so the removal is auditable rather than silent.

export const EXCLUDED_PROVIDERS: {
  name: string;
  url: string;
  reason: string;
}[] = [
  {
    name: "RunPod",
    url: "https://www.runpod.io/pricing",
    reason:
      "No self-serve host program — Community Cloud capacity is onboarded through a partner/quote process with no published host rates. You can't see what it pays before committing hardware, so it can't sit on a price board.",
  },
  {
    name: "TensorDock",
    url: "https://www.tensordock.com/host.html",
    reason:
      "Pays via Stripe, but vets datacenter hosts only (1 Gbps, static IP, 16 GB RAM + 1 TB NVMe per GPU) — home rigs are excluded — and publishes no per-card host rates (own guidance: 2–3 yr payback).",
  },
];

// --- Per-GPU provider earnings rows ----------------------------------------

export interface ProviderGpuEarning {
  providerId: HostProviderId;
  /** Match key, e.g. "4090", "h100". */
  matchKey: string;
  hourlyLow: number | null;
  hourlyHigh: number | null;
  /** Mid monthly estimate used for ranking (USD). */
  monthlyMid: number | null;
  monthlyLow: number | null;
  monthlyHigh: number | null;
  basis: EarningsBasis;
  /** Demand signal where the provider publishes one (undefined otherwise). */
  demand?: ProviderDemand;
  note: string;
}

const HOURS = 729.6;

const round = (n: number | null) => (n == null ? null : Math.round(n));

/** hourly × hours × utilization → monthly. */
const mFromH = (hLow: number, hHigh: number, util: number) => ({
  low: round(hLow * HOURS * util),
  high: round(hHigh * HOURS * util),
  mid: round(((hLow + hHigh) / 2) * HOURS * util),
});

// Vast.ai — LIVE marketplace asks pulled from vast.ai/pricing (2026-10-25,
// from→median per card; the page notes prices update hourly). Hosts set the
// listed price and keep it less commission. Consumer rigs modeled at 80%
// utilization per Vast's own 4×5090 example.
const vast = (key: string, hLow: number, hHigh: number, util = 0.8, note = ""): ProviderGpuEarning => {
  const m = mFromH(hLow, hHigh, util);
  return {
    providerId: "vast",
    matchKey: key,
    hourlyLow: hLow,
    hourlyHigh: hHigh,
    monthlyLow: m.low,
    monthlyHigh: m.high,
    monthlyMid: m.mid,
    basis: "published",
    note:
      (note || `Vast live marketplace asks $${hLow.toFixed(2)}–${hHigh.toFixed(2)}/GPU-hr`) +
      ` · monthly = ask × 729.6 h × ${(util * 100).toFixed(0)}% util, before commission`,
  };
};

const VAST_ROWS: ProviderGpuEarning[] = [
  vast(
    "5090",
    0.41,
    0.76,
    0.8,
    "Live asks (2026-10-25): from $0.41, median $0.76/GPU-hr — host-article guidance (May 2026) $0.30–0.60; 4×5090 rig @80% → $700–1,400/mo"
  ),
  vast(
    "4090",
    0.23,
    0.49,
    0.8,
    "Live asks (2026-10-25): from $0.23, median $0.49/GPU-hr — host keeps the listed price less commission"
  ),
  vast(
    "3090",
    0.12,
    0.21,
    0.8,
    "Live asks (2026-10-25): from $0.12, median $0.21/GPU-hr"
  ),
  vast(
    "a100",
    0.36,
    0.66,
    0.8,
    "Live asks (2026-10-25): A100 PCIE from $0.36, SXM4 median $0.66/GPU-hr"
  ),
  vast(
    "h100",
    1.73,
    2.72,
    0.8,
    "Live asks (2026-10-25): SXM from $1.73, SXM median $2.24, NVL median $2.72/GPU-hr — host-article ceiling $4.00+ for presold/enterprise deals"
  ),
  vast(
    "h200",
    3.27,
    4.34,
    0.8,
    "Live asks (2026-10-25): H200 from $3.27, NVL median $4.34/GPU-hr"
  ),
];

// SaladCloud — measured trailing-week earning rates (Oct 16–22 2026, page
// refreshed 2026-10-25). The rate already includes no-job hours, so
// utilization ≈ 1; high = top-chefs; occupancy = demand signal.
const salad = (key: string, avg: number, top: number | null, occ: number, note = ""): ProviderGpuEarning => ({
  providerId: "salad",
  matchKey: key,
  hourlyLow: avg,
  hourlyHigh: top,
  monthlyLow: round(avg * HOURS),
  monthlyHigh: round(top != null ? top * HOURS : avg * HOURS),
  monthlyMid: round(avg * HOURS),
  basis: "measured",
  demand: {
    pct: occ,
    kind: "occupancy",
    note: `Salad job occupancy — share of hours with a container job running (trailing week Oct 16–22 2026)`,
  },
  note:
    note ||
    `Salad trailing-week avg $${avg.toFixed(3)}/hr${top != null ? ` · top chefs $${top.toFixed(2)}/hr` : ""} · ${occ}% job occupancy`,
});

const SALAD_ROWS: ProviderGpuEarning[] = [
  salad("5090", 0.281, 0.413, 97),
  salad("4090", 0.291, 0.488, 98, "Highest measured consumer card on Salad — 98% job occupancy"),
  salad("4080", 0.133, 0.324, 96),
  salad("3090ti", 0.104, 0.16, 98),
  salad("3090", 0.083, 0.157, 94),
  salad(
    "4070tis",
    0.115,
    null,
    97,
    "Page's top-chefs figure $0.670/hr is a small-sample outlier — avg only"
  ),
  salad("4070", 0.104, 0.126, 98),
  salad("3080", 0.082, 0.122, 97),
];

// io.net — published renter rates (homepage reconfirmed 2026-10-25 for 4090;
// H100 floor $2.19) → estimate: 70% util, no platform cut.
const ionet = (key: string, hLow: number, hHigh: number, note = ""): ProviderGpuEarning => {
  const m = mFromH(hLow, hHigh, 0.7);
  return {
    providerId: "ionet",
    matchKey: key,
    hourlyLow: hLow,
    hourlyHigh: hHigh,
    monthlyLow: m.low,
    monthlyHigh: m.high,
    monthlyMid: m.mid,
    basis: "estimate",
    demand: undefined,
    note:
      note ||
      `io.net renter rate $${hLow.toFixed(2)}–${hHigh.toFixed(2)}/hr × 70% util — host share not published, treat as ceiling`,
  };
};

const IONET_ROWS: ProviderGpuEarning[] = [
  ionet(
    "4090",
    0.49,
    0.49,
    "io.net homepage (2026-10-25): RTX 4090 $0.49/hr — renter rate × 70% util, host share not published, treat as ceiling"
  ),
  ionet("a100", 1.49, 1.49),
  ionet(
    "h100",
    1.85,
    2.2,
    "io.net published on-demand (Jul 2025) $1.85–2.20/hr; homepage floor now $2.19 (2026-10-25) — renter rate × 70% util, treat as ceiling"
  ),
];

// Lium — reuse the measured rows (trailing-30d actuals) via match key.
const LIUM_KEY_MAP: Record<string, string> = {
  "5090": "RTX 5090",
  "4090": "RTX 4090",
  "3090": "RTX 3090",
  a100: "NVIDIA A100",
  h100: "NVIDIA H100",
  h200: "NVIDIA H200",
  b200: "NVIDIA B200",
  b300: "NVIDIA B300",
  pro6000s: "RTX PRO 6000 Blackwell Server",
  a6000: "RTX A6000",
  ada6000: "RTX 6000 Ada",
};

export function liumRowFor(matchKey: string): LiumGpuRow | null {
  const name = LIUM_KEY_MAP[matchKey];
  if (!name) return null;
  return LIUM_GPUS.find((g) => g.gpu === name) ?? null;
}

const liumRow = (key: string): ProviderGpuEarning | null => {
  const g = liumRowFor(key);
  if (!g) return null;
  const demand =
    g.rentedCount != null && g.listedCount
      ? {
          pct: Math.round((g.rentedCount / g.listedCount) * 100),
          kind: "rented" as const,
          note: `Lium fleet snapshot 2026-10-24: ${g.rentedCount}/${g.listedCount} units rented${
            g.avgRentedPct30d != null ? ` · official 30d average ${g.avgRentedPct30d}% time-rented` : ""
          }`,
        }
      : undefined;
  return {
    providerId: "lium",
    matchKey: key,
    hourlyLow: g.avgUsdPerHr,
    hourlyHigh: g.avgUsdPerHr,
    monthlyLow: g.monthlyUsd,
    monthlyHigh: g.monthlyUsd,
    monthlyMid: g.monthlyUsd,
    basis: "measured",
    demand,
    note: "Lium trailing-30d provider actuals (2026-10-23) incl. idle-pool pay",
  };
};

const ALL_PROVIDER_ROWS: ProviderGpuEarning[] = [
  ...VAST_ROWS,
  ...SALAD_ROWS,
  ...IONET_ROWS,
];

// --- Cross-provider comparison table ---------------------------------------

export interface GpuCompareRow {
  matchKey: string;
  display: string;
  vramGb: number | null;
  /** Per-provider monthly figures; null when that provider has no data. */
  byProvider: Partial<Record<HostProviderId, ProviderGpuEarning>>;
  /** Provider with the highest monthlyMid among rows that have data. */
  bestId: HostProviderId | null;
  bestMonthly: number | null;
  /** Best provider is an estimate — show the caveat in the verdict. */
  bestIsEstimate: boolean;
}

const COMPARE_KEYS: { key: string; display: string; vram: number | null }[] = [
  { key: "b300", display: "NVIDIA B300", vram: 288 },
  { key: "b200", display: "NVIDIA B200", vram: 192 },
  { key: "h200", display: "NVIDIA H200", vram: 141 },
  { key: "h100", display: "NVIDIA H100", vram: 80 },
  { key: "pro6000s", display: "RTX PRO 6000 (Server)", vram: 96 },
  { key: "a100", display: "NVIDIA A100", vram: 80 },
  { key: "5090", display: "RTX 5090", vram: 32 },
  { key: "4090", display: "RTX 4090", vram: 24 },
  { key: "4080", display: "RTX 4080", vram: 16 },
  { key: "3090ti", display: "RTX 3090 Ti", vram: 24 },
  { key: "3090", display: "RTX 3090", vram: 24 },
  { key: "4070tis", display: "RTX 4070 Ti SUPER", vram: 16 },
  { key: "4070", display: "RTX 4070", vram: 12 },
  { key: "3080", display: "RTX 3080", vram: 10 },
];

export const PROVIDER_COMPARE: GpuCompareRow[] = COMPARE_KEYS.map(({ key, display, vram }) => {
  const byProvider: Partial<Record<HostProviderId, ProviderGpuEarning>> = {};
  const lr = liumRow(key);
  if (lr) byProvider.lium = lr;
  for (const r of ALL_PROVIDER_ROWS) {
    if (r.matchKey === key) byProvider[r.providerId] = r;
  }
  let bestId: HostProviderId | null = null;
  let bestMonthly: number | null = null;
  let bestIsEstimate = false;
  for (const [, r] of Object.entries(byProvider)) {
    if (r?.monthlyMid != null && (bestMonthly == null || r.monthlyMid > bestMonthly)) {
      bestMonthly = r.monthlyMid;
      bestId = r.providerId;
      bestIsEstimate = r.basis === "estimate";
    }
  }
  return { matchKey: key, display, vramGb: vram, byProvider, bestId, bestMonthly, bestIsEstimate };
});

/** The four headline verdicts rendered above the comparison table. */
export const PROVIDER_VERDICTS: { title: string; body: string }[] = [
  {
    title: "Consumer RTX (3090 / 4090 / 5090) → Lium pays most",
    body: "4090: Lium banks $0.45/hr measured (incl. idle pay) → $339/mo, vs Vast live median $0.49 ask before commission, io.net $0.49 est and Salad $0.29 avg. 5090: Lium $0.57/hr → $464/mo beats Vast's $0.41–0.76 asks. 3090: Lium $0.19/hr → $135/mo vs Vast $0.12–0.21 and Salad $0.083.",
  },
  {
    title: "Mid-range cards (4070 / 4080 / 3080) → Salad is the only market that pays",
    body: "Neither Lium nor Vast publishes real money for these classes. Salad's measured $0.082–0.133/hr ($60–97/mo) with 94–98% job occupancy is the banked number — plus bandwidth income between jobs. Near-zero friction: a gaming PC qualifies.",
  },
  {
    title: "Datacenter (H100 / H200 / A100) → Lium's measured floor wins at the median",
    body: "H100: Lium $1.92/hr → $1,388/mo vs Vast live median $2.24 ask × 80% util ≈ $1,305 before commission. H200: Lium $4.05/hr → $3,118/mo incl. idle pay beats Vast's $3.27–4.34 asks. A100: Lium $1.22/hr → $778/mo edges io.net's $1.49 est ceiling ($761).",
  },
  {
    title: "Blackwell (B200 / B300 / RTX PRO 6000) → Lium is the only market that pays",
    body: "No other open marketplace publishes per-card host earnings for Blackwell-class fleets. Lium's measured B300 $8.34/hr → $6,238/mo and PRO 6000 $1.43/hr → $1,092/mo are the only real numbers — with TDX/colo requirements on the big cards.",
  },
];

export const HOST_BASIS_STYLE: Record<EarningsBasis, { label: string; cls: string; tip: string }> = {
  measured: {
    label: "measured",
    cls: "border-success/40 bg-success/10 text-success",
    tip: "Provider-published realized earnings (actual machines, actual payouts)",
  },
  published: {
    label: "published",
    cls: "border-primary/40 bg-primary/10 text-primary",
    tip: "Provider guidance / public rate card — host-side take may differ from renter price",
  },
  estimate: {
    label: "estimate",
    cls: "border-warning/40 bg-warning/10 text-warning",
    tip: "Our conversion of a published renter rate into a host monthly figure — commission not public",
  },
  none: {
    label: "no data",
    cls: "border-border/60 bg-card/30 text-muted-foreground",
    tip: "This provider does not publish per-card host earnings",
  },
};

export const COMPARE_MEASURED_AT = "2026-10-25";

// --- Demand chip (shared with the view) -------------------------------------

/** Thresholds: Tight ≥97% · Solid ≥85% · Loose below. */
export const DEMAND_CHIP_STYLE: { min: number; label: string; cls: string }[] = [
  { min: 97, label: "Tight", cls: "border-success/40 bg-success/10 text-success" },
  { min: 85, label: "Solid", cls: "border-primary/40 bg-primary/10 text-primary" },
  { min: 0, label: "Loose", cls: "border-warning/40 bg-warning/10 text-warning" },
];

export function demandChip(pct: number): { label: string; cls: string } {
  const s =
    DEMAND_CHIP_STYLE.find((d) => pct >= d.min) ?? DEMAND_CHIP_STYLE[DEMAND_CHIP_STYLE.length - 1];
  return { label: s.label, cls: s.cls };
}
