// ---------------------------------------------------------------------------
// HOST-PROVIDERS LIB — cross-provider GPU hosting earnings comparison.
//
// The Host & Earn module measured Lium (SN51) provider actuals; this lib
// answers the operator's next question: "LIUM IS ONE MARKETPLACE — WHO ELSE
// PAYS ME TO HOST, AND WHO PAYS MOST FOR MY SPECIFIC CARD?"
//
// Providers covered: lium (already measured in lium-earnings.ts), Vast.ai,
// SaladCloud, io.net, RunPod (Community Cloud) and TensorDock.
//
// HONESTY CONTRACT — every number carries a data-basis label:
//   measured  → provider-published realized earnings (Salad's weekly earning-
//               rates table; Lium's trailing-30d actuals).
//   published → provider guidance / public rate cards (Vast's host article;
//               io.net's on-demand renter rates). Host-side take may differ.
//   estimate  → our conversion of a published RENTER-side rate into a host
//               monthly figure with an assumed utilization; the platform's
//               host commission is not public. Verify before committing HW.
// Nothing here is a guarantee: all six markets reprice continuously.
// ---------------------------------------------------------------------------

import { LIUM_GPUS, type LiumGpuRow } from "./lium-earnings";

export type HostProviderId = "lium" | "vast" | "salad" | "ionet" | "runpod" | "tensordock";

