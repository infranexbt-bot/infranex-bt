// ---------------------------------------------------------------------------
// DevOps Engine — Subnet Requirements Profiler.
//
// "After I choose a good subnet, pull the requirements OF THE SUBNET itself":
// the profiler assembles everything the subnet's miner needs to run —
//
//   CHAIN   → netuid, identity name/description, GitHub URL, burn, work type
//   GITHUB  → README (VRAM / CUDA / GPU model), requirements.txt (pip deps),
//             pyproject.toml (python version), Dockerfile (image, CUDA base),
//             repo tree (miner entrypoint, setup scripts)
//   OVERRIDE→ team-curated SubnetOverride.githubUrl (user-provided repo link
//             takes precedence over the on-chain identity link)
//   CURATED → work-type classifier fallback (GPU tier by incentive category)
//
// The output SubnetRequirementsProfile is what the installer turns into an
// executable install plan for the target GPU host. Profiles are cached in the
// SubnetRequirements table (6h TTL, refresh=1 forces a re-pull).
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { fetchLiveSnapshot } from "@/lib/infranex/chain";
import { classifySubnetHardware } from "@/lib/infranex/miner-score";
import {
  scrapeGithubMetadata,
  CURATED_MINER_REPOS,
  type ScrapedMetadata,
  type InfraStack,
} from "@/lib/infranex/github-scraper";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

export interface SubnetRequirementsProfile {
  netuid: number;
  subnetName: string;
  description: string | null;
  category: string | null;

  // Hardware the subnet demands
  minVramGb: number;
  recommendedGpu: string;
  gpuSource: "repo" | "classifier" | "revenue-est" | "curated";

  // Software the subnet needs installed
  osPackages: string[]; // apt packages
  pythonVersion: string | null; // "3.10" style, null = distro default ok
  pipPackages: string[]; // top-level from requirements.txt / pyproject
  pipPackageCount: number;
  gitDeps: string[]; // requirements lines installed from git
  cudaMinVersion: string | null; // from README / Dockerfile base image
  dockerImage: string | null; // if the repo ships a Dockerfile
  dockerRequired: boolean;
  bittensorStack: string[]; // bittensor / async_substrate pieces detected
  packageManager: "pip" | "uv"; // uv workspace repos install via `uv sync`

  /**
   * INFRA-STACK: service-level infrastructure the subnet documents beyond a
   * pip stack (Kubernetes/k3s, Postgres, Redis, Gepetto, RAM-per-GPU sizing).
   * When present with kubernetes-class orchestration, the generic venv plan
   * is NOT sufficient — the installer adds explicit manual gates.
   */
  infraStack: InfraStack | null;

  // Repo + entrypoint
  repoUrl: string | null;
  repoBranch: string;
  entrypoint: string | null; // e.g. neurons/miner.py
  readmeUrl: string | null;
  requirementsUrl: string | null;
  dockerfileFound: boolean;

  // Runtime config the miner needs
  chainNetwork: "finney";
  ports: { axon: number; prometheus: number };
  envKeys: { name: string; description: string; required: boolean }[];
  minerCommandTemplate: string;

  // Provenance
  sources: ("chain" | "github" | "curated" | "override")[];
  confidence: "high" | "medium" | "low";
  notes: string[];
  fetchedAt: string;
}

// --- GitHub raw + API helpers ----------------------------------------------

interface RepoInfo {
  owner: string;
  repo: string;
  branch: string;
}

