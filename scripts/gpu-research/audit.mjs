/**
 * SUBNET GPU REQUIREMENTS RESEARCH — repo-level audit of all Bittensor subnets.
 *
 * For every subnet (netuid 0..128) we download the default-branch repo tarball
 * (codeload.github.com/…/tar.gz/HEAD) and scan the extracted files for GPU
 * model mentions across three artifact classes:
 *   1. READMEs            — README files at any depth
 *   2. min_compute.yml    — min_compute.yml / min_compute.yaml (declarations)
 *   3. Docker files       — Dockerfile*, *.dockerfile, docker-compose*.yml
 *
 * Output: audit-raw.json — per-subnet evidence (models per artifact, quotes,
 * file paths, base images). Curation into the UI seed happens separately.
 *
 * Run: node scripts/gpu-research/audit.mjs
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, dirname, basename, extname } from "path";
import { execFileSync } from "child_process";

const ROOT = "/tmp/gpu-research";
const TARBALLS = join(ROOT, "tarballs");
const SRC = join(ROOT, "src");
const OUT = join(import.meta.dirname, "audit-raw.json");
const LIST = join(import.meta.dirname, "repo-list.json");

mkdirSync(TARBALLS, { recursive: true });
mkdirSync(SRC, { recursive: true });

// SN64 Chutes: on-chain identity repo is the product page; requirements live
// in the miner repo. Same mapping the platform scraper uses.
const CURATED_MINER_REPOS = {
  64: "https://github.com/chutesai/chutes-miner",
};

// --- GPU model taxonomy ----------------------------------------------------
// canonical → detection regex (word-bounded). Order matters only for reporting.
const MODELS = [
  { key: "H200", re: /\bH200\b/i },
  { key: "H100", re: /\bH100\b/i },
  { key: "GH200", re: /\bGH200\b/i },
  { key: "B200", re: /\bB200\b/i },
  { key: "B300", re: /\bB300\b/i },
  { key: "GB200", re: /\bGB200\b/i },
  { key: "A100", re: /\bA100\b/i },
  { key: "A800", re: /\bA800\b/i },
  { key: "H800", re: /\bH800\b/i },
  { key: "H20", re: /\bH20\b/i },
  { key: "RTX PRO 6000", re: /\bRTX\s*PRO\s*(6000|Blackwell)\b/i },
  { key: "RTX 6000 Ada", re: /\bRTX\s*6000\s*Ada\b/i },
  { key: "L40S", re: /\bL40S\b/i },
  { key: "L40", re: /\bL40\b(?!S)/i },
  { key: "L4", re: /\bL4\b(?!0)/i },
  { key: "A6000", re: /\bA6000\b/i },
  { key: "A5000", re: /\bA5000\b/i },
  { key: "RTX 5090", re: /\b(RTX\s*)?5090\b/i },
  { key: "RTX 5080", re: /\b(RTX\s*)?5080\b/i },
  { key: "RTX 4090", re: /\b(RTX\s*)?4090\b/i },
  { key: "RTX 3090 Ti", re: /\b3090\s*Ti\b/i },
  { key: "RTX 3090", re: /\b(RTX\s*)?3090\b/i },
  { key: "MI325X", re: /\bMI325X\b/i },
  { key: "MI300X", re: /\bMI300X\b/i },
  { key: "A10G", re: /\bA10G\b/i },
  { key: "A10", re: /\bA10\b(?!G)/i },
  { key: "V100", re: /\bV100\b/i },
  { key: "T4", re: /\bT4\b/i },
];

// "no GPU needed" markers
const CPU_ONLY_RE = /\b(cpu[- ]only|no\s+gpu|without\s+(a\s+)?gpu|gpu[- ]free)\b|does not (?:perform|require|use|need)[^.\n]{0,60}\bgpu\b|\bruns? (?:entirely )?on (?:a )?cpu\b/i;
const QPU_RE = /\b(qpu|quantum\s+(computer|hardware|processor))\b/i;
// generic "GPU" hardware mention — counted separately from named models so
// "GPU demanded but never named" is distinguishable from "no GPU signal".
const GENERIC_GPU_RE = /\bGPU\b/;

// Docker base images that imply CUDA/GPU runtimes
const BASE_IMAGE_RE = /^\s*FROM\s+\S*(nvidia\/cuda|pytorch\/pytorch|nvcr\.io|rocm\/|depyronick\/|)\S*/gim;
const BASE_IMAGE_FILTER = /(nvidia\/cuda|pytorch\/pytorch|nvcr\.io|rocm\/)/i;