export type EarningsBasis = "measured" | "published" | "estimate" | "none";

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
    measuredAt: "2026-05-18",
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
      "Published host guidance: RTX 5090 $0.30–0.60/GPU-hr; H100/H200 $2.15–4.00+/GPU-hr",
      "3 rental modes (on-demand / interruptible / reserved) + financing & presold enterprise capacity",
    ],
    cons: [
      "No idle pay — you earn only when rented",
      "Marketplace prices move continuously; a fleet wave compresses yields",
      "Self-managed support burden; reliability score drives placement",
    ],
    dataNote:
      "Vast's own host article (May 2026): 4×5090 rig at 80% utilization → $700–1,400/mo. Renter-side ranges cross-checked against io.net's FAQ comparison. Utilization assumed 80% in our monthly conversion.",
  },
  {
    id: "salad",
    name: "SaladCloud",
    tagline: "Easiest entry — your gaming PC chops containers",
    kind: "Distributed consumer network (container engine)",
    url: "https://salad.com",
    hostUrl: "https://salad.com/earning-rates",
    measuredAt: "2026-10-22",
    payoutRail: "Weekly payouts — PayPal, crypto & other methods",
    payoutMin: "~$5 (verify current options in portal)",
    platformTake: "Not published; rates below are what machines actually earned",
    entryBar: "easy",
    entryNote:
      "A Windows/Linux desktop with a consumer GPU, 32 GB RAM and 500 GB storage qualifies. 190+ countries. Lowest friction of all six.",
    requirements: [
      "Consumer GPU (40+ classes, RTX 20-series → 50-series, some AMD)",
      "32 GB system RAM + 500 GB storage recommended",
      "Residential broadband; machine left running",
      "Runs container jobs only — no root, no VM passthrough",
    ],
    pros: [
      "Real measured earning rates published weekly (4090 avg $0.291/hr, top chefs $0.488)",
      "98% job-occupancy on top cards + bandwidth-sharing income between jobs",
      "Works on gaming PCs and mid-range cards (4070/4080/3080) Lium doesn't list",
    ],
    cons: [
      "Lowest ceiling — mid cards earn $60–100/mo",
      "No bare-metal/root; some workloads (TEE, static IP) impossible",
      "Consumer-grade reliability expectations",
    ],
    dataNote:
      "salad.com/earning-rates trailing week (Oct 16–22 2026), 'average' includes hours with no job; 'top chefs' = best-placed 1%. Monthly = rate × 729.6 h.",
  },
  {
    id: "ionet",
    name: "io.net",
    tagline: "DePIN compute network — $IO token rewards on top",
    kind: "Decentralized physical infrastructure network (IO Worker)",
    url: "https://io.net",
    hostUrl: "https://io.net/blog/unlock-the-potential-of-your-underutilized-hardware-rent-your-gpus-cpus-with-io-worker",
    measuredAt: "2025-07-30",
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
      "io.net's published on-demand renter rates (Jul 2025): RTX 4090 $0.49/hr, A100 80GB $1.49/hr, H100 SXM $1.85–2.20/hr. Our monthly = renter rate × 729.6 h × 70% assumed utilization, BEFORE any platform cut — treat as a ceiling.",
  },
  {
    id: "runpod",
    name: "RunPod (Community Cloud)",
    tagline: "Big demand, opaque host program — partner onboarding",
    kind: "Community Cloud (third-party hosts) + Secure Cloud (own DCs)",
    url: "https://runpod.io",
    hostUrl: "https://www.runpod.io/pricing",
    measuredAt: "2026-10-19",
    payoutRail: "Not public — partner/host onboarding via their team",
    payoutMin: "—",
    platformTake: "Not published",
    entryBar: "strict",
    entryNote:
      "Community Cloud rents third-party hosts' GPUs (no SLA by design), but RunPod does not publish a public per-card host rate card or signup. Apply through their partner form.",
    requirements: [
      "Application/partner onboarding (no self-serve host console)",
      "Enterprise H200/B200 listings visible on Community pricing",
      "Reliability expectations mirror Secure Cloud minus the SLA",
    ],
    pros: [
      "1M+ developers and strong serverless demand upstream of Community supply",
      "Community renter prices sit close below Secure Cloud — decent host economics",
    ],
    cons: [
      "No public per-card host earnings — everything is quote-based",
      "No SLA on Community tier; reliability reputation matters",
      "Not worth it for a single consumer card; fleet/colo operators only",
    ],
    dataNote:
      "Profile-only: no measured or published per-card host figures. Reference points are their public renter rates (RTX 4090 $0.89/hr Secure, H200 $5.29/hr, B200 $7.99/hr; Oct 2026).",
  },
  {
    id: "tensordock",
    name: "TensorDock",
    tagline: "Vetted host marketplace — Stripe payouts, strict requirements",
    kind: "Curated marketplace of independent hosts (VM-based)",
    url: "https://tensordock.com",
    hostUrl: "https://www.tensordock.com/host.html",
    measuredAt: "2026-10-25",
    payoutRail: "Stripe payouts on demand (fees covered above $10K)",
    payoutMin: "—",
    platformTake: "Marketplace fee on rentals (host sets own pricing)",
    entryBar: "strict",
    entryNote:
      "Every host is vetted; hardware must live in a datacenter. Their own FAQ: hosts aim to make money back in 2–3 years — plan capex accordingly.",
    requirements: [
      "Datacenter housing with power & internet redundancy",
      "1 Gbps shared up to ~40 GPUs; static IP (or borrow their /24–/22)",
      "16 GB+ RAM per GPU, 8+ vCPUs @3 GHz per GPU, 1 TB NVMe per GPU",
      "PCIe 16 GB/s per GPU (4.0 x8 / 3.0 x16) + GPU passthrough",
    ],
    pros: [
      "You set your own prices; Stripe rails, no token exposure",
      "44 GPU types listed; converted mining rigs accepted if specs hold",
    ],
    cons: [
      "Strict vetting — home rigs excluded (datacenter only)",
      "Host payback window is 2–3 years per their own guidance",
      "Downtime penalized; VM/hypervisor stack to maintain",
    ],
    dataNote:
      "Profile-only: no public per-card host earnings. Requirements and payback guidance from tensordock.com/host.html.",
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

// Vast.ai — published host guidance (May 2026) + renter-side ranges (io.net FAQ).
// Consumer rigs modeled at 80% utilization per Vast's own 4×5090 example.
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
      note ||
      `Vast guidance/renter ranges at ${(util * 100).toFixed(0)}% util — $${hLow.toFixed(2)}–${hHigh.toFixed(2)}/GPU-hr`,
  };
};

