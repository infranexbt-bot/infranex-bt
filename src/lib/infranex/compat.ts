// GPU hosting compatibility for Bittensor subnets.
//
// Answers one operator question per subnet: "can I run this on RunPod/Vast,
// or do I need bare metal / TEE hardware?"
//
// Resolution order (highest wins):
//   1. live-scrape — hostingRequirements JSON the GitHub sync (sync-all /
//      github-scraper) stored for this subnet, with quoted evidence lines
//   2. audit seed  — COMPAT_SEED: hand-verified full-audit classification of
//      all 128 mineable subnets with verbatim README quotes
//   3. structural  — no repo published / parked subnet → caveat tiers
//
// Bare metal is accepted by EVERY subnet (no subnet bans it); the
// restrictions always restrict container clouds. That asymmetry is baked
// into the tier semantics.

import { COMPAT_SEED } from "./compat-seed";

export type CompatTier =
  | "bare-metal-only"
  | "tee-required"
  | "provider-friendly"
  | "gpu-flexible"
  | "cpu-only"
  | "unclear"
  | "no-repo"
  | "parked";

/** Shape of the scraped hostingRequirements JSON stored in SubnetOverride. */
export interface HostingScrape {
  bareMetalOnly?: boolean;
  teeRequired?: boolean;
  staticIpRequired?: boolean;
  notes?: string[];
  minVramGb?: number | null;
  recommendedGpu?: string | null;
  gpuCount?: number | null;
  evidence?: string[];
}

export interface SubnetCompat {
  tier: CompatTier;
  /** Where the classification came from. */
  source: "live-scrape" | "audit" | "inferred" | "structural";
  /** Plain-English verdict for the operator. */
  instructions: string;
  /** RunPod / Vast / Akash container clouds allowed? */
  containerCloudsOk: boolean;
  needsBareMetal: boolean;
  needsTee: boolean;
  needsStaticIp: boolean;
  /** Short requirement chips, e.g. "bare metal", "static 1:1 IP", "Intel TDX". */
  requirements: string[];
  /** Verbatim README evidence (when available). */
  quote?: string;
  /** Repo/doc the quote or classification came from. */
  evidenceSource?: string;
  /** Audit finding line. */
  note?: string;
  /** When the audit evidence was captured. */
  verifiedAt: string;
}

/** Audit evidence capture date (full 128-subnet README audit). */
const AUDIT_DATE = "2026-09-24";

interface TierMeta {
  label: string;
  short: string;
  badgeClass: string;
  dotClass: string;
  description: string;
  caveat?: boolean;
}

export const COMPAT_TIER_META: Record<CompatTier, TierMeta> = {
  "bare-metal-only": {
    label: "Bare metal only",
    short: "bare metal",
    badgeClass: "border-destructive/40 bg-destructive/10 text-destructive",
    dotClass: "bg-destructive",
    description:
      "RunPod / Vast / container clouds are banned by this subnet's own docs. A single-tenant bare-metal server (owned, colo, or bare-metal provider like Latitude.sh) is required.",
  },
  "tee-required": {
    label: "TEE required",
    short: "TEE",
    badgeClass: "border-amber-500/40 bg-amber-500/10 text-amber-500",
    dotClass: "bg-amber-500",
    description:
      "Miners must run inside confidential-compute hardware (Intel TDX / NVIDIA H100 CC mode / Phala CVM). Regular container clouds do not expose TEEs — use TEE-capable bare metal or the subnet's designated platform.",
  },
  "provider-friendly": {
    label: "RunPod / Vast OK",
    short: "cloud OK",
    badgeClass: "border-success/40 bg-success/10 text-success",
    dotClass: "bg-success",
    description:
      "The subnet's own README ships cloud setup guides (or operates as a rental layer) — hourly container clouds work out of the box.",
  },
  "gpu-flexible": {
    label: "GPU — no restriction stated",
    short: "flexible",
    badgeClass: "border-primary/40 bg-primary/10 text-primary",
    dotClass: "bg-primary",
    description:
      "No hosting restriction found in the repo — rented GPUs (RunPod / Vast) are allowed by default. Bare metal also works.",
  },
  "cpu-only": {
    label: "CPU / non-GPU",
    short: "CPU",
    badgeClass: "border-border/60 bg-muted/40 text-muted-foreground",
    dotClass: "bg-muted-foreground",
    description:
      "No GPU needed — a cheap VPS or CPU box is enough (or the task is data/API work, not compute).",
  },
  unclear: {
    label: "Unclear — check Discord",
    short: "unclear",
    badgeClass: "border-amber-500/40 bg-amber-500/10 text-amber-500",
    dotClass: "bg-amber-500",
    caveat: true,
    description:
      "This subnet does not publish its miner requirements in its repo (many publish them in their Discord only). Verify with the subnet team before spending on hardware.",
  },
  "no-repo": {
    label: "No public repo",
    short: "no repo",
    badgeClass: "border-amber-500/40 bg-amber-500/10 text-amber-500",
    dotClass: "bg-amber-500",
    caveat: true,
    description:
      "No public GitHub is registered on-chain for this subnet — requirements live in its community/Discord. Verify before deploying anything.",
  },
  parked: {
    label: "Parked / inactive",
    short: "parked",
    badgeClass: "border-border/60 bg-muted/40 text-muted-foreground",
    dotClass: "bg-muted-foreground",
    description:
      "This subnet is parked, for sale, or deprecated — not a mining target.",
  },
};

