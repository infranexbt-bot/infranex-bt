// GPU-LANDSCAPE — category-wise GPU requirement classification.
//
// Answers one operator question per GPU class: "I have (or plan to rent)
// this class of card — which subnets can I actually mine?"
//
//   A) consumer    — RTX 3090 / 4090 / 5090 class, 24–32 GB
//   B) pro         — A6000 / L40S / RTX PRO 6000 class, 48–96 GB
//   C) datacenter  — A100 / H100 / H200 / B200 / B300 class
//   D) special     — bans, cross-class fallbacks, TEE quirks, unverified,
//                    and no-GPU (CPU-only / QPU) subnets
//
// A subnet may appear in MORE than one class when its README documents a
// menu of accepted cards (e.g. SN53 engy: 2× 4090/5090 OR L40S OR H100).
// The classification is evidence-driven: named models in recommendedGpu
// first, VRAM floor second, hand-curated overrides for odd wording last.
// Client-safe (pure) — the API route supplies DB rows + live metrics.

import { COMPAT_SEED } from "./compat-seed";

export type GpuClass = "consumer" | "pro" | "datacenter";

export type SpecialGroup =
  | "banned" // explicit GPU exclusion (SN44)
  | "fallback" // DC-first with documented consumer fallback (SN100)
  | "unspecified" // GPU required but model/VRAM undocumented (SN55)
  | "unverified" // no scraped GPU requirement at all
  | "quantum" // QPU — no GPU at all (SN48)
  | "cpu-only"; // workload needs no GPU

export interface LandscapeHosting {
  tee: boolean;
  bareMetal: boolean;
  staticIp: boolean;
}

export interface LandscapeLive {
  minersCount: number | null;
  rewardedMiners: number | null;
  /** Whole-subnet miner-side emission, TAO/day (chain-measured). */
  minerEmissionTaoPerDay: number | null;
  /** Realizable yield per EARNING miner, USD/day (emission × pool
   *  realizability ÷ rewarded UIDs × TAO spot). Null when no rewards. */
  perEarningUsdPerDay: number | null;
  /** True when the per-miner figure fell back to per-registered × 0.6
   *  (reward vector unavailable) — shown as "≈" in the UI. */
  estimated: boolean;
}

export interface LandscapeEntry {
  netuid: number;
  name: string;
  /** Scraped GPU requirement line (verbatim from the repo README). */
  gpu: string;
  minVramGb: number | null;
  gpuCount: number | null;
  classes: GpuClass[];
  special: SpecialGroup | null;
  /** One-line reason for the placement (special cases / cross-class). */
  note: string;
  compatTier: string;
  hosting: LandscapeHosting;
  /** Repo URL whose README supplied the requirement (provenance). */
  requirementsSource: string | null;
  live: LandscapeLive | null;
}

export interface CategoryMeta {
  key: "consumer" | "pro" | "datacenter" | "special";
  letter: string;
  title: string;
  vramBand: string;
  models: string;
  description: string;
}