const VAST_ROWS: ProviderGpuEarning[] = [
  vast("5090", 0.3, 0.6, 0.8, "Vast host article (May 2026): 4×5090 rig @80% → $700–1,400/mo total"),
  vast("4090", 0.28, 0.5, 0.8, "Renter-side on-demand range (io.net FAQ cross-check) at 80% util"),
  vast("a100", 0.8, 1.8, 0.8, "A100 80GB bid→on-demand range (io.net FAQ cross-check) at 80% util"),
  vast("h100", 2.15, 4.0, 0.8, "Vast host article (May 2026): H100/H200 $2.15–4.00+/GPU-hr at 80% util"),
  vast("h200", 2.15, 4.0, 0.8, "Vast groups H200 with H100 in host guidance; Lium H200 measured sits inside this range"),
];

// SaladCloud — measured trailing-week earning rates (Oct 16–22 2026).
// The rate already includes no-job hours, so utilization ≈ 1; high = top-chefs.
const salad = (key: string, avg: number, top: number | null, note = ""): ProviderGpuEarning => ({
  providerId: "salad",
  matchKey: key,
  hourlyLow: avg,
  hourlyHigh: top,
  monthlyLow: round(avg * HOURS),
  monthlyHigh: round(top != null ? top * HOURS : avg * HOURS),
  monthlyMid: round(avg * HOURS),
  basis: "measured",
  note:
    note ||
    `Salad trailing-week avg $${avg.toFixed(3)}/hr${top != null ? ` · top chefs $${top.toFixed(2)}/hr` : ""}`,
});

const SALAD_ROWS: ProviderGpuEarning[] = [
  salad("5090", 0.281, 0.413),
  salad("4090", 0.291, 0.488, "Highest measured consumer card on Salad — 98% job occupancy"),
  salad("4080", 0.133, 0.324),
  salad("3090ti", 0.104, 0.16),
  salad("3090", 0.083, 0.157),
  salad("4070tis", 0.115, null, "Top-chef figure for 4070 Ti SUPER is a small-sample outlier — avg only"),
  salad("4070", 0.088, 0.141),
  salad("3080", 0.082, 0.122),
];

// io.net — published renter rates (Jul 2025) → estimate: 70% util, no platform cut.
const ionet = (key: string, hLow: number, hHigh: number): ProviderGpuEarning => {
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
    note: `io.net renter rate $${hLow.toFixed(2)}–${hHigh.toFixed(2)}/hr × 70% util — host share not published, treat as ceiling`,
  };
};

const IONET_ROWS: ProviderGpuEarning[] = [
  ionet("4090", 0.49, 0.49),
  ionet("a100", 1.49, 1.49),
  ionet("h100", 1.85, 2.2),
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
  return {
    providerId: "lium",
    matchKey: key,
    hourlyLow: g.avgUsdPerHr,
    hourlyHigh: g.avgUsdPerHr,
    monthlyLow: g.monthlyUsd,
    monthlyHigh: g.monthlyUsd,
    monthlyMid: g.monthlyUsd,
    basis: "measured",
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
    body: "Lium's measured trailing-30d actuals beat every other provider mid for the same card: 4090 $339 vs io.net ~$250 (est) vs Salad $212 vs Vast $163–292. Vast's top-end for a 4090 approaches Lium only at high utilization.",
  },
  {
    title: "Mid-range cards (4070 / 4080 / 3080) → Salad is the only real market",
    body: "Lium doesn't list these classes. Salad's measured $60–97/mo is the honest floor — plus bandwidth income between jobs. It's low ceiling, near-zero friction.",
  },
  {
    title: "H100 → Vast's range can beat Lium; H200 → Lium's idle pay wins",
    body: "Vast H100 guidance $2.15–4.00/GPU-hr (≈$1,254–2,334/mo at 80%) brackets Lium's $1,388. For H200, Lium's measured $3,118 with a 0.56 idle-pool weight still tops Vast's grouped range.",
  },
  {
    title: "B200 / B300 / RTX PRO 6000 → Lium is the only measured market",
    body: "No other provider publishes per-card host earnings for Blackwell-class fleets. Lium's $1,092–$6,238/mo figures are the only data — with TDX/colo requirements on the big cards.",
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