const INSTRUCTIONS: Record<CompatTier, string> = {
  "bare-metal-only":
    "Cannot run on RunPod / Vast / container clouds — this subnet's docs reject them. Rent or own a bare-metal server with a static 1:1 IP; hourly clouds will be rejected by validators.",
  "tee-required":
    "Requires confidential-compute hardware (Intel TDX / NVIDIA CC-mode H100). Plain RunPod/Vast containers do not expose a TEE — use TEE-capable bare metal or the subnet's designated platform.",
  "provider-friendly":
    "Runs on rented container clouds — the repo itself documents RunPod/Vast setup. Hourly rentals are fine; bare metal also works.",
  "gpu-flexible":
    "No hosting restriction stated in the repo — RunPod / Vast rentals are allowed. Bare metal works too (it always does).",
  "cpu-only":
    "No GPU required — a small VPS or CPU server is enough. Do not rent a GPU for this subnet.",
  unclear:
    "Requirements are not published in the repo (Discord-only docs). Do not provision hardware until the subnet team confirms what it needs.",
  "no-repo":
    "No public repo exists to verify — treat all requirements as unconfirmed and check the subnet's Discord/community first.",
  parked: "Parked or inactive subnet — skip it; there is nothing to mine here.",
};

function chips(opts: {
  bareMetal?: boolean;
  tee?: boolean;
  staticIp?: boolean;
  gpu?: boolean;
  cpu?: boolean;
}): string[] {
  const out: string[] = [];
  if (opts.bareMetal) out.push("bare metal");
  if (opts.staticIp) out.push("static 1:1 IP");
  if (opts.tee) out.push("TEE (TDX / CC-mode)");
  if (opts.gpu) out.push("GPU required");
  if (opts.cpu) out.push("CPU only");
  return out;
}

/** Resolve the GPU hosting compatibility for one subnet. */
export function resolveCompat(
  netuid: number,
  hosting?: unknown,
  githubUrl?: string | null
): SubnetCompat {
  const h = (hosting ?? null) as HostingScrape | null;

  // 1. live scrape with real flags wins — it reflects the repo as of the
  //    last GitHub sync.
  if (h && (h.bareMetalOnly || h.teeRequired || h.staticIpRequired)) {
    const bareMetal = !!h.bareMetalOnly;
    const tee = !!h.teeRequired;
    const sip = !!h.staticIpRequired;
    const quote = h.notes?.[0] ?? h.evidence?.[0];
    return {
      tier: bareMetal ? "bare-metal-only" : "tee-required",
      source: "live-scrape",
      instructions: bareMetal
        ? INSTRUCTIONS["bare-metal-only"]
        : INSTRUCTIONS["tee-required"],
      containerCloudsOk: false,
      needsBareMetal: true,
      needsTee: tee,
      needsStaticIp: sip,
      requirements: chips({ bareMetal: true, tee, staticIp: sip, gpu: true }),
      quote,
      evidenceSource: "GitHub sync (subnet README)",
      note: h.notes?.slice(0, 2).join(" · "),
      verifiedAt: new Date().toISOString().slice(0, 10),
    };
  }

  // 2. audit seed
  const seed = COMPAT_SEED[netuid];
  if (seed) {
    const meta = COMPAT_TIER_META[seed.tier];
    return {
      tier: seed.tier,
      source: seed.source === "audit" ? "audit" : seed.source === "readme" ? "readme" : "inferred",
      instructions: INSTRUCTIONS[seed.tier],
      containerCloudsOk:
        seed.tier === "provider-friendly" ||
        seed.tier === "gpu-flexible" ||
        seed.tier === "cpu-only",
      needsBareMetal: seed.tier === "bare-metal-only" || seed.tier === "tee-required",
      needsTee: seed.tier === "tee-required",
      needsStaticIp: seed.tier === "bare-metal-only",
      requirements: chips({
        bareMetal: seed.tier === "bare-metal-only",
        tee: seed.tier === "tee-required",
        staticIp: seed.tier === "bare-metal-only",
        gpu: seed.tier === "gpu-flexible" || seed.tier === "provider-friendly" || seed.tier === "bare-metal-only" || seed.tier === "tee-required",
        cpu: seed.tier === "cpu-only",
      }),
      quote: seed.quote,
      evidenceSource: seed.evidenceSource,
      note: seed.note,
      verifiedAt: AUDIT_DATE,
      ...(meta ? {} : {}),
    };
  }

  // 3. structural fallbacks
  if (!githubUrl) {
    return {
      tier: "no-repo",
      source: "structural",
      instructions: INSTRUCTIONS["no-repo"],
      containerCloudsOk: false,
      needsBareMetal: false,
      needsTee: false,
      needsStaticIp: false,
      requirements: [],
      note: "No public GitHub registered on-chain — requirements live in the subnet's Discord.",
      verifiedAt: AUDIT_DATE,
    };
  }
  return {
    tier: "unclear",
    source: "structural",
    instructions: INSTRUCTIONS.unclear,
    containerCloudsOk: false,
    needsBareMetal: false,
    needsTee: false,
    needsStaticIp: false,
    requirements: [],
    note: "Repo exists but its README does not state hosting rules — check the subnet's Discord.",
    verifiedAt: AUDIT_DATE,
  };
}

/** Filter keys used by the Subnets view chips. */
export type CompatFilter =
  | "all"
  | "bare-metal-only"
  | "tee-required"
  | "cloud-ok"
  | "cpu"
  | "caveats";

export function matchCompatFilter(f: CompatFilter, c: SubnetCompat): boolean {
  switch (f) {
    case "all":
      return true;
    case "bare-metal-only":
      return c.tier === "bare-metal-only";
    case "tee-required":
      return c.tier === "tee-required";
    case "cloud-ok":
      return c.containerCloudsOk;
    case "cpu":
      return c.tier === "cpu-only";
    case "caveats":
      return !!COMPAT_TIER_META[c.tier].caveat;
  }
}