export const LANDSCAPE_CATEGORIES: CategoryMeta[] = [
  {
    key: "consumer",
    letter: "A",
    title: "Consumer RTX",
    vramBand: "24–32 GB",
    models: "RTX 3090 · 4090 · 5090",
    description:
      "Gaming-grade GeForce cards. Highest performance per dollar, lowest rental rate, but limited by 24–32 GB VRAM, consumer cooling and no ECC. Every subnet here documents a consumer card as sufficient — either by naming it outright or by keeping the per-GPU VRAM floor at or below 32 GB.",
  },
  {
    key: "pro",
    letter: "B",
    title: "Pro / Workstation",
    vramBand: "48–96 GB",
    models: "RTX A6000 · L40S · RTX PRO 6000",
    description:
      "Workstation cards built for 24/7 operation: blower or dual-flow cooling, ECC GDDR, and 48–96 GB per card. These subnets need more than 32 GB per GPU or name pro-class models directly. The rental premium over consumer cards is roughly 2–3×, buying you bigger model shards and passive datacenter mounting.",
  },
  {
    key: "datacenter",
    letter: "C",
    title: "Datacenter",
    vramBand: "80 GB+ / multi-GPU",
    models: "A100 · H100 · H200 · B200 · B300",
    description:
      "SXM/PCIe datacenter accelerators with NVLink and high-memory bandwidth. These subnets train or serve frontier-scale models — 8× H200 nodes, 24-GPU fleets, B200-only SKU gates. Entry cost is five to six figures per node, so mining here is a datacenter-operator game, not a single-GPU play.",
  },
  {
    key: "special",
    letter: "D",
    title: "Special cases",
    vramBand: "mixed",
    models: "bans · fallbacks · TEE · unverified · no-GPU",
    description:
      "Subnets that do not fit a clean GPU class: explicit model bans, datacenter-first listings with a consumer fallback, TEE-attestation quirks, requirements we could not verify from the repo, and subnets that need no GPU at all (CPU-only or quantum). Read the note on each card before spending money.",
  },
];

// --- Model taxonomy ------------------------------------------------------

const CONSUMER_RE =
  /\b(RTX\s*(3090|4090|5090)|3090\s*Ti|4090|5090|GeForce|4080|5080|4070)\b/i;
const PRO_RE =
  /\b(A6000|L40S|L40\b|RTX\s*PRO\s*6000|RTX\s*6000\s*Ada|RTX\s*5000|A5000)\b/i;
const DC_RE =
  /\b(A100|H100|H200|B200|B300|GB200|H20\b|A800|H800|MI300X|MI325X)\b/i;
const VRAM_FLOOR_RE = /(?:>=?\s*|≥\s*|at least\s*|>\s*)(\d{1,3})\s*GB/i;
const BAN_RE = /excluded|banned|not\s*(?:allowed|supported|accepted)/i;
const CPU_ONLY_RE = /cpu-only|no\s*gpu|\bqpu\b|quantum/i;

// --- Hand-curated overrides ----------------------------------------------
// Odd README wording that regexes would mis-bucket. Each entry records why.
const OVERRIDES: Record<
  number,
  { classes: GpuClass[]; special?: SpecialGroup; note: string }
> = {
  51: {
    classes: ["consumer"],
    note: "GPU rental marketplace (lium.io): consumer RTX 5090s are accepted rental supply — the pool itself spans up to 8× B300. See GPU Catalog for the rental play.",
  },
  53: {
    classes: ["consumer", "pro", "datacenter"],
    note: "Three-path menu: 2× RTX 4090/5090, or 1× L40S / RTX 6000 Ada (48 GB), or H100/H200/B200 — one card per class bucket.",
  },
  80: {
    classes: ["consumer"],
    note: "Minimum 1× 24 GB GPU (a 4090/5090 meets it); A100 80 GB is the README's recommendation, not the floor.",
  },
  81: {
    classes: ["consumer"],
    note: "1–2× GPUs ≥24 GB each — consumer cards meet the floor; H100/H200 is the reference setup only.",
  },
  85: {
    classes: ["pro"],
    note: "L4 / L40S / RTX PRO 6000 (≥16 GB per GPU) — pro-class list; the L4 is a low-end datacenter card, not a consumer option.",
  },
  91: {
    classes: ["consumer", "pro"],
    note: "RTX 4090 / 3090 / L40S / L40 / A6000 — the validator pins ONE exact model per round, so check the round spec before renting.",
  },
  94: {
    classes: ["consumer"],
    note: "1× CUDA GPU ≥24 GB VRAM (A10G tested) — consumer cards meet the floor; TDX/SEV attestation is a validator-side quickstart, not a miner requirement.",
  },
  102: {
    classes: ["pro", "datacenter"],
    note: "A100/H100 class 40 GB+ — but the README explicitly allows an A6000 48 GB, making pro-class the cheapest entry.",
  },
  36: {
    classes: ["consumer"],
    note: "README asks for 1× consumer GPU without naming a model — any 24 GB-class GeForce qualifies.",
  },
  44: {
    classes: [],
    special: "banned",
    note: "1× GPU ≥16 GB VRAM, but RTX 5090 / B200 / H200 / H20 / MI300X are explicitly EXCLUDED — a 4090-class card is the realistic entry.",
  },
  48: {
    classes: [],
    special: "quantum",
    note: "Quantum hardware (QPU) — no GPU involved at any tier.",
  },
  55: {
    classes: [],
    special: "unspecified",
    note: "GPU required but the repo never names a model or VRAM budget — verify with the subnet team before renting.",
  },
  100: {
    classes: [],
    special: "fallback",
    note: "B200 is the primary scored SKU; RTX 5090 / RTX PRO 6000 are documented fallbacks when B200 capacity is short.",
  },
};

