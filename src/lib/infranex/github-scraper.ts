/**
 * GitHub scraping service — fetches README.md and requirements.txt from
 * a subnet's GitHub repo to extract real descriptions, GPU requirements,
 * and HOSTING CONSTRAINTS (bare metal / TEE / static IP) that the Miner's
 * Ledger and the deploy flow must respect.
 *
 * Uses raw.githubusercontent.com (no API quota). Two-repo strategy:
 *   1. The subnet identity repo (on-chain `identityGithub` / curated).
 *   2. The MINER repo — where mining requirements actually live. Many
 *      identity repos are the product page (e.g. chutesai/chutes) while
 *      the requirements sit in a sibling miner repo (chutesai/chutes-miner).
 *      We discover miner repos via README links, plus a curated override
 *      map for known cases (SN64 Chutes).
 */

import { buildDerivedMechanics, extractMechanicsFromText } from "./mechanics";
import type { SubnetMechanics } from "./mechanics";

export interface HostingRequirements {
  /** Only bare metal / VM hosting works — container clouds rejected. */
  bareMetalOnly: boolean;
  /** Trusted-execution-environment required (TEE / Intel TDX / attestation). */
  teeRequired: boolean;
  /** Unique static IP with 1:1 port mapping required (no shared/NAT). */
  staticIpRequired: boolean;
  /** Quoted evidence lines from the repo README. */
  notes: string[];
}

export interface ScrapedMetadata {
  description: string | null;
  minVramGb: number | null;
  recommendedGpu: string | null;
  /** Number of GPUs, e.g. 8 for "8x H200". */
  gpuCount: number | null;
  /** Raw model+count string as found, e.g. "8x H200". */
  gpuModelRaw: string | null;
  /** Hosting constraints detected in the README(s). Null flags = unknown. */
  hosting: HostingRequirements | null;
  /**
   * MECHANICS-ALL: derived mechanics (provenance "derived") built from the
   * same README text via the conservative extractor in mechanics.ts.
   * Null when nothing mechanic-worthy was detected. Curated entries
   * (mechanics.ts CURATED_MECHANICS) always win at merge time.
   */
  mechanics: SubnetMechanics | null;
  /**
   * INFRA-STACK: service-level infrastructure the subnet's miner stack
   * requires (Kubernetes/k3s, Postgres, Redis, Gepetto, ...), parsed from
   * the same combined README text. Null when no service stack is documented.
   */
  infra: InfraStack | null;
  /** Repo whose README supplied the GPU/hosting requirements. */
  requirementsSource: string | null;
  readmeUrl: string | null;
  requirementsUrl: string | null;
  rawReadmeSnippet: string | null;
  source: "github" | "error";
  error?: string;
}

// Known cases where the on-chain identity repo is the product page, not the
// miner repo — point the requirement scrape at the real miner repo.
// SN64 Chutes: identity = chutesai/chutes (product); requirements live in
// chutesai/chutes-miner ("ALL servers must be bare metal/VM ... Runpod, Vast").
export const CURATED_MINER_REPOS: Record<number, string> = {
  64: "https://github.com/chutesai/chutes-miner",
};

// Additional requirement repos per subnet — hardware/hosting rules that live
// OUTSIDE the miner repo. SN64: the sek8s repo documents the TEE host stack
// ("8× H200: NVSwitch required for the validated stack", validated host
// topologies in host-tools/README.md).
export const CURATED_EXTRA_REPOS: Record<number, string[]> = {
  64: ["https://github.com/chutesai/sek8s"],
};

// Doc paths probed inside each extra repo (in addition to its README).
const EXTRA_DOC_PATHS = ["host-tools/README.md", "docs/e2e.md", "e2e.md"];

interface RepoInfo {
  owner: string;
  repo: string;
  branch: string;
}

function parseGithubUrl(url: string): RepoInfo | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("github.com")) return null;
    let parts = u.pathname.split("/").filter(Boolean);
    // github.com/orgs/X/repositories -> org repo listing
    if (parts[0] === "orgs" && parts.length >= 2) parts = [parts[1], "repositories"];
    // strip /tree/<branch>, /blob/<branch>/... suffixes
    if (parts.length >= 3 && ["tree", "blob"].includes(parts[2])) parts = parts.slice(0, 2);
    if (parts.length === 0) return null;
    if (parts.length === 1 || parts[1] === "repositories") {
      // org-only URL — repo resolved later via the org's repositories page
      return { owner: parts[0], repo: "", branch: "main" };
    }
    return { owner: parts[0], repo: parts[1].replace(/\.git$/i, ""), branch: parts[3] || "main" };
  } catch {
    return null;
  }
}

