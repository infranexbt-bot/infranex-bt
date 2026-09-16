// ---------------------------------------------------------------------------
// MECHANICS-1 — per-subnet "official mechanics" knowledge layer.
//
// WHAT THIS FIXES: the Miner's Ledger engine is chain-metrics-only by design.
// It knows nothing that lives OFF-chain in a subnet's own software docs —
// reward windows, bounty programs, optimization guidance, hosting rules.
// The SN64 audit (chutes-knowledge-1/2/3) proved the generic bond-EMA ramp
// heuristic overstates Chutes' ramp 10x (13.6wk vs a 7-day compute-sum
// window) and priced SN64 off container rent when the subnet rejects
// containers outright.
//
// This layer is CURATED (hand-verified against the official repos, with
// verbatim quotes), not scraped: mechanics prose is sparse and easy to
// false-positive on, so a human-verified map beats a keyword guess. The
// keyword extractor below (extractMechanicsFromText) exists for future
// auto-discovery, but curated entries ALWAYS win.
//
// Consumers:
//   miner-score.ts        → rampWeeks override + control-plane infra line
//   classifySubnetHardware → bare-metal cost class (with github-scraper hosting)
//   opportunity-detail.tsx → "Official mechanics" evidence block
//   runbook-view.tsx       → mechanics reference card
//   deploy-stepper.tsx     → container-provider compliance gate
// ---------------------------------------------------------------------------

export interface MechanicsSource {
  label: string;
  url: string;
}

export interface SubnetMechanics {
  netuid: number;
  subnetName: string;
  /** Official repos these mechanics were verified against. */
  sources: MechanicsSource[];
  /**
   * Official reward-metric window in days. When set, the ledger REPLACES the
   * generic bond-EMA ramp heuristic: rampWeeks = rewardWindowDays / 7.
   * Rationale: if the validator weights on a rolling N-day sum of compute, a
   * stable newcomer reaches full weight within that window — not the
   * 3-13 weeks the generic heuristic assumes.
   */
  rewardWindowDays?: number;
  /** Verbatim quote documenting the reward window. */
  rewardWindowQuote?: string;
  /** First-to-serve bounty programs (extra early revenue path). */
  bountyQuote?: string;
  /** Official GPU-variety guidance + the supported catalog. */
  gpuVariety?: {
    quote: string;
    /** Officially supported GPU models (from the subnet's api/gpu registry). */
    catalog: string[];
  };
  /** Validated hardware topologies, when the repo publishes a table. */
  validatedTopologies?: string[];
  /** Miner-side optimization targets — what actually moves rewards. */
  optimizationTargets: string[];
  /** Operational rules (UID policy, control plane, networking). */
  operations: { title: string; detail: string; quote?: string }[];
  /** Extra monthly infra the official setup demands (e.g. control plane). */
  controlPlaneMonthlyUsd?: number;
  /** When this entry was last verified against the repos. */
  curatedAt: string;
}

// ---------------------------------------------------------------------------
// SN64 · Chutes — verified verbatim against chutesai/chutes-miner README
// (534 lines, main), chutesai/sek8s host-tools README, and the supported
// GPU registry in chutesai/chutes-api api/gpu.py. Re-verified 2026-09-16.
// ---------------------------------------------------------------------------

const CHUTES_GPU_CATALOG = [
  "RTX 3090", "RTX 4090", "RTX 5090", "RTX A4000", "RTX 4000 Ada",
  "RTX A5000", "RTX A6000", "RTX 6000 Ada", "RTX Pro 6000", "L4", "A10",
  "A40", "L40", "L40S", "A100 40GB", "A100 SXM", "A100 80GB", "H100",
  "H100 NVL", "H100 SXM", "H800", "H20", "H200", "MI300X", "B200", "B300",
];

const CHUTES_SOURCES: MechanicsSource[] = [
  { label: "chutesai/chutes-miner README", url: "https://github.com/chutesai/chutes-miner" },
  { label: "chutesai/sek8s host-tools", url: "https://github.com/chutesai/sek8s/tree/main/host-tools" },
  { label: "chutesai/chutes-api gpu registry", url: "https://github.com/chutesai/chutes-api/blob/main/api/gpu.py" },
];