// --- Classification ------------------------------------------------------

function classesForGpuText(gpu: string, floorGb: number | null): GpuClass[] {
  const classes: GpuClass[] = [];
  if (CONSUMER_RE.test(gpu) || (floorGb !== null && floorGb <= 32 && !DC_RE.test(gpu)))
    classes.push("consumer");
  if (PRO_RE.test(gpu) || (floorGb !== null && floorGb > 32 && floorGb <= 96 && !DC_RE.test(gpu)))
    classes.push("pro");
  if (DC_RE.test(gpu) || (floorGb !== null && floorGb > 96)) classes.push("datacenter");
  if (classes.length === 0 && floorGb !== null) {
    // Floor with no recognized model family — bucket by the number itself.
    if (floorGb <= 32) classes.push("consumer");
    else if (floorGb <= 96) classes.push("pro");
    else classes.push("datacenter");
  }
  return classes;
}

interface RawRow {
  netuid: number;
  name: string | null;
  recommendedGpu: string | null;
  minVramGb: number | null;
  gpuCount: number | null;
  hostingRequirements: string | null;
  requirementsSource?: string | null;
}

/** Pure classifier: DB rows + live metrics in, four landscape buckets out. */
export function classifyGpuLandscape(
  rows: RawRow[],
  liveByNetuid: Map<number, LandscapeLive>,
  taoUsd: number
): Record<CategoryMeta["key"], LandscapeEntry[]> {
  const buckets: Record<CategoryMeta["key"], LandscapeEntry[]> = {
    consumer: [],
    pro: [],
    datacenter: [],
    special: [],
  };

  for (const r of rows) {
    const gpu = (r.recommendedGpu ?? "").trim();
    const hosting: LandscapeHosting = { tee: false, bareMetal: false, staticIp: false };
    if (r.hostingRequirements) {
      try {
        const h = JSON.parse(r.hostingRequirements) as Record<string, unknown>;
        hosting.tee = h.teeRequired === true;
        hosting.bareMetal = h.bareMetalOnly === true;
        hosting.staticIp = h.staticIpRequired === true;
      } catch {
        /* malformed hosting JSON — treat as clean */
      }
    }
    const seed = COMPAT_SEED[r.netuid];

    const floorMatch = VRAM_FLOOR_RE.exec(gpu);
    const floorGb = floorMatch ? parseInt(floorMatch[1], 10) : r.minVramGb || null;

    let classes: GpuClass[] = [];
    let special: SpecialGroup | null = null;
    let note = "";

    const ov = OVERRIDES[r.netuid];
    if (ov) {
      classes = ov.classes;
      special = ov.special ?? null;
      note = ov.note;
    } else if (CPU_ONLY_RE.test(gpu)) {
      special = /qpu|quantum/i.test(gpu) ? "quantum" : "cpu-only";
      note =
        special === "quantum"
          ? "Quantum hardware (QPU) — no GPU involved."
          : "CPU-only workload — the miner path needs no GPU.";
    } else if (!gpu && r.minVramGb === 0) {
      special = "cpu-only";
      note = "CPU-only workload (VRAM floor 0) — the miner path needs no GPU.";
    } else if (!gpu && !r.minVramGb) {
      special = "unverified";
      note = "No GPU requirement could be verified from the subnet's repo — treat as unknown until audited.";
    } else if (BAN_RE.test(gpu)) {
      special = "banned";
      note = `Explicit model exclusion in the requirement line: "${gpu}"`;
    } else {
      classes = classesForGpuText(gpu, floorGb);
      if (classes.length === 0) {
        special = "unverified";
        note = "Ambiguous GPU wording — could not map to a hardware class.";
      }
    }

    const entry: LandscapeEntry = {
      netuid: r.netuid,
      name: r.name ?? `Subnet ${r.netuid}`,
      gpu: gpu || "(no requirement scraped)",
      minVramGb: r.minVramGb,
      gpuCount: r.gpuCount,
      classes,
      special,
      note,
      compatTier: seed?.tier ?? "unknown",
      hosting,
      requirementsSource: r.requirementsSource ?? null,
      live: liveByNetuid.get(r.netuid) ?? null,
    };

    if (special !== null) buckets.special.push(entry);
    else for (const c of classes) buckets[c].push(entry);
  }

  // Rank every bucket by realizable per-earning-miner yield (desc), then netuid.
  const rank = (a: LandscapeEntry, b: LandscapeEntry) =>
    (b.live?.perEarningUsdPerDay ?? -1) - (a.live?.perEarningUsdPerDay ?? -1) ||
    a.netuid - b.netuid;
  for (const key of Object.keys(buckets) as CategoryMeta["key"][]) {
    buckets[key].sort((a, b) =>
      key === "special" ? specialOrder(a) - specialOrder(b) || a.netuid - b.netuid : rank(a, b)
    );
  }
  void taoUsd; // realized yields arrive pre-computed in liveByNetuid
  return buckets;
}