const GPU_COUNT_RE = /\b(\d{1,2})\s*[x×]\s*(H100|H200|B200|B300|A100|L40S?|L4\b|A6000|4090|5090|3090|GPU)/i;
const GPU_COUNT_REV_RE = /\b(H100|H200|B200|B300|A100|L40S?|A6000|4090|5090|3090|GPU)\s*[x×]\s*(\d{1,2})\b/i;
const VRAM_FLOOR_RE = /(?:>=?\s*|≥\s*|at least\s*|>\s*)(\d{1,3})\s*GB\b/i;

const README_RE = /^readme(\.|-|$)/i;
const MINCOMPUTE_RE = /min_compute\.ya?ml$/i;
const DOCKER_RE = /(dockerfile|docker-compose\.ya?ml|docker-compose\.yaml|\.dockerfile)$/i;

const SKIP_DIRS = new Set(["node_modules", ".git", ".github", "dist", "build", ".venv", "venv", "__pycache__"]);
const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".zip", ".gz", ".ico", ".mp4", ".svg", ".woff", ".woff2", ".ttf", ".onnx", ".safetensors", ".pth", ".pt", ".bin", ".parquet"]);

function normalizeRepo(gh) {
  if (!gh) return null;
  try {
    const u = new URL(gh.startsWith("http") ? gh : `https://${gh}`);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1].replace(/\.git$/, "")}`;
  } catch {
    return null;
  }
}

async function fetchTarball(netuid, repo) {
  const dest = join(TARBALLS, `${netuid}.tgz`);
  if (existsSync(dest) && statSync(dest).size > 200) return { ok: true, cached: true };
  const url = `https://codeload.github.com/${repo}/tar.gz/HEAD`;
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!res.ok) return { ok: false, status: res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) return { ok: false, status: "empty" };
  writeFileSync(dest, buf);
  return { ok: true, size: buf.length };
}

function extractTarball(netuid) {
  const dest = join(SRC, String(netuid));
  if (existsSync(dest)) return dest;
  mkdirSync(dest, { recursive: true });
  execFileSync("tar", ["-xzf", join(TARBALLS, `${netuid}.tgz`), "-C", dest, "--strip-components=1"], { timeout: 120_000 });
  return dest;
}

function isInteresting(name) {
  return README_RE.test(name) || MINCOMPUTE_RE.test(name) || DOCKER_RE.test(name);
}

function classifyFile(relPath) {
  const lower = relPath.toLowerCase();
  if (MINCOMPUTE_RE.test(lower)) return "min_compute";
  if (DOCKER_RE.test(lower)) return "docker";
  if (README_RE.test(basename(lower))) return "readme";
  return null;
}

function walk(dir, base = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walk(join(dir, entry.name), join(base, entry.name)));
    } else if (entry.isFile()) {
      const rel = join(base, entry.name);
      if (BINARY_EXT.has(extname(entry.name).toLowerCase())) continue;
      const size = statSync(join(dir, entry.name)).size;
      if (size > 3_000_000) continue;
      if (isInteresting(basename(entry.name))) out.push({ abs: join(dir, entry.name), rel, size });
    }
  }
  return out;
}