/**
 * Resolve an org-only identity (identityGithub = "github.com/Org" or
 * "/orgs/Org/repositories") to the org's most likely subnet repos by
 * scraping the repositories page HTML. Ordered: miner/subnet-ish names,
 * then program/mechanism names, then everything else. Callers try each
 * until a README is found (some org repos have no root README).
 */
async function resolveOrgRepos(owner: string): Promise<RepoInfo[]> {
  try {
    const res = await fetch(`https://github.com/orgs/${owner}/repositories?q=&type=all`, {
      headers: { "User-Agent": "infranex-bt/1.0" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const html = await res.text();
    const re = new RegExp(`href="/${owner}/([A-Za-z0-9_.-]+)"`, "gi");
    const found: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const slug = m[1];
      if (!found.includes(slug)) found.push(slug);
    }
    if (!found.length) return [];
    const score = (r: string) =>
      /miner|subnet|sn[-_]?\d+/i.test(r) ? 0 : /incentive|mechanism|program|partner/i.test(r) ? 1 : 2;
    return found
      .sort((a, b) => score(a) - score(b))
      .slice(0, 3)
      .map((repo) => ({ owner, repo, branch: "main" }));
  } catch {
    return [];
  }
}

async function fetchRaw(
  owner: string,
  repo: string,
  branch: string,
  path: string
): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "infranex-bt/1.0" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Try multiple README filenames + branches. HEAD first: it always resolves
// the repo's DEFAULT branch (current docs) — "main" can be a stale branch.
async function fetchReadme(info: RepoInfo): Promise<{ content: string; url: string } | null> {
  const branches = ["HEAD", info.branch, "main", "master"];
  // README variants first, then the doc conventions that agent-era subnets
  // use INSTEAD of a root README: AGENTS.md / CLAUDE.md (repo context docs)
  // and docs/MINING.md / docs/README.md (Bittensor mining-doc convention —
  // e.g. SN120 Affine has no root README but a substantive AGENTS.md;
  // SN97 albedo keeps its mining rules in docs/MINING.md).
  const paths = [
    "README.md",
    "readme.md",
    "README.rst",
    "README.txt",
    "README",
    "Readme.md",
    "AGENTS.md",
    "CLAUDE.md",
    "docs/README.md",
    "docs/MINING.md",
  ];
  for (const branch of branches) {
    for (const path of paths) {
      const content = await fetchRaw(info.owner, info.repo, branch, path);
      if (content) {
        return { content, url: `https://github.com/${info.owner}/${info.repo}/blob/${branch}/${path}` };
      }
    }
  }
  return null;
}

async function fetchRequirements(info: RepoInfo): Promise<{ content: string; url: string } | null> {
  const branches = ["HEAD", info.branch, "main", "master"];
  const paths = [
    "requirements.txt",
    "requirements-min.txt",
    "environment.yml",
    "pyproject.toml",
    "setup.py",
  ];
  for (const branch of branches) {
    for (const path of paths) {
      const content = await fetchRaw(info.owner, info.repo, branch, path);
      if (content) {
        return { content, url: `https://github.com/${info.owner}/${info.repo}/blob/${branch}/${path}` };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// GPU requirement parsing — ordered strongest-first. Multi-GPU counts
// ("8x H200", "4×A100") are captured too: hosting cost scales with count.
// ---------------------------------------------------------------------------

interface GpuMatch {
  model: string;
  count: number;
  raw: string;
}

const GPU_MODEL_PATTERNS: Array<[RegExp, string]> = [
  [/\b(B300)\b/i, "B300"],
  [/\b(B200)\b/i, "B200"],
  [/\b(H200)\b/i, "H200"],
  [/\b(H100)\b/i, "H100"],
  [/\b(RTX\s*Pro\s*6000)\b/i, "RTX Pro 6000"],
  [/\b(RTX\s*6000\s*Ada)\b/i, "RTX 6000 Ada"],
  [/\b(A100)\b/i, "A100"],
  [/\b(L40S)\b/i, "L40S"],
  [/\b(L40)\b/i, "L40"],
  [/\b(A40)\b/i, "A40"],
  [/\b(A6000)\b/i, "RTX A6000"],
  [/\b(A5000)\b/i, "RTX A5000"],
  [/\b(L4)\b/i, "L4"],
  [/\b(A10)\b/i, "A10"],
  [/\b(T4)\b/i, "T4"],
  [/\b(RTX\s*5090)\b/i, "RTX 5090"],
  [/\b(RTX\s*4090)\b/i, "RTX 4090"],
  [/\b(RTX\s*3090)\b/i, "RTX 3090"],
  [/\b(MI300X)\b/i, "MI300X"],
];

function parseGpuRequirement(text: string): GpuMatch | null {
  for (const [pattern, model] of GPU_MODEL_PATTERNS) {
    const m = text.match(pattern);
    if (!m) continue;
    const idx = m.index ?? 0;
    // Window around the match to catch "8x H200" / "4 × H100" / "8 GPUs (H200)".
    const start = Math.max(0, idx - 24);
    const window = text.slice(start, idx + m[0].length + 8);
    // Chars after the model — table-cell counts: "| H200 | 8 | Validated |".
    const after = text.slice(idx + m[0].length, idx + m[0].length + 24);
    let count = 1;
    // Nearest "N×" BEFORE the model wins: "32× H100 + 24× H200" → 24 (the
    // H200 count), not 56 (the mixed-fleet total). Then table cells, then
    // "8 GPUs (...)" prefixes.
    const xAll = [...window.matchAll(/(\d{1,2})\s*[x×]\s*(?:NVIDIA\s*)?/gi)];
    const countM =
      xAll.length > 0
        ? xAll[xAll.length - 1]
        : after.match(/\|\s*(\d{1,2})\s*\|/) ??
          window.match(/^(\d{1,2})\s*(?:GPUs?|gpu workers?)/i);
    if (countM) {
      const n = parseInt(countM[1], 10);
      if (n >= 2 && n <= 64) count = n;
    }
    return {
      model,
      count,
      raw: count > 1 ? `${count}x ${model}` : model,
    };
  }
  return null;
}

/**
 * GPU requirement across a WHOLE document, strongest evidence first:
 *   1. a line declaring validated/required hardware ("| H200 | 8 | Validated |")
 *   2. a count-qualified mention ("8x H200")
 *   3. a bare model mention (feature lists — weakest)
 * Incentive prose ("run a wide VARIETY of GPUs ... to very powerful (8x h100)")
 * is excluded — it describes the reward spread, not a hosting requirement.
 */
const GPU_LINE_EXCLUDE = /variety|from .* to |cheap|etc\.|such as|e\.g\.|can be found/i;
const GPU_STRONG_CONTEXT = /validated|required|minimum spec|officially supported/i;

function parseGpuRequirementSmart(text: string): GpuMatch | null {
  let firstCounted: GpuMatch | null = null;
  let firstBare: GpuMatch | null = null;
  for (const line of text.split("\n")) {
    if (GPU_LINE_EXCLUDE.test(line)) continue;
    const m = parseGpuRequirement(line);
    if (!m) continue;
    if (GPU_STRONG_CONTEXT.test(line)) return m;
    if (m.count > 1 && !firstCounted) firstCounted = m;
    if (!firstBare) firstBare = m;
  }
  return firstCounted ?? firstBare;
}

// ---------------------------------------------------------------------------
// Hosting-constraint parsing — the rules that decide WHERE a miner may run.
// Evidence lines are quoted so the UI can show WHY.
// ---------------------------------------------------------------------------

const HOSTING_PATTERNS: Array<[keyof Omit<HostingRequirements, "notes">, RegExp]> = [
  ["bareMetalOnly", /bare[ -]?metal(\/VM| or VM| and VM)?/i],
  ["bareMetalOnly", /will not work on\s+(runpod|vast)/i],
  ["bareMetalOnly", /not (?:supported|supported on|work(?:ing)?) on\s+(?:runpod|vast|container)/i],
  ["bareMetalOnly", /containers? (?:are )?not supported/i],
  ["teeRequired", /\bTEE\b/],
  ["teeRequired", /\bTDX\b/],
  ["teeRequired", /confidential (?:VM|computing|compute)/i],
  ["teeRequired", /attestation (?:service|required|is required)/i],
  ["staticIpRequired", /static IPs?/i],
  ["staticIpRequired", /1:1 port mapping/i],
  ["staticIpRequired", /shared or dynamic IPs?/i],
];

/**
 * Hosting-constraint parsing — the rules that decide WHERE a miner may run.
 * Evidence lines are quoted so the UI can show WHY.
 *
 * Guards (audit of all 129 subnets, 2026-09):
 *  - Roadmap sections ("Future Roadmap", "planned") are NOT current
 *    requirements — SN4 Targon lists "bare metal access" as roadmap.
 *  - Negated mentions ("No Nitro enclave or KMS" — SN71) never set flags.
 *  - Validator-only lines ("Validators run inside Phala Cloud" — SN38) do
 *    not constrain the MINER's hosting.
 *  - TEE/static-IP mentions must read as requirements ("must", "runs
 *    inside", "deploy") or sit under a requirements-style heading — a bare
 *    feature-list mention ("TEE Attestation Verification") is not a rule.
 */
const SECTION_HEADING_OK =
  /current implementation|requirement|hardware|deployment|deploy|setup|installation|hosting|infrastructure/;
const LINE_REQUIREMENTISH =
  /(must(?: be| run)?|required to|runs?\s+(?:inside|in|on|within|as)|\b(?:inside|within)\b|deploy|provision|exclusiv|mandatory|enforc|gated?\b|launch(?:es|ed)?|hardware|bare[ -]?metal)/i;
const NEGATION_BEFORE =
  /\b(no|not|without|skip|avoid|neither|nor|don'?t|doesn'?t|can'?t|cannot|never)\s+(?:longer\s+|be\s+)?$/i;
const ROADMAP_HEADING = /roadmap|future|planned|coming soon|not yet|backlog|vision|design/;

function parseHosting(text: string): HostingRequirements | null {
  const lines = text.split("\n");
  const notes = new Set<string>();
  const flags = { bareMetalOnly: false, teeRequired: false, staticIpRequired: false };
  let any = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Nearest markdown heading above (≤30 lines) — section context.
    let heading = "";
    for (let h = i - 1; h >= Math.max(0, i - 30); h--) {
      const t = lines[h].trim();
      if (/^#{1,6} /.test(t)) {
        heading = t.toLowerCase();
        break;
      }
    }
    if (ROADMAP_HEADING.test(heading)) continue; // roadmap ≠ current rule
    for (const [flag, pattern] of HOSTING_PATTERNS) {
      if (flags[flag]) continue;
      const m = line.match(pattern);
      if (!m) continue;
      const idx = m.index ?? 0;
      // Negation guard: "No Nitro enclave or KMS", "without TEE".
      if (NEGATION_BEFORE.test(line.slice(Math.max(0, idx - 48), idx))) continue;
      // Validator-only lines describe the VALIDATOR's hosting, not the miner's.
      if (/\bvalidators?\b/i.test(line) && !/\bminers?\b/i.test(line)) continue;
      // TEE / static-IP need requirement semantics; bare-metal patterns are
      // already requirement-phrased ("must be", "will not work on").
      if (flag !== "bareMetalOnly") {
        const requirementish =
          LINE_REQUIREMENTISH.test(line) || SECTION_HEADING_OK.test(heading);
        if (!requirementish) continue;
      }
      flags[flag] = true;
      any = true;
      // Quote the line containing the evidence (trimmed).
      const cleaned = line
        .trim()
        .replace(/[#*`>]/g, "")
        .slice(0, 220);
      if (cleaned) notes.add(cleaned);
      // NO break — one line can evidence several constraints
      // (e.g. Chutes: "ALL servers must be bare metal/VM ... the IPs must
      // be unique, static, and provide a 1:1 port mapping" sets BOTH
      // bareMetalOnly and staticIpRequired on the same line).
    }
  }
  if (!any) return null;
  return { ...flags, notes: [...notes].slice(0, 5) };
}

// --- INFRA-STACK: service-level infrastructure the subnet's miner stack ----
// requires, parsed from the same README text as hosting/mechanics.
// Chutes-class subnets document a full stack (Kubernetes/k3s, Postgres,
// Redis, Gepetto, ansible playbooks) — a plain "pip install + run miner"
// plan is NOT sufficient for them, so the detection must be structured
// (services + orchestration + sizing rules), not just prose.

export interface InfraService {
  /** Canonical service key: kubernetes | postgres | redis | gepetto | ansible | ... */
  name: string;
  /** What the README says the service does in this subnet's stack. */
  role: string | null;
  /** Verbatim evidence line from the README. */
  quote: string;
}

export interface InfraStack {
  services: InfraService[];
  /** kubernetes | docker-compose | ansible | null — how the stack is deployed. */
  orchestration: string | null;
  /** "RAM per GPU ≥ VRAM" class sizing rule, when documented. */
  ramRule: { quote: string } | null;
  /** Documented firewall/port rules ("allow the kubernetes ephemeral port range…"). */
  networkRule?: { quote: string } | null;
  /** Documented storage prep ("bind-mount storage under /var/snap" class). */
  storageRule?: { quote: string } | null;
  /** Bare-metal / static-IP / "will not work on Runpod/Vast" hosting constraints. */
  hostClass?: { quote: string } | null;
}

// service key → detection regex. Conservative: name must appear as a word.
const INFRA_SERVICES: Array<[string, RegExp, RegExp]> = [
  // key, detector, role-extractor (first capture = purpose clause)
  ["kubernetes", /\bk(ubernetes|8s|3s)\b/i, /(?:run(?:ning)?|provision(?:ed)?|deploy(?:ed)?|orchestrat\w*)\s+(?:with|within|by|via|using)?\s*(?:the\s*)?(?:entirety of the\s*)?(k(ubernetes|8s|3s)\b[^\n.]{0,140})/i],
  ["postgres", /\bpostgres(ql|)\b/i, /(?:tracked in|deployed with|uses?|making? use of|requires?)\s+(?:\w+[^\n.]{0,40})?(postgres(?:ql|)\b[^\n.]{0,140})/i],
  ["redis", /\bredis\b/i, /((?:redis\b[^\n.]{0,160}?)(?:used for|triggers?|pubsub)[^\n.]{0,160})/i],
  ["gepetto", /\bgepetto\b/i, /(gepetto\b[^\n.]{0,160})/i],
  // Chutes-class TEE stacks: worker nodes verified via hardware attestation
  // (Intel TDX confidential VMs) instead of software GPU challenges.
  ["tee-attestation", /\b(intel\s+tdx|tee[- ]?(?:worker|node|vm)|hardware\s+attestation|attestation\s+service)\b/i, /((?:intel\s+tdx|tee[- ]?(?:worker|node|vm)|hardware\s+attestation|attestation\s+service)\b[^\n.]{0,160})/i],
  ["rabbitmq", /\brabbitmq\b/i, /(rabbitmq\b[^\n.]{0,140})/i],
  ["nats", /\bnats\b/i, /(nats\b[^\n.]{0,140})/i],
  ["mongodb", /\bmongodb\b/i, /(mongodb\b[^\n.]{0,140})/i],
  ["ipfs", /\bipfs\b/i, /(ipfs\b[^\n.]{0,140})/i],
];

export function parseInfraStack(text: string): InfraStack | null {
  const lines = text.split("\n");
  const services: InfraService[] = [];
  const seen = new Set<string>();

  for (const [key, detect, roleRe] of INFRA_SERVICES) {
    if (seen.has(key)) continue;
    let hit: { line: string; role: string | null } | null = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!detect.test(line)) continue;
      // Skip roadmap/speculative sections and validator-only lines.
      let heading = "";
      for (let h = i - 1; h >= Math.max(0, i - 30); h--) {
        const t = lines[h].trim();
        if (/^#{1,6} /.test(t)) { heading = t.toLowerCase(); break; }
      }
      if (ROADMAP_HEADING.test(heading)) continue;
      if (/\bvalidators?\b/i.test(line) && !/\bminers?\b|\bcluster\b|\bstack\b/i.test(line)) continue;
      const roleM = line.match(roleRe);
      hit = { line, role: roleM ? roleM[1].trim().slice(0, 180) : null };
      // Prefer lines with purpose/requirement phrasing over a bare mention.
      if (roleM || /must|requires?|deployed|provisioned|uses?|run(?:s|ning)?\s+within/i.test(line)) break;
    }
    if (hit) {
      seen.add(key);
      services.push({
        name: key,
        role: hit.role,
        quote: hit.line.trim().replace(/[#*`>]/g, "").slice(0, 220),
      });
    }
  }

  // Orchestration style — what the miner's stack actually runs on.
  let orchestration: InfraStack["orchestration"] = null;
  const joined = text.toLowerCase();
  if (/\bk3s\b|\bkubernetes\b|\bk8s\b/.test(joined)) orchestration = "kubernetes";
  else if (/docker[ -]compose/.test(joined)) orchestration = "docker-compose";
  else if (/\bansible\b/.test(joined)) orchestration = "ansible";

  // RAM sizing rule — the "RAM per GPU ≥ VRAM" family (Chutes-class). Require
  // both tokens AND per-GPU linkage in one line: generic spec lines ("32 GB
  // RAM, GPU with 8 GB VRAM") are hardware guidance, not sizing RULES.
  let ramRule: InfraStack["ramRule"] = null;
  for (const line of lines) {
    if (
      /\bram\b/i.test(line) &&
      /\bvram\b/i.test(line) &&
      (/per\s+gpu/i.test(line) || /as much ram/i.test(line))
    ) {
      ramRule = { quote: line.trim().replace(/[#*`>]/g, "").slice(0, 220) };
      break;
    }
  }

  // Networking rule — documented firewall/port obligations ("allow the
  // kubernetes ephemeral port range…", NodePort access, firewall disable).
  // ToC anchor lines ("[Important Networking Note](#…)") don't count. Lines
  // with direct allow/firewall phrasing beat bare NodePort mentions.
  let networkRule: InfraStack["networkRule"] = null;
  const netHit = (t: string) =>
    /firewall|port range|nodeport|port mapping|static ip/i.test(t) &&
    /allow|open|expose|disable|must|need|require|unique|1:1/i.test(t);
  const netPreferred = (t: string) => /firewall|port range|allow the/i.test(t);
  let netFallback: string | null = null;
  for (const line of lines) {
    const t = line.trim();
    if (/^\s*\[/.test(t) || /\]\(#/.test(t)) continue;
    if (!netHit(t)) continue;
    // AUDIT-FIX (mechanics negative control) — a hardware spec line that
    // merely mentions "a static IP" among VRAM/GPU requirements ("Requires
    // 24GB VRAM GPU and a static IP") is NOT a documented networking rule.
    // Only count such lines when they carry real firewall/port-range phrasing.
    if (!netPreferred(t) && /\b(?:vram|gpu)\b/i.test(t)) continue;
    if (netPreferred(t)) {
      networkRule = { quote: t.replace(/[#*`>]/g, "").slice(0, 220) };
      break;
    }
    netFallback ??= t.replace(/[#*`>]/g, "").slice(0, 220);
  }
  networkRule ??= netFallback ? { quote: netFallback } : null;

  // Storage rule — documented storage prep ("be sure as much as possible is
  // allocated under /var/snap", bind-mount / fstab instructions).
  let storageRule: InfraStack["storageRule"] = null;
  for (const line of lines) {
    const t = line.trim();
    if (/^\s*\[/.test(t) || /\]\(#/.test(t)) continue;
    if (
      /\b(var\/snap|\/etc\/fstab|bind mount)\b/i.test(t) ||
      (/\bstorage\b/i.test(t) && /\bmount|allocat/i.test(t) && /check|be sure|want|should|must/i.test(t))
    ) {
      storageRule = { quote: t.replace(/[#*`>]/g, "").slice(0, 220) };
      break;
    }
  }

  // Host-class constraints — bare-metal-only / no serverless-rental / static
  // 1:1 IPs ("will not work on Runpod, Vast, etc.").
  let hostClass: InfraStack["hostClass"] = null;
  for (const line of lines) {
    const t = line.trim();
    if (/^\s*\[/.test(t) || /\]\(#/.test(t)) continue;
    if (
      /\b(bare[ -]?metal|will not work on (runpod|vast|hyperstack|lambda)|no shared or dynamic ip|unique, static)\b/i.test(t)
    ) {
      hostClass = { quote: t.replace(/[#*`>]/g, "").slice(0, 220) };
      break;
    }
  }

  if (!services.length && !ramRule && !networkRule && !storageRule && !hostClass) return null;
  return { services, orchestration, ramRule, networkRule, storageRule, hostClass };
}

// Parse VRAM requirements from text (README or requirements)
function parseVram(text: string): number | null {
  // Look for patterns like "80GB VRAM", "80 GB", "VRAM: 80GB", "min 80GB"
  const patterns = [
    /(\d{2,3})\s*gb\s*vram/i,
    /vram[:\s]*(\d{2,3})\s*gb/i,
    /min(?:imum)?\s*(?:vram|gpu|memory)?[:\s]*(\d{2,3})\s*gb/i,
    /(\d{2,3})\s*gb\s*(?:required|minimum|recommended)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const v = parseInt(m[1], 10);
      if (v >= 4 && v <= 200) return v;
    }
  }
  return null;
}

// Parse description from README (first paragraph after the title)
function parseDescription(readme: string): string | null {
  const lines = readme.split("\n");
  let foundTitle = false;
  const descLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) {
      foundTitle = true;
      continue;
    }
    if (foundTitle && trimmed && !trimmed.startsWith("!") && !trimmed.startsWith("[") && !trimmed.startsWith("<")) {
      // Skip broken inline-link lines (e.g. Albedo's MINING.md literally
      // contains "in iner/](../miner/).") — the next prose line describes
      // the subnet better than a dangling markdown fragment.
      if (/\]\(/.test(trimmed)) continue;
      descLines.push(trimmed);
      if (descLines.length >= 3) break;
    }
  }
  if (descLines.length === 0) return null;
  const joined = descLines.join(" ").replace(/[#*`]/g, "").trim();
  // Prefer complete sentence(s): list intros ("As a miner you:") and bullet
  // markers ("1.") would otherwise run into their lists and produce a run-on.
  // Split on period+whitespace so version strings (Qwen3.6-35B) survive.
  const parts = joined
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .map((s) => s.replace(/\s+\d+[.)]\s*$/, "").replace(/[:;,]\s*$/, ""))
    .filter((s) => s.length > 0 && !/^\d+[.)]/.test(s));
  const desc = (parts[0] && parts[0].length < 60 && parts[1] ? `${parts[0]} ${parts[1]}` : parts[0] ?? joined).trim();
  return desc.length > 10 && desc.length < 300 ? desc : null;
}

/**
 * Discover a sibling MINER repo from the identity README — many subnets
 * register the product repo on-chain while the mining requirements live
 * in a *-miner / *-validator repo. Only follows same-owner links whose
 * slug mentions miner/validator, so we never wander off.
 */
function discoverMinerRepoUrl(readme: string, identity: RepoInfo): string | null {
  const seen = new Set<string>();
  const re = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(readme)) !== null) {
    const [full, owner, repoRaw] = m;
    const repo = repoRaw.replace(/\.git$/i, "").replace(/[).,]+$/, "");
    const key = `${owner}/${repo}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (owner.toLowerCase() !== identity.owner.toLowerCase()) continue;
    if (`${owner}/${repo}`.toLowerCase() === `${identity.owner}/${identity.repo}`.toLowerCase()) continue;
    if (/miner|validator/i.test(repo)) return `https://github.com/${owner}/${repo}`;
  }
  return null;
}

interface RepoScrape {
  readme: string | null;
  readmeUrl: string | null;
  requirements: string | null;
  requirementsUrl: string | null;
}

async function scrapeRepo(info: RepoInfo): Promise<RepoScrape> {
  const [readmeResult, reqResult] = await Promise.all([
    fetchReadme(info),
    fetchRequirements(info),
  ]);
  return {
    readme: readmeResult?.content ?? null,
    readmeUrl: readmeResult?.url ?? null,
    requirements: reqResult?.content ?? null,
    requirementsUrl: reqResult?.url ?? null,
  };
}

/**
 * GPU parsing for IDENTITY READMEs only — every candidate line must carry
 * requirement semantics (require/minimum/supported/validated/hardware/node),
 * so a passing mention of an H100 in a blog-style paragraph never becomes a
 * fake GPU requirement. Strict context wins over loose; lines about OTHER
 * subnets ("helped Chutes onboard B200/B300 nodes") are excluded so a
 * subnet's own fleet is described, not its neighbours'.
 */
const GPU_STRICT_CONTEXT =
  /(require|minimum|supported|validated|must|need|provision|fleet|runs? on|topolog)/i;
const GPU_LOOSE_CONTEXT =
  /(require|minimum|supported|validated|must|need|provision|hardware|cluster|node|topolog|fleet|gpu)/i;
const OTHER_SUBNET_MENTION =
  /\b(subnet\s?\d{1,3}|chutes|targon|lium|gradients|compute.?horde)\b/i;

function parseGpuWithContext(readme: string): GpuMatch | null {
  for (const strict of [true, false]) {
    const ctx = strict ? GPU_STRICT_CONTEXT : GPU_LOOSE_CONTEXT;
    for (const line of readme.split("\n")) {
      if (!ctx.test(line)) continue;
      if (OTHER_SUBNET_MENTION.test(line)) continue;
      const m = parseGpuRequirement(line);
      if (m) return m;
    }
  }
  return null;
}

export async function scrapeGithubMetadata(
  githubUrl: string,
  opts?: { netuid?: number; subnetName?: string | null }
): Promise<ScrapedMetadata> {
  const NO_MECHANICS: ScrapedMetadata = { description: null, minVramGb: null, recommendedGpu: null, gpuCount: null, gpuModelRaw: null, hosting: null, mechanics: null, infra: null, requirementsSource: null, readmeUrl: null, requirementsUrl: null, rawReadmeSnippet: null, source: "error" };
  try {
    let info = parseGithubUrl(githubUrl);
    if (!info) {
      return { ...NO_MECHANICS, error: "Invalid GitHub URL" };
    }
    // Org-only identity ("github.com/Org") — resolve to the org's most
    // likely subnet/miner repo via the repositories page; try candidates
    // in order until one has a README.
    let identityRepos: RepoScrape;
    if (!info.repo) {
      const candidates = await resolveOrgRepos(info.owner);
      let resolvedInfo: RepoInfo | null = null;
      let identityScrape: RepoScrape | null = null;
      for (const cand of candidates) {
        const sc = await scrapeRepo(cand);
        if (sc.readme) {
          resolvedInfo = cand;
          identityScrape = sc;
          break;
        }
        if (!identityScrape) {
          resolvedInfo = cand;
          identityScrape = sc;
        }
      }
      if (!resolvedInfo || !identityScrape) {
        return { ...NO_MECHANICS, error: `No repo resolvable for org ${info.owner}` };
      }
      info = resolvedInfo;
      identityRepos = identityScrape;
    } else {
      identityRepos = await scrapeRepo(info);
    }

    const identity = identityRepos;

    // --- Second repo: the miner repo (curated override > README discovery) --
    let minerUrl = opts?.netuid != null ? CURATED_MINER_REPOS[opts.netuid] ?? null : null;
    if (!minerUrl && identity.readme) {
      minerUrl = discoverMinerRepoUrl(identity.readme, info);
    }
    let miner: RepoScrape | null = null;
    let minerRepoInfo: RepoInfo | null = null;
    if (minerUrl) {
      const mi = parseGithubUrl(minerUrl);
      if (mi) {
        minerRepoInfo = mi;
        miner = await scrapeRepo(mi);
      }
    }

    // --- Extra curated requirement repos (sek8s-style host docs) ----------
    const extraTexts: string[] = [];
    const extraUrls = opts?.netuid != null ? CURATED_EXTRA_REPOS[opts.netuid] ?? [] : [];
    for (const extraUrl of extraUrls) {
      const ei = parseGithubUrl(extraUrl);
      if (!ei) continue;
      const er = await fetchReadme(ei);
      if (er) extraTexts.push(er.content);
      for (const docPath of EXTRA_DOC_PATHS) {
        const [do_, dp] = [ei.owner, ei.repo];
        const branchDoc = await fetchRaw(do_, dp, "HEAD", docPath);
        if (branchDoc) extraTexts.push(branchDoc);
      }
    }

    if (!identity.readme && !miner?.readme) {
      return { ...NO_MECHANICS, error: "No README or requirements found" };
    }

    // Mining requirements prefer the MINER repo text (that's where operators
    // document hardware + hosting rules); description prefers the identity repo.
    // The IDENTITY README is the last-resort hosting source: many subnets
    // document TEE/hosting rules only there (SN90 KubeTEE, SN4 Targon,
    // SN28 SayGM, SN51 lium, SN58 greevils) — but GPU models are parsed
    // from it only with requirement-context, to avoid feature-prose
    // false positives (the SN64 class of bug).
    const hostingTexts = [
      miner?.readme,
      ...extraTexts,
      miner?.requirements,
      identity.requirements,
      identity.readme,
    ].filter(Boolean) as string[];
    const hostingCombined = hostingTexts.join("\n\n") || null;
    const reqTexts = [
      miner?.readme,
      ...extraTexts,
      miner?.requirements,
      identity.requirements,
    ].filter(Boolean) as string[];
    const reqCombined = reqTexts.join("\n\n") || null;

    const gpu = reqCombined ? parseGpuRequirementSmart(reqCombined) : null;
    // Identity-README GPU fallback — only lines with requirement context.
    const gpuFromIdentity = !gpu && identity.readme ? parseGpuWithContext(identity.readme) : null;
    const gpuFinal = gpu ?? gpuFromIdentity;
    const hosting = hostingCombined ? parseHosting(hostingCombined) : null;
    const vram = reqCombined ? parseVram(reqCombined) : null;

    // MECHANICS-ALL: derive mechanics from the same combined README text the
    // hosting/GPU parsers read. Sparse by design — null when nothing hit.
    const extractedMechanics = hostingCombined
      ? extractMechanicsFromText(hostingCombined)
      : null;
    const mechanics = extractedMechanics
      ? buildDerivedMechanics({
          netuid: opts?.netuid ?? null,
          subnetName: opts?.subnetName ?? null,
          sourceUrl: miner?.readme && minerRepoInfo
            ? `https://github.com/${minerRepoInfo.owner}/${minerRepoInfo.repo}`
            : `https://github.com/${info.owner}/${info.repo}`,
          extracted: extractedMechanics,
          hosting,
        })
      : null;

    // INFRA-STACK: service components from the same combined text.
    const infra = hostingCombined ? parseInfraStack(hostingCombined) : null;

    const requirementsSource = miner?.readme && minerRepoInfo
      ? `https://github.com/${minerRepoInfo.owner}/${minerRepoInfo.repo}`
      : `https://github.com/${info.owner}/${info.repo}`;

    return {
      description: identity.readme ? parseDescription(identity.readme) : null,
      minVramGb: vram,
      recommendedGpu: gpuFinal ? gpuFinal.raw : null,
      gpuCount: gpuFinal ? gpuFinal.count : null,
      gpuModelRaw: gpuFinal ? gpuFinal.raw : null,
      hosting,
      mechanics,
      infra,
      requirementsSource: gpuFinal || hosting ? requirementsSource : null,
      readmeUrl: identity.readmeUrl,
      requirementsUrl: miner?.requirementsUrl ?? identity.requirementsUrl,
      rawReadmeSnippet: identity.readme?.slice(0, 500) ?? null,
      source: "github",
    };
  } catch (e) {
    return { ...NO_MECHANICS, error: e instanceof Error ? e.message : String(e) };
  }
}