/** Display order inside the Special bucket. */
function specialOrder(e: LandscapeEntry): number {
  const order: SpecialGroup[] = ["banned", "fallback", "unspecified", "unverified", "quantum", "cpu-only"];
  const i = e.special ? order.indexOf(e.special) : -1;
  return i < 0 ? order.length : i;
}

/** Build the per-miner live metrics exactly like the platform's miner-score
 *  pipeline does (realizability haircut; conservative fallback when the
 *  reward vector is unavailable), so this page never disagrees with
 *  Opportunities / profit ranks. */
export function buildLive(
  s: {
    minersCount?: number | null;
    rewardedMiners?: number | null;
    minerEmissionTaoPerDay?: number | null;
    rewardRealizability?: number | null;
  },
  taoUsd: number
): LandscapeLive {
  const registered = s.minersCount ?? null;
  const rewarded = s.rewardedMiners ?? null;
  const em = s.minerEmissionTaoPerDay ?? null;
  const realizability =
    s.rewardRealizability != null && s.rewardRealizability > 0
      ? Math.min(s.rewardRealizability, 1)
      : 1;
  let perEarningUsdPerDay: number | null = null;
  let estimated = false;
  if (em != null && em > 0 && taoUsd > 0) {
    if (rewarded != null && rewarded > 0) {
      perEarningUsdPerDay = ((em * realizability) / rewarded) * taoUsd;
    } else if (registered != null && registered > 0) {
      // No reward vector — conservative mean × 0.6, same as live-merge.
      perEarningUsdPerDay = ((em * realizability) / registered) * 0.6 * taoUsd;
      estimated = true;
    }
  }
  return {
    minersCount: registered,
    rewardedMiners: rewarded,
    minerEmissionTaoPerDay: em,
    perEarningUsdPerDay,
    estimated,
  };
}