function scanContent(text, kind) {
  const lines = text.split("\n");
  const models = {};
  const quotes = {};
  let cpuOnly = false;
  let qpu = false;
  let gpuCount = null;
  let vramFloor = null;
  const counts = {};
  let genericGpuLines = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.length > 2000) continue;
    for (const m of MODELS) {
      if (m.re.test(line)) {
        models[m.key] = (models[m.key] ?? 0) + 1;
        counts[m.key] = (counts[m.key] ?? 0) + 1;
        if (!quotes[m.key] && line.length > 8) quotes[m.key] = line.slice(0, 200);
      }
    }
    if (CPU_ONLY_RE.test(line)) cpuOnly = true;
    if (QPU_RE.test(line)) qpu = true;
    if (GENERIC_GPU_RE.test(line)) genericGpuLines++;
    const c = GPU_COUNT_RE.exec(line) ?? GPU_COUNT_REV_RE.exec(line);
    if (c) {
      const n = parseInt(c[1] >= "0" && c[1] <= "9" ? c[1] : c[2], 10);
      if (Number.isFinite(n) && n >= 1 && n <= 64) gpuCount = gpuCount === null ? n : gpuCount;
    }
    const v = VRAM_FLOOR_RE.exec(line);
    if (v) {
      const gb = parseInt(v[1], 10);
      if (Number.isFinite(gb) && gb >= 1 && gb <= 2048) vramFloor = vramFloor === null ? gb : Math.max(vramFloor, gb);
    }
  }

  let baseImages = [];
  if (kind === "docker") {
    const froms = [...text.matchAll(/^\s*FROM\s+(\S+)/gim)].map((m) => m[1]).filter((i) => BASE_IMAGE_FILTER.test(i));
    baseImages = [...new Set(froms)].slice(0, 5);
  }

  return {
    models,          // key → hit count
    quotes,          // key → first matching line
    cpuOnly,
    qpu,
    gpuCount,
    vramFloor,
    genericGpuLines, // lines mentioning "GPU" without any named model
    baseImages,      // docker only
    lines: lines.length,
  };
}

function scanRepo(dir) {
  const files = walk(dir);
  const artifacts = { readme: [], min_compute: [], docker: [] };
  const filesScanned = [];
  for (const f of files) {
    const kind = classifyFile(f.rel);
    if (!kind) continue;
    const text = readFileSync(f.abs, "utf8");
    const result = scanContent(text, kind);
    artifacts[kind].push({ path: f.rel, ...result });
    filesScanned.push(f.rel);
  }
  return { artifacts, filesScanned };
}

// --- main --------------------------------------------------------------------

const list = JSON.parse(readFileSync(LIST, "utf8"));
const results = [];

async function processOne(entry) {
  const { netuid, name, gh } = entry;
  const repo = normalizeRepo(netuid in CURATED_MINER_REPOS ? CURATED_MINER_REPOS[netuid] : gh);
  const rec = { netuid, name, repo, artifacts: null, filesScanned: null, error: null };
  if (!repo) {
    rec.error = netuid === 0 ? "root network — no mining repo" : "no public repo identified";
    results.push(rec);
    return;
  }
  try {
    const t = await fetchTarball(netuid, repo);
    if (!t.ok) {
      rec.error = `tarball fetch failed (${t.status})`;
      results.push(rec);
      return;
    }
    const dir = extractTarball(netuid);
    const { artifacts, filesScanned } = scanRepo(dir);
    rec.artifacts = artifacts;
    rec.filesScanned = filesScanned;
  } catch (e) {
    rec.error = String(e?.message ?? e).slice(0, 200);
  }
  results.push(rec);
}

async function pool(items, worker, concurrency) {
  let i = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

const t0 = Date.now();
await pool(list, processOne, 8);
results.sort((a, b) => a.netuid - b.netuid);
writeFileSync(OUT, JSON.stringify(results, null, 1));
const ok = results.filter((r) => r.artifacts).length;
console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s — ${results.length} entries, ${ok} repos scanned, output: ${OUT}`);
const failed = results.filter((r) => r.error).map((r) => `${r.netuid}(${r.error.slice(0, 60)})`);
if (failed.length) console.log("failed:", failed.join(" | "));
