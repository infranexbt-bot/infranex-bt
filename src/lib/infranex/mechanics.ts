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
// This layer has TWO provenance tiers:
//
//   1. CURATED — hand-verified against the official repos, with verbatim
//      quotes (SN64 Chutes). Human-checked, richest content.
//   2. DERIVED — auto-extracted from the scraped README text by the
//      conservative keyword extractor at sync time and stored in
//      SubnetOverride.mechanicsJson. High-precision patterns only; entries
//      are sparse by design and UI labels them as NOT human-verified.
//
// Curated entries ALWAYS win over derived ones for the same subnet.
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
  /**
   * Where this entry came from. "curated" = hand-verified (default when
   * absent, for backward compatibility with stored JSON); "derived" =
   * auto-extracted from the scraped README by the conservative extractor.
   */
  provenance?: "curated" | "derived";
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
  provenance: "curated",
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
// Keyword extractor — now WIRED into the sync pipeline (github-scraper.ts →
// SubnetOverride.mechanicsJson), not just scaffolding. Deliberately
// conservative: high-precision patterns only, so scraped mechanics never
// poison scoring on a prose coincidence. Curated entries always win.
// ---------------------------------------------------------------------------

export interface ExtractedMechanics {
  rewardWindowDays: number | null;
  bountyProgram: boolean;
  gpuVarietyGuidance: boolean;
  /** "Never register more than one UID"-style single-UID policy detected. */
  oneUidRule: boolean;
  /** Verbatim evidence lines for every detected mechanic. */
  evidence: string[];
}

const WINDOW_PATTERNS: RegExp[] = [
  // "7 day sum of compute", "7-day rolling total of inference"
  /\b(\d{1,2})[\s-]*day\s+(?:rolling\s+)?(?:sum|total|window)\s+of\s+(?:compute|inference|work)\b/i,
  // "weights/incentives/rewards … 7 day(s) …" within one sentence fragment
  /\b(?:weights?|incentives?|rewards?|scores?)\b[^.\n]{0,80}\b(\d{1,2})[\s-]*days?\b/i,
  // "7-day window", "7 day rolling window", "7-day reward window"
  /\b(\d{1,2})[\s-]*days?\s+(?:rolling\s+|reward\s+|scoring\s+|evaluation\s+)?window\b/i,
  // "window of 10 days", "over a 14 day lookback"
  /\bwindow\s+of\s+(\d{1,2})[\s-]*days?\b/i,
  /\b(?:over|past|last)\s+(?:a\s+)?(\d{1,2})[\s-]*days?\s+(?:lookback|window)\b/i,
];

/** Single-UID policy — the SN64-style "never register more than one UID". */
const ONE_UID_PATTERNS: RegExp[] = [
  /\b(?:never|don'?t|do not)\s+register\s+(?:more\s+than\s+(?:one|2|two|multiple)|a\s+second|multiple)\s+UIDs?\b[^.\n]{0,160}/i,
  /\b(?:one|single|exactly\s+one)\s+UID\s+(?:only|per\s+(?:miner|account|hotkey|wallet))\b[^.\n]{0,120}/i,
];

/**
 * Window-sentence filters — a fixed reward window only OVERRIDES the ramp
 * when the sentence describes HOW WEIGHTS/SCORES ARE COMPUTED. Two gates:
 *
 *   POSITIVE — a computation term (computed/calculated/weights/sum/window…)
 *   NEGATIVE — decay-family phrasing (EMA/half-life — the generic bond-EMA
 *              heuristic already models that class) and payout-cadence
 *              phrasing (installments/persistence/vesting — release timing,
 *              not weight buildup). Detected → match discarded.
 */
const WINDOW_POSITIVE =
  /\b(?:comput|calculat|measur|weight|scored|scoring|evaluat|incentiv|lookback|rolling|sum|total|window|period)\b/i;
const WINDOW_NEGATIVE =
  /\b(?:moving\s+average|half.?life|\bema\b|exponential(?:ly)?\s+(?:weighted|decaying)|ewma|installment|persistence|vest(?:ing|ed|s)?|payout|releases?|withdraw)/i;

function firstMatch(text: string, patterns: RegExp[]): RegExpMatchArray | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m;
  }
  return null;
}

/**
 * Extend a regex match to its full sentence (no periods/newlines crossed,
 * capped) so evidence quotes read as complete sentences in the UI instead
 * of fragments ending mid-clause.
 */
function extendToSentence(text: string, m: RegExpMatchArray): string {
  const start = m.index ?? 0;
  const rest = text.slice(start);
  const end = rest.search(/[.\n]/);
  const sentence = end === -1 ? rest : rest.slice(0, end);
  return sentence.trim().slice(0, 220);
}

