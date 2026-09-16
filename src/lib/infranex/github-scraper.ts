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

interface RepoInfo {
  owner: string;
  repo: string;
  branch: string;
}

function parseGithubUrl(url: string): RepoInfo | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("github.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1], branch: parts[3] || "main" };
  } catch {
    return null;
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

// Try multiple README filenames + branches
async function fetchReadme(info: RepoInfo): Promise<{ content: string; url: string } | null> {
  const branches = [info.branch, "main", "master"];
  const paths = ["README.md", "readme.md", "README.rst", "README.txt", "README"];
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
  const branches = [info.branch, "main", "master"];
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
    let count = 1;
    const countM =
      window.match(/(\d{1,2})\s*[x×]\s*(?:NVIDIA\s*)?$/i) ??
      window.match(/(\d{1,2})\s*[x×]\s*[^,;)]{0,12}$/i) ??
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

function parseHosting(text: string): HostingRequirements | null {
  const notes = new Set<string>();
  const flags = { bareMetalOnly: false, teeRequired: false, staticIpRequired: false };
  let any = false;
  for (const [flag, pattern] of HOSTING_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      flags[flag] = true;
      any = true;
      // Quote the line containing the evidence (trimmed).
      const lineStart = text.lastIndexOf("\n", m.index);
      const lineEnd = text.indexOf("\n", m.index);
      const line = text
        .slice(lineStart + 1, lineEnd === -1 ? undefined : lineEnd)
        .trim()
        .replace(/[#*`>]/g, "")
        .slice(0, 220);
      if (line) notes.add(line);
    }
  }
  if (!any) return null;
  return { ...flags, notes: [...notes].slice(0, 5) };
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
      descLines.push(trimmed);
      if (descLines.length >= 3) break;
    }
  }
  if (descLines.length === 0) return null;
  const desc = descLines.join(" ").replace(/[#*`]/g, "").trim();
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

export async function scrapeGithubMetadata(
  githubUrl: string,
  opts?: { netuid?: number }
): Promise<ScrapedMetadata> {
  const info = parseGithubUrl(githubUrl);
  if (!info) {
    return { description: null, minVramGb: null, recommendedGpu: null, gpuCount: null, gpuModelRaw: null, hosting: null, requirementsSource: null, readmeUrl: null, requirementsUrl: null, rawReadmeSnippet: null, source: "error", error: "Invalid GitHub URL" };
  }

  try {
    const identity = await scrapeRepo(info);

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

    if (!identity.readme && !miner?.readme) {
      return { description: null, minVramGb: null, recommendedGpu: null, gpuCount: null, gpuModelRaw: null, hosting: null, requirementsSource: null, readmeUrl: null, requirementsUrl: null, rawReadmeSnippet: null, source: "error", error: "No README or requirements found" };
    }

    // Mining requirements prefer the MINER repo text (that's where operators
    // document hardware + hosting rules); description prefers the identity repo.
    const reqTexts = [
      miner?.readme,
      miner?.requirements,
      identity.requirements,
    ].filter(Boolean) as string[];
    const reqCombined = reqTexts.join("\n\n") || null;

    const gpu = reqCombined ? parseGpuRequirement(reqCombined) : null;
    const hosting = reqCombined ? parseHosting(reqCombined) : null;
    const vram = reqCombined ? parseVram(reqCombined) : null;

    const requirementsSource = miner?.readme && minerRepoInfo
      ? `https://github.com/${minerRepoInfo.owner}/${minerRepoInfo.repo}`
      : `https://github.com/${info.owner}/${info.repo}`;

    return {
      description: identity.readme ? parseDescription(identity.readme) : null,
      minVramGb: vram,
      recommendedGpu: gpu ? gpu.raw : null,
      gpuCount: gpu ? gpu.count : null,
      gpuModelRaw: gpu ? gpu.raw : null,
      hosting,
      requirementsSource: gpu || hosting ? requirementsSource : null,
      readmeUrl: identity.readmeUrl,
      requirementsUrl: miner?.requirementsUrl ?? identity.requirementsUrl,
      rawReadmeSnippet: identity.readme?.slice(0, 500) ?? null,
      source: "github",
    };
  } catch (e) {
    return { description: null, minVramGb: null, recommendedGpu: null, gpuCount: null, gpuModelRaw: null, hosting: null, requirementsSource: null, readmeUrl: null, requirementsUrl: null, rawReadmeSnippet: null, source: "error", error: e instanceof Error ? e.message : String(e) };
  }
}