function parseGithubUrl(url: string): RepoInfo | null {
  try {
    // Tolerate user-pasted links: "github.com/org/repo", ".../tree/dev",
    // ".git" suffixes — normalize before parsing.
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const u = new URL(normalized);
    if (!u.hostname.includes("github.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return {
      owner: parts[0],
      repo: parts[1].replace(/\.git$/, ""),
      branch: parts[3] || "main",
    };
  } catch {
    return null;
  }
}

/** Canonical https repo URL for a pasted/chain GitHub link, or null. */
function normalizeGithubUrl(url: string): string | null {
  const info = parseGithubUrl(url);
  return info ? `https://github.com/${info.owner}/${info.repo}` : null;
}

async function fetchRaw(
  info: RepoInfo,
  path: string,
  branches: string[] = []
): Promise<{ content: string; branch: string } | null> {
  for (const branch of [info.branch, ...branches]) {
    try {
      const res = await fetch(
        `https://raw.githubusercontent.com/${info.owner}/${info.repo}/${branch}/${path}`,
        { headers: { "User-Agent": "infranex-devops/1.0" }, signal: AbortSignal.timeout(12_000) }
      );
      if (res.ok) return { content: await res.text(), branch };
    } catch {
      /* try next branch */
    }
  }
  return null;
}

/** Repo tree via the GitHub API — used to locate the miner entrypoint. */
async function fetchRepoTree(info: RepoInfo): Promise<string[] | null> {
  for (const branch of [info.branch, "main", "master"]) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${info.owner}/${info.repo}/git/trees/${branch}?recursive=1`,
        {
          headers: { "User-Agent": "infranex-devops/1.0", Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(12_000),
        }
      );
      if (!res.ok) continue;
      const j = (await res.json()) as { tree?: { path: string; type: string }[] };
      if (Array.isArray(j.tree)) {
        return j.tree.filter((t) => t.type === "blob").map((t) => t.path);
      }
    } catch {
      /* try next branch */
    }
  }
  return null;
}

// --- Parsers ----------------------------------------------------------------

const ENTRYPOINT_CANDIDATES = [
  "neurons/miner.py",
  "neuron/miner.py",
  "miner.py",
  "scripts/run_miner.sh",
  "scripts/miner.sh",
  "miner/main.py",
  "src/miner.py",
];

/** Probe raw.githubusercontent for known entrypoint paths (NOT rate-limited). */
async function probeEntrypointRaw(info: RepoInfo): Promise<string | null> {
  for (const path of ENTRYPOINT_CANDIDATES) {
    const hit = await fetchRaw(info, path, ["main", "master"]);
    if (hit) return path;
  }
  return null;
}

/** Parse `python … miner.py` run commands out of the README. */
function findEntrypointFromReadme(readme: string | null): string | null {
  if (!readme) return null;
  const matches = [
    ...readme.matchAll(/python3?\s+(?:-\S+\s+)*([\w\-./]*miner\.py)/gi),
  ]
    .map((m) => m[1])
    .filter((p) => !p.includes("http"));
  if (matches.length === 0) return null;
  // shortest path = most likely repo-root relative
  return [...new Set(matches)].sort((a, b) => a.length - b.length)[0];
}

function findEntrypoint(tree: string[]): string | null {
  for (const c of ENTRYPOINT_CANDIDATES) {
    const hit = tree.find((p) => p.toLowerCase() === c);
    if (hit) return hit;
  }
  // looser: any path ending with miner.py (prefer shallow paths)
  const loosies = tree
    .filter((p) => /(^|\/)miner(_\w+)?\.py$/i.test(p))
    .sort((a, b) => a.split("/").length - b.split("/").length);
  if (loosies.length > 0) return loosies[0];
  return null;
}

/** pip requirement lines → structured deps (skip comments, flags, nested -r). */
function parseRequirements(text: string): { pip: string[]; git: string[] } {
  const pip: string[] = [];
  const git: string[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("-r") || line.startsWith("-c")) continue;
    if (line.startsWith("-e")) continue;
    // strip inline comment + env markers
    const base = line.split("#")[0].split(";")[0].trim();
    if (!base) continue;
    if (base.startsWith("git+") || base.startsWith("http")) {
      git.push(base);
      continue;
    }
    // Keep name + operator spec, drop hashes/paths
    const nameSpec = base.match(/^[A-Za-z0-9_.\[\]-]+\s*(?:[<>=!~]=?\s*[^,\s]+)?/);
    if (nameSpec) pip.push(nameSpec[0].trim());
  }
  return { pip, git };
}

function parsePythonVersion(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    const patterns = [
      /requires-python\s*=\s*["']?[><=!]+\s*(\d\.\d{1,2})/i,
      /python_requires\s*=\s*["'][><=!]+\s*(\d\.\d{1,2})/i,
      /python\s*(?:version)?\s*[:=]?\s*(?:≥|>=)?\s*(3\.1[0-2]|\d\.\d{1,2})\b/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const v = m[1];
        const [maj, min] = v.split(".").map((x) => parseInt(x, 10));
        if (maj === 3 && min >= 8 && min <= 13) return v;
      }
    }
  }
  return null;
}

function parseCudaVersion(text: string): string | null {
  // README ("requires CUDA 12.1") or Dockerfile base image (nvidia/cuda:12.4.1-…)
  const m =
    text.match(/cuda\s*(?:version)?\s*[:=]?\s*(?:≥|>=)?\s*(12\.\d|11\.\d)/i) ??
    text.match(/nvidia\/cuda:(\d+\.\d+\.\d+)/i);
  return m ? m[1] : null;
}

/** apt packages hinted anywhere in the repo text (README install blocks). */
const APT_HINTS = [
  "build-essential", "ffmpeg", "libgl1", "libgl1-mesa-glx", "libglib2.0-0",
  "libsndfile1", "pkg-config", "libssl-dev", "libffi-dev", "git-lfs",
  "libpq-dev", "poppler-utils", "tesseract-ocr", "redis-tools", "cmake",
];

function parseAptPackages(text: string): string[] {
  const found = new Set<string>();
  for (const pkg of APT_HINTS) {
    const re = new RegExp(`(^|[^\\w-])${pkg.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}([^\\w-]|$)`, "i");
    if (re.test(text)) found.add(pkg);
  }
  return [...found];
}

const BT_STACK_PACKAGES = ["bittensor", "async-substrate-interface", "bittensor-cli", "substrateinterface"];

function parseBittensorStack(pip: string[]): string[] {
  return BT_STACK_PACKAGES.filter((p) =>
    pip.some((d) => d.toLowerCase().replace(/[_\s]/g, "-").startsWith(p))
  );
}

// --- Profile assembly -------------------------------------------------------

function minerCommandTemplate(profile: {
  netuid: number;
  entrypoint: string | null;
}): string {
  return `python ${profile.entrypoint ?? "neurons/miner.py"} --netuid ${profile.netuid} --subtensor.network finney --wallet.name <WALLET> --wallet.hotkey <HOTKEY> --axon.port 8091`;
}

const BASE_ENV_KEYS = (netuid: number) => [
  { name: "BT_NETWORK", description: "subtensor network to mine on", required: true },
  { name: "BT_NETUID", description: `subnet id (= ${netuid})`, required: true },
  { name: "BT_WALLET_NAME", description: "bittensor coldkey wallet name", required: true },
  { name: "BT_HOTKEY_NAME", description: "bittensor hotkey name", required: true },
  { name: "CUDA_VISIBLE_DEVICES", description: "GPU device index the miner may use", required: false },
];

/**
 * Pull the requirements profile for one subnet — chain + GitHub + classifier.
 * `cached` (when present) is returned as-is unless stale/refresh requested.
 */
export async function pullSubnetRequirements(
  netuid: number,
  opts?: { refresh?: boolean }
): Promise<{ profile: SubnetRequirementsProfile; cached: boolean }> {
  // 1) DB cache
  if (!opts?.refresh) {
    const row = await db.subnetRequirements.findUnique({ where: { netuid } });
    if (row && Date.now() - row.fetchedAt.getTime() < CACHE_TTL_MS) {
      return { profile: JSON.parse(row.profileJson) as SubnetRequirementsProfile, cached: true };
    }
  }

  const profile = await buildProfile(netuid);

  await db.subnetRequirements.upsert({
    where: { netuid },
    create: {
      netuid,
      subnetName: profile.subnetName,
      profileJson: JSON.stringify(profile),
      confidence: profile.confidence,
      sources: JSON.stringify(profile.sources),
      fetchedAt: new Date(),
    },
    update: {
      subnetName: profile.subnetName,
      profileJson: JSON.stringify(profile),
      confidence: profile.confidence,
      sources: JSON.stringify(profile.sources),
      fetchedAt: new Date(),
    },
  });

  return { profile, cached: false };
}

async function buildProfile(netuid: number): Promise<SubnetRequirementsProfile> {
  const notes: string[] = [];
  const sources: SubnetRequirementsProfile["sources"] = [];

  // --- Chain layer ---
  let name = `Subnet ${netuid}`;
  let description: string | null = null;
  let identityGithub: string | null = null;
  let minerEmissionTaoPerDay: number | null = null;
  let registeredMiners = 0;
  try {
    const snap = await fetchLiveSnapshot();
    const live = snap.subnets.find((s) => s.netuid === netuid);
    if (live) {
      sources.push("chain");
      name = live.name ?? `Subnet ${netuid}`;
      description = live.identityDescription ?? null;
      identityGithub = live.identityGithub ?? null;
      minerEmissionTaoPerDay = live.minerEmissionTaoPerDay;
      registeredMiners = live.minersCount;
    } else {
      notes.push("Subnet not found in the live chain snapshot.");
    }
  } catch (e) {
    notes.push(
      `Chain snapshot unavailable (${e instanceof Error ? e.message : "error"}) — proceeding with GitHub/classifier only.`
    );
  }

  // --- Override layer (team-curated repo link beats the chain) ------------
  let githubUrl = identityGithub;
  try {
    const ov = await db.subnetOverride.findUnique({ where: { netuid } });
    if (ov?.githubUrl) {
      const normalized = normalizeGithubUrl(ov.githubUrl);
      if (normalized) {
        githubUrl = normalized;
        sources.push("override");
        notes.push(
          "Repo URL comes from the team's subnet override (user-provided) — it takes precedence over the on-chain identity link."
        );
      } else {
        notes.push(
          `Subnet override GitHub URL "${ov.githubUrl}" is not a valid github.com repo link — falling back to the chain.`
        );
      }
    }
  } catch {
    /* override table unavailable — chain URL stands */
  }

  // --- GitHub layer ---
  let scraped: ScrapedMetadata | null = null;
  let reqInfo: { content: string; branch: string } | null = null;
  let pyprojectInfo: { content: string; branch: string } | null = null;
  let dockerfileInfo: { content: string; branch: string } | null = null;
  let tree: string[] | null = null;
  let readmeText: string | null = null;
  let repoInfo: RepoInfo | null = null;

  if (githubUrl) repoInfo = parseGithubUrl(githubUrl);
  // MINER-REPO ROUTING: for subnets whose on-chain identity repo is the
  // product page (Chutes-class), the curated map points at the MINER repo
  // where requirements/entrypoint/Dockerfile actually live. Raw probes and
  // the scraper (hosting/infra/mechanics) all use the routed repo; the
  // identity URL stays only as the fallback description source.
  const routedUrl = githubUrl ? CURATED_MINER_REPOS[netuid] ?? githubUrl : null;
  const routed = routedUrl !== githubUrl;
  if (routedUrl) repoInfo = parseGithubUrl(routedUrl);
  if (routed)
    notes.push(
      `The on-chain identity repo is the product page — requirements probed from the miner repo (${routedUrl}) per the curated routing map.`
    );
  if (repoInfo) {
    // README (reuse the scraper's parsing for description/VRAM/GPU/infra)
    try {
      scraped = await scrapeGithubMetadata(routedUrl!, { netuid });
      if (scraped.source === "github") sources.push("github");
    } catch {
      /* handled below */
    }
    // raw files the profiler needs beyond the scraper
    const branches = ["main", "master"];
    [reqInfo, pyprojectInfo, dockerfileInfo, tree] = await Promise.all([
      (async () => {
        for (const path of ["requirements.txt", "requirements-min.txt"]) {
          const r = await fetchRaw(repoInfo!, path, branches);
          if (r) return { content: r.content, branch: r.branch };
        }
        return null;
      })(),
      fetchRaw(repoInfo, "pyproject.toml", branches),
      fetchRaw(repoInfo, "Dockerfile", branches),
      fetchRepoTree(repoInfo),
    ]);
    // README full text: pull the best README directly
    for (const path of ["README.md", "readme.md"]) {
      const r = await fetchRaw(repoInfo, path, branches);
      if (r) {
        readmeText = r.content;
        break;
      }
    }
    if (!scraped || scraped.source !== "github") {
      // scraper may still have caught requirements even if README failed
      if (reqInfo || pyprojectInfo || dockerfileInfo || readmeText) sources.push("github");
    }
  } else {
    notes.push("No GitHub repo linked on-chain for this subnet — using the work-type classifier.");
  }

  const combinedText = [readmeText, reqInfo?.content, pyprojectInfo?.content, dockerfileInfo?.content]
    .filter(Boolean)
    .join("\n\n");

  // --- Parse software requirements ---
  const reqs = reqInfo ? parseRequirements(reqInfo.content) : { pip: [], git: [] };
  let pipPackages = reqs.pip;
  let gitDeps = reqs.git;
  if (pipPackages.length === 0 && pyprojectInfo) {
    // crude pyproject dependencies extraction
    const depsBlock = pyprojectInfo.content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (depsBlock) {
      const parsed = parseRequirements(depsBlock[1].replace(/["']/g, ""));
      pipPackages = parsed.pip;
      gitDeps = parsed.git;
    }
  }

  // uv workspace repo (Apex-style): deps live in workspace members, install
  // with `uv sync` instead of pip + requirements.txt.
  const isUvWorkspace = Boolean(pyprojectInfo?.content.includes("[tool.uv.workspace]"));
  const packageManager: SubnetRequirementsProfile["packageManager"] = isUvWorkspace ? "uv" : "pip";
  if (isUvWorkspace) {
    notes.push(
      "uv workspace repo — the installer uses `uv sync` (the repo manages its own deps/venv)."
    );
  }

  const pythonVersion = parsePythonVersion(pyprojectInfo?.content, readmeText);
  const cudaMinVersion = combinedText ? parseCudaVersion(combinedText) : null;
  const osPackages = combinedText ? parseAptPackages(combinedText) : [];
  const bittensorStack = parseBittensorStack(pipPackages);

  // Dockerfile base image: multi-stage builds → the LAST concrete FROM is
  // the runtime base. Skip `scratch` and ${VAR} indirection (unresolvable
  // remotely) — those repos fall back to the venv install path.
  let dockerImage: string | null = null;
  if (dockerfileInfo) {
    const froms = [
      ...dockerfileInfo.content.matchAll(
        /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)/gim
      ),
    ]
      .map((m) => m[1])
      .filter((img) => img && !img.includes("${") && img.toLowerCase() !== "scratch");
    dockerImage = froms.length > 0 ? froms[froms.length - 1] : null;
    if (!dockerImage) {
      notes.push(
        "Dockerfile found but its base image is build-arg-driven — the install plan uses the Python venv path."
      );
    }
  }

  // Entrypoint: raw probes (no rate limit) → README run commands → tree API
  // (last resort — the GitHub API is easily rate-limited on shared IPs).
  let entrypoint: string | null = null;
  if (repoInfo) {
    entrypoint = await probeEntrypointRaw(repoInfo);
    if (!entrypoint) entrypoint = findEntrypointFromReadme(readmeText);
    if (!entrypoint && tree) entrypoint = findEntrypoint(tree);
  }

  // --- Hardware layer (repo README > classifier > curated) ---
  const hw = classifySubnetHardware(name, description, {
    fallbackVramGb: scraped?.minVramGb ?? undefined,
    fallbackGpu: scraped?.recommendedGpu ?? undefined,
    fallbackMonthlyUsd: minerEmissionTaoPerDay
      ? minerEmissionTaoPerDay * 730 * 1 /* price overlay not needed for tier */
      : undefined,
  });

  let minVramGb = hw.minVramGb;
  let recommendedGpu = hw.recommendedGpu;
  let gpuSource: SubnetRequirementsProfile["gpuSource"] = "curated";
  if (scraped?.minVramGb || scraped?.recommendedGpu) {
    minVramGb = scraped?.minVramGb ?? minVramGb;
    recommendedGpu = scraped?.recommendedGpu ?? recommendedGpu;
    gpuSource = "repo";
  } else if (hw.classified) {
    gpuSource = "classifier";
  } else if (minerEmissionTaoPerDay != null) {
    gpuSource = "revenue-est"; // tier derived from what the reward stream can fund
  }

  // Confidence: repo found + deps parsed = high; repo but thin parse = medium; none = low
  const hasRepo = sources.includes("github");
  const confidence: SubnetRequirementsProfile["confidence"] = hasRepo
    ? pipPackages.length > 0 || dockerImage || entrypoint
      ? "high"
      : "medium"
    : sources.includes("chain")
      ? "medium"
      : "low";
  if (!hasRepo) notes.push("Software list comes from the bittensor baseline, not the subnet repo.");
  if (scraped?.infra?.services.length)
    notes.push(
      `Service stack documented: ${scraped.infra.services.map((s) => s.name).join(", ")}${scraped.infra.orchestration ? ` (orchestration: ${scraped.infra.orchestration})` : ""} — the install plan includes it; kubernetes-class stacks get an explicit manual gate.`
    );
  if (registeredMiners === 0) notes.push("No registered miners yet — treat entrypoint/command as provisional.");
  if (hasRepo && !entrypoint)
    notes.push("Entrypoint not found (repo tree unreachable or unusual layout) — the plan uses the neurons/miner.py default; edit if the subnet documents a different one.");
  if (sources.includes("override"))
    notes.push("Profile confidence is backed by the user-provided repo link — verify the requirements after the first install run.");

  const profile: SubnetRequirementsProfile = {
    netuid,
    subnetName: name,
    description: scraped?.description ?? description,
    category: hw.category,
    minVramGb,
    recommendedGpu,
    gpuSource,
    osPackages: ["git", "python3", "python3-venv", "python3-pip", "build-essential", ...osPackages],
    pythonVersion,
    pipPackages: pipPackages.slice(0, 60),
    pipPackageCount: pipPackages.length,
    gitDeps: gitDeps.slice(0, 10),
    cudaMinVersion,
    dockerImage,
    dockerRequired: Boolean(dockerImage),
    bittensorStack,
    packageManager,
    infraStack: scraped?.infra ?? null,
    repoUrl: routedUrl,
    repoBranch: repoInfo?.branch ?? "main",
    entrypoint,
    readmeUrl: scraped?.readmeUrl ?? null,
    requirementsUrl: scraped?.requirementsUrl ?? null,
    dockerfileFound: Boolean(dockerfileInfo),
    chainNetwork: "finney",
    ports: { axon: 8091, prometheus: 8092 },
    envKeys: BASE_ENV_KEYS(netuid),
    minerCommandTemplate: minerCommandTemplate({ netuid, entrypoint }),
    sources: [...new Set(sources)],
    confidence,
    notes,
    fetchedAt: new Date().toISOString(),
  };

  return profile;
}