export function extractMechanicsFromText(text: string): ExtractedMechanics {
  const evidence: string[] = [];
  let rewardWindowDays: number | null = null;

  const windowMatch = firstMatch(text, WINDOW_PATTERNS);
  if (windowMatch) {
    const d = parseInt(windowMatch[1], 10);
    const sentence = extendToSentence(text, windowMatch);
    // Keep only sentences that describe weight COMPUTATION, and drop
    // EMA-decay / payout-cadence phrasings — overriding the ramp with
    // those would overstate newcomer speed or misread payout timing.
    if (
      d >= 1 &&
      d <= 30 &&
      WINDOW_POSITIVE.test(sentence) &&
      !WINDOW_NEGATIVE.test(sentence)
    ) {
      rewardWindowDays = d;
      evidence.push(sentence);
    }
  }

  const bountyMatch = text.match(/\bbount(?:y|ies)\b[^.\n]{0,120}/i);
  const bountyProgram = Boolean(bountyMatch);
  if (bountyMatch) evidence.push(extendToSentence(text, bountyMatch));

  const varietyMatch = text.match(
    /\b(?:variety|mix|range)\s+of\s+(?:gpus?|hardware|cards?)\b[^.\n]{0,120}/i
  );
  const gpuVarietyGuidance = Boolean(varietyMatch);
  if (varietyMatch) evidence.push(extendToSentence(text, varietyMatch));

  const oneUidMatch = firstMatch(text, ONE_UID_PATTERNS);
  const oneUidRule = Boolean(oneUidMatch);
  if (oneUidMatch) evidence.push(extendToSentence(text, oneUidMatch));

  return { rewardWindowDays, bountyProgram, gpuVarietyGuidance, oneUidRule, evidence };
}

// ---------------------------------------------------------------------------
// Derived-mechanics builder — turns extractor output + scraped hosting flags
// into a sparse SubnetMechanics with provenance "derived". Returns null when
// NOTHING was detected: an all-empty block would be noise for ~100 subnets.
// ---------------------------------------------------------------------------

/** Shape of the hosting flags the scraper produces (avoids an import cycle). */
interface DerivedHostingFlags {
  bareMetalOnly: boolean;
  teeRequired: boolean;
  staticIpRequired: boolean;
  notes: string[];
}

export interface DerivedMechanicsInput {
  netuid: number | null;
  subnetName: string | null;
  /** Repo URL the README text came from (requirementsSource when set). */
  sourceUrl: string | null;
  extracted: ExtractedMechanics;
  hosting?: DerivedHostingFlags | null;
}

export function buildDerivedMechanics(
  input: DerivedMechanicsInput
): SubnetMechanics | null {
  const { extracted, hosting } = input;
  const hasAnything =
    extracted.rewardWindowDays != null ||
    extracted.bountyProgram ||
    extracted.gpuVarietyGuidance ||
    extracted.oneUidRule ||
    Boolean(hosting &&
      (hosting.bareMetalOnly || hosting.teeRequired || hosting.staticIpRequired));
  if (!hasAnything) return null;

  const sourceUrl =
    input.sourceUrl ??
    (input.netuid != null ? `https://github.com/subnets?netuid=${input.netuid}` : null);

  const operations: SubnetMechanics["operations"] = [];
  if (extracted.oneUidRule) {
    operations.push({
      title: "One UID policy (auto-detected)",
      detail:
        "The README warns against registering multiple UIDs — extra UIDs split your own reward metric instead of adding capacity.",
      quote: extracted.evidence.find((e) => /UID/i.test(e)),
    });
  }
  const hostingNote = (n: string | undefined) =>
    n ? n.slice(0, 220) : undefined;
  if (hosting?.bareMetalOnly) {
    operations.push({
      title: "Bare-metal / VM hosting required (auto-detected)",
      detail:
        "Hosting flags scraped from the repo reject container clouds — only bare-metal or VM rentals are compliant. Pricing already uses the dedicated-market rate.",
      quote: hostingNote(hosting.notes[0]),
    });
  }
  if (hosting?.teeRequired) {
    operations.push({
      title: "TEE / attestation hosting required (auto-detected)",
      detail:
        "The repo documents trusted-execution or attestation requirements — hosts must support the documented TEE class.",
      quote: hostingNote(hosting.notes.find((n) => /tee|attest|tdx|sgx|nitro/i.test(n)) ?? hosting.notes[0]),
    });
  }
  if (hosting?.staticIpRequired) {
    operations.push({
      title: "Static IP / 1:1 port mapping required (auto-detected)",
      detail:
        "Shared or NATed IPs are rejected — the host needs a unique static IP with direct port reachability.",
      quote: hostingNote(hosting.notes.find((n) => /ip|port|nat/i.test(n)) ?? hosting.notes[0]),
    });
  }

  const mechanics: SubnetMechanics = {
    provenance: "derived",
    netuid: input.netuid ?? -1,
    subnetName: input.subnetName ?? (input.netuid != null ? `Subnet ${input.netuid}` : "Unknown subnet"),
    sources: sourceUrl
      ? [{ label: "GitHub README (auto-scraped)", url: sourceUrl }]
      : [],
    optimizationTargets: [],
    operations,
    curatedAt: new Date().toISOString().slice(0, 10),
  };

  if (extracted.rewardWindowDays != null) {
    mechanics.rewardWindowDays = extracted.rewardWindowDays;
    mechanics.rewardWindowQuote = extracted.evidence.find((e) =>
      new RegExp(`${extracted.rewardWindowDays}[\\s-]*day`, "i").test(e)
    );
  }
  if (extracted.bountyProgram) {
    mechanics.bountyQuote = extracted.evidence.find((e) => /bount/i.test(e));
  }
  if (extracted.gpuVarietyGuidance) {
    mechanics.gpuVariety = {
      quote:
        extracted.evidence.find((e) => /variety|mix|range/i.test(e)) ??
        "variety of GPUs advised",
      catalog: [],
    };
  }

  return mechanics;
}