const chutesMechanics: SubnetMechanics = {
  netuid: 64,
  subnetName: "Chutes",
  sources: CHUTES_SOURCES,
  rewardWindowDays: 7,
  rewardWindowQuote:
    "Incentives/weights are calculated from 7 day sum of compute, so be patient when you start mining. We want high quality, stable miners in it for the long haul!",
  bountyQuote:
    "Incentives are based on total compute time (including bounties given from being first to provide inference on code app).",
  gpuVariety: {
    quote:
      "You should probably run a wide variety of GPUs, from very cheap (a10, a5000, t4, etc.) to very powerful (8x h100 nodes).",
    catalog: CHUTES_GPU_CATALOG,
  },
  validatedTopologies: [
    "8× H200 (NVSwitch) · Ubuntu 25.10/26.04 · Intel DCAP attestation",
    "8× B200 · Ubuntu 25.10/26.04 · host-side Fabric Manager",
    "8× RTX Pro 6000 · Ubuntu 25.10/26.04 · no NVSwitch",
  ],
  optimizationTargets: [
    "Maximize total compute time — THE reward metric (validator weights on the 7-day sum)",
    "Optimize cold-start times — pre-empted/new apps must spin up fast to win chutes",
    "Tune gepetto.py — chute selection, scaling and bounty claiming is 'the main thing to optimize as a miner'",
    "Run a GPU variety — cheap cards (a10/t4/a5000) through 8x-H100-class nodes earn different chute mixes",
    "Cost efficiency — gepetto weighs hourly server cost when choosing where to deploy chutes",
  ],
  operations: [
    {
      title: "One UID only — scale by adding capacity",
      detail:
        "Registering multiple UIDs splits and competes with your own compute time. Add GPU capacity to the single miner instead.",
      quote:
        "Never register more than one UID, since it will just reduce your total compute time and you'll compete with yourself pointlessly.",
    },
    {
      title: "TEE-exclusive workers (Intel TDX)",
      detail:
        "Every GPU worker runs inside an Intel TDX confidential VM provisioned by sek8s host-tools; add-node rejects non-TEE nodes and the legacy GraVal path is blocked. Attestation service exposes NodePort 30443.",
    },
    {
      title: "Control plane is a separate non-GPU server",
      detail:
        "Miner API, gepetto, postgres, redis, registry proxy and monitoring run on a non-GPU server provisioned by ansible (4c/32GB minimum guidance). Worker nodes are TDX VMs — they have no SSH access.",
    },
    {
      title: "Kubernetes networking is public",
      detail:
        "NodePorts for k8s services are public (30000-32767); attestation 30443 and the miner agent 32000 must be reachable. RAM ≥ VRAM per GPU on workers.",
    },
  ],
  controlPlaneMonthlyUsd: 120,
  curatedAt: "2026-09-16",
};

/** Curated map — extend as more subnets' official mechanics get verified. */
const CURATED_MECHANICS = new Map<number, SubnetMechanics>([[64, chutesMechanics]]);

/** Look up curated official mechanics for a subnet (null = none verified). */
export function getMechanics(netuid: number): SubnetMechanics | null {
  return CURATED_MECHANICS.get(netuid) ?? null;
}

/** All curated entries (for reference UI). */
export function listCuratedMechanics(): SubnetMechanics[] {
  return [...CURATED_MECHANICS.values()];
}

/**
 * True when the mechanics describe a reward window fast enough that the
 * generic bond-EMA ramp heuristic (3-13wk) would MATERIALLY overstate the
 * newcomer ramp (>2x). Used to annotate UI + diagnostics.
 */
export function mechanicsOverridesRamp(m: SubnetMechanics | null): boolean {
  if (!m?.rewardWindowDays) return false;
  const heuristicFloorWeeks = 3; // generic heuristic's minimum
  return m.rewardWindowDays / 7 < heuristicFloorWeeks / 2;
}

// ---------------------------------------------------------------------------
// Keyword extractor — future auto-discovery scaffolding. Deliberately
// conservative: high-precision patterns only, so scraped mechanics never
// poison scoring on a prose coincidence. Curated entries always win.
// ---------------------------------------------------------------------------

export interface ExtractedMechanics {
  rewardWindowDays: number | null;
  bountyProgram: boolean;
  gpuVarietyGuidance: boolean;
  evidence: string[];
}

const WINDOW_PATTERNS: { re: RegExp; days: number }[] = [
  { re: /\b(\d{1,2})[\s-]*day\s+(?:rolling\s+)?(?:sum|total|window)\s+of\s+compute\b/i, days: 0 },
  { re: /\b(?:weights?|incentives?|rewards?)\b[^.\n]{0,80}\b(\d{1,2})[\s-]*day\b/i, days: 0 },
];

export function extractMechanicsFromText(text: string): ExtractedMechanics {
  const evidence: string[] = [];
  let rewardWindowDays: number | null = null;

  for (const { re } of WINDOW_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const d = parseInt(m[1], 10);
      if (d >= 1 && d <= 30) {
        rewardWindowDays = d;
        evidence.push(m[0].trim());
        break;
      }
    }
  }

  const bountyRe = /\bbount(?:y|ies)\b[^.\n]{0,120}/i;
  const bountyMatch = text.match(bountyRe);
  const bountyProgram = Boolean(bountyMatch);
  if (bountyMatch) evidence.push(bountyMatch[0].trim());

  const varietyRe =
    /\b(?:variety|mix|range)\s+of\s+(?:gpus?|hardware|cards?)\b[^.\n]{0,120}/i;
  const varietyMatch = text.match(varietyRe);
  const gpuVarietyGuidance = Boolean(varietyMatch);
  if (varietyMatch) evidence.push(varietyMatch[0].trim());

  return { rewardWindowDays, bountyProgram, gpuVarietyGuidance, evidence };
}
