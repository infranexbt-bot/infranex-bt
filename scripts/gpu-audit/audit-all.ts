/**
 * gpu-audit-all.ts — GPU-AUDIT (user: "check all the subnets ... provide correct GPUs")
 *
 * For EVERY subnet (1..128) in the live chain snapshot:
 *   1. Resolve the repo (curated miner repo > SubnetOverride.githubUrl > chain identityGithub)
 *   2. GROUND TRUTH: fetch min_compute.yml (official Bittensor CDL template) and the
 *      README doc set; extract exact min_vram / recommended_gpu / gpu_models + README
 *      GPU-evidence lines. No assumptions — only what the repo itself states.
 *   3. DISPLAY: run the app's own scraper (scrapeGithubMetadata) + classifier fallback
 *      exactly as buildProfile does, to compute what the UI will show.
 *   4. Compare → verdict per subnet: OK | MISMATCH | ESTIMATE (no GT) | NO-REPO | ERROR
 *
 * Output: scripts/gpu-audit/audit-results.json + console report.
 * Run: npx tsx scripts/gpu-audit/audit-all.ts
 */

import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { scrapeGithubMetadata, CURATED_MINER_REPOS } from "../../src/lib/infranex/github-scraper";
import { classifySubnetHardware } from "../../src/lib/infranex/miner-score";

const db = new PrismaClient();

// ---------- raw github helpers (mirror the scraper's conventions) ----------
async function fetchRaw(owner: string, repo: string, branch: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`, {
      headers: { "User-Agent": "infranex-audit/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchMinCompute(owner: string, repo: string): Promise<{ raw: string; branch: string; path: string } | null> {
  const branches = ["HEAD", "main", "master"];
  const paths = ["min_compute.yml", "min_compute.yaml"];
  for (const path of paths) {
    for (const branch of branches) {
      const raw = await fetchRaw(owner, repo, branch, path);
      if (raw) return { raw, branch, path };
    }
  }
  return null;
}

const README_PATHS = ["README.md", "readme.md", "README.rst", "README", "AGENTS.md", "CLAUDE.md", "docs/README.md", "docs/MINING.md"];
async function fetchReadme(owner: string, repo: string): Promise<string | null> {
  for (const branch of ["HEAD", "main", "master"]) {
    for (const path of README_PATHS) {
      const raw = await fetchRaw(owner, repo, branch, path);
      if (raw) return raw;
    }
  }
  return null;
}

// ---------- min_compute.yml parsing (ground truth) ----------
interface MinComputeGT {
  minVram: number | null;
  recommendedVram: number | null;
  recommendedGpu: string | null;
  gpuModels: string[];
  cudaVersion: string | null;
  blockContext: string; // "minimum_compute" | "first-occurrence" | ...
  url: string;
}

function parseMinCompute(raw: string, url: string): MinComputeGT {
  // Extract the `minimum_compute:` top-level block (miner requirements — the
  // official CDL template puts validator needs in a separate sibling block).
  const lines = raw.split("\n");
  let block: string[] = lines;
  let blockContext = "first-occurrence";
  const startIdx = lines.findIndex((l) => /^minimum_compute\s*:/.test(l));
  if (startIdx >= 0) {
    let end = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (/^\S/.test(lines[i])) { end = i; break; }
    }
    block = lines.slice(startIdx, end);
    blockContext = "minimum_compute";
  }
  const text = block.join("\n");
  const num = (re: RegExp): number | null => {
    const m = text.match(re);
    if (!m) return null;
    const v = parseInt(m[1], 10);
    return Number.isFinite(v) && v > 0 && v <= 999 ? v : null;
  };
  const gpuModelsM = text.match(/^\s*gpu_models\s*:\s*\[([^\]]*)\]/m);
  const gpuModels = gpuModelsM
    ? gpuModelsM[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
    : [];
  return {
    minVram: num(/^\s*min_vram\s*:\s*["']?(\d{1,3})/m),
    recommendedVram: num(/^\s*recommended_vram\s*:\s*["']?(\d{1,3})/m),
    recommendedGpu: text.match(/^\s*recommended_gpu\s*:\s*["']?([^"'\n#]+?)["']?\s*(?:#.*)?$/m)?.[1]?.trim() ?? null,
    gpuModels,
    cudaVersion: text.match(/^\s*cuda_version\s*:\s*["']?([\d.]+)/m)?.[1] ?? null,
    blockContext,
    url,
  };
}

// ---------- README GPU evidence (independent of the app's parsers) ----------
const MODEL_RES: Array<[RegExp, string]> = [
  [/\b(B300|GB300)\b/, "B300"],
  [/\b(B200|GB200)\b/, "B200"],
  [/\b(H200)\b/, "H200"],
  [/\b(H100)\b/, "H100"],
  [/\b(RTX\s*PRO\s*6000)\b/i, "RTX Pro 6000"],
  [/\b(RTX\s*6000\s*ADA)\b/i, "RTX 6000 Ada"],
  [/\b(A100)\b/, "A100"],
  [/\b(H800|A800)\b/, "$&"],
  [/\b(L40S)\b/, "L40S"],
  [/\b(L40)\b/, "L40"],
  [/\b(A40)\b/, "A40"],
  [/\b(A6000|RTX\s*A6000)\b/i, "RTX A6000"],
  [/\b(A5000)\b/, "RTX A5000"],
  [/\b(L4)\b/, "L4"],
  [/\b(A10)\b/, "A10"],
  [/\b(T4)\b/, "T4"],
  [/\b(RTX\s*5090)\b/i, "RTX 5090"],
  [/\b(RTX\s*4090)\b/i, "RTX 4090"],
  [/\b(RTX\s*3090\s*TI)\b/i, "RTX 3090 Ti"],
  [/\b(RTX\s*3090)\b/i, "RTX 3090"],
  [/\b(RTX\s*3080)\b/i, "RTX 3080"],
  [/\b(MI300X)\b/i, "MI300X"],
  [/\b(GTX\s*1650|GTX\s*1080)\b/i, "$&"],
];

function readmeGpuEvidence(readme: string): string[] {
  const hits: string[] = [];
  for (const line of readme.split("\n")) {
    if (/variety|from .* to |such as|e\.g\.|etc\./i.test(line)) continue;
    if (!/(require|minimum|supported|validated|must|need|recommend|hardware|spec)/i.test(line)) continue;
    for (const [re] of MODEL_RES) {
      if (re.test(line)) {
        hits.push(line.trim().replace(/[#*`>]/g, "").slice(0, 180));
        break;
      }
    }
  }
  return [...new Set(hits)].slice(0, 8);
}

function readmeVramEvidence(readme: string): number | null {
  for (const line of readme.split("\n")) {
    if (!/(require|minimum|min\.|at least| VRAM)/i.test(line)) continue;
    const m = line.match(/(\d{1,3})\s*GB\s*(?:\+)?\s*(?:VRAM|vram)/i) ?? line.match(/VRAM[^.]{0,20}?(\d{1,3})\s*GB/i);
    if (m) {
      const v = parseInt(m[1], 10);
      if (v >= 4 && v <= 320) return v;
    }
  }
  return null;
}

// ---------- GPU model normalization + comparison ----------
function normModel(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.toUpperCase().replace(/^NVIDIA\s+/, "").replace(/^AMD\s+/, "").replace(/\s+/g, " ").trim();
  for (const [re, name] of MODEL_RES) {
    const m = t.match(re);
    if (m) return name === "$&" ? m[0].toUpperCase() : name;
  }
  return t || null;
}

function compatible(displayGpu: string | null, gt: MinComputeGT): boolean {
  if (!displayGpu) return false;
  const d = normModel(displayGpu);
  const candidates = [gt.recommendedGpu, ...gt.gpuModels].map(normModel).filter(Boolean) as string[];
  if (d && candidates.includes(d)) return true;
  // display model must at least satisfy the min VRAM class
  if (gt.minVram != null) {
    const MODEL_VRAM: Record<string, number> = {
      "B300": 288, B200: 180, H200: 141, H100: 80, "RTX Pro 6000": 96, "RTX 6000 Ada": 48,
      A100: 80, L40S: 48, L40: 48, A40: 48, "RTX A6000": 48, "RTX A5000": 24, L4: 24,
      A10: 24, T4: 16, "RTX 5090": 32, "RTX 4090": 24, "RTX 3090 Ti": 24, "RTX 3090": 24,
      "RTX 3080": 10, MI300X: 192,
    };
    const v = d ? MODEL_VRAM[d] : undefined;
    return v != null && gt.minVram <= v;
  }
  return false;
}

// ---------- main ----------
interface Row {
  netuid: number;
  name: string;
  repo: string | null;
  repoLayer: "curated-miner" | "override" | "chain" | "none";
  gtMinCompute: MinComputeGT | null;
  readmeEvidence: string[];
  readmeVram: number | null;
  display: { minVramGb: number | null; recommendedGpu: string | null; gpuSource: string };
  scrapeDebug: { minVramGb: number | null; recommendedGpu: string | null; error?: string };
  verdict: "OK" | "MISMATCH" | "ESTIMATE" | "NO-REPO" | "ERROR";
  reason: string;
}

async function auditSubnet(
  snap: { netuid: number; name: string; identityGithub: string | null; identityDescription: string | null; minerEmissionTaoPerDay: number },
  ovr: { githubUrl: string | null } | null
): Promise<Row> {
  const base: Row = {
    netuid: snap.netuid, name: snap.name, repo: null, repoLayer: "none",
    gtMinCompute: null, readmeEvidence: [], readmeVram: null,
    display: { minVramGb: null, recommendedGpu: null, gpuSource: "curated" },
    scrapeDebug: { minVramGb: null, recommendedGpu: null }, verdict: "ERROR", reason: "",
  };

  // repo resolution — same precedence as buildProfile
  let repoUrl = snap.identityGithub;
  let repoLayer: Row["repoLayer"] = snap.identityGithub ? "chain" : "none";
  if (ovr?.githubUrl) { repoUrl = ovr.githubUrl; repoLayer = "override"; }
  const curated = CURATED_MINER_REPOS[snap.netuid];
  if (curated) { repoUrl = curated; repoLayer = "curated-miner"; }
  if (!repoUrl) {
    // classify what the app would show with no repo
    const hw = classifySubnetHardware(snap.name, snap.identityDescription, {
      fallbackMonthlyUsd: snap.minerEmissionTaoPerDay ? snap.minerEmissionTaoPerDay * 730 : undefined,
    });
    base.display = { minVramGb: hw.minVramGb, recommendedGpu: hw.recommendedGpu, gpuSource: hw.classified ? "classifier" : "revenue-est" };
    return { ...base, verdict: "NO-REPO", reason: "No GitHub repo on-chain — display falls back to the work-type classifier estimate" };
  }

  const m = repoUrl.replace(/^https?:\/\//, "").match(/^github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!m) return { ...base, repo: repoUrl, repoLayer, verdict: "ERROR", reason: `Unparseable repo URL: ${repoUrl}` };
  const owner = m[1], repo = m[2].replace(/\.git$/, "");
  base.repo = `https://github.com/${owner}/${repo}`;

  // --- ground truth layer ---
  const mc = await fetchMinCompute(owner, repo);
  base.gtMinCompute = mc ? parseMinCompute(mc.raw, `https://github.com/${owner}/${repo}/blob/${mc.branch}/${mc.path}`) : null;
  const readme = await fetchReadme(owner, repo);
  if (readme) {
    base.readmeEvidence = readmeGpuEvidence(readme);
    base.readmeVram = readmeVramEvidence(readme);
  }

  // --- display layer (the app's exact code path) ---
  const scraped = await scrapeGithubMetadata(`https://github.com/${owner}/${repo}`, { netuid: snap.netuid });
  base.scrapeDebug = { minVramGb: scraped.minVramGb, recommendedGpu: scraped.recommendedGpu, error: scraped.error };
  const hw = classifySubnetHardware(snap.name, snap.identityDescription, {
    fallbackVramGb: scraped.minVramGb ?? undefined,
    fallbackGpu: scraped.recommendedGpu ?? undefined,
    fallbackMonthlyUsd: snap.minerEmissionTaoPerDay ? snap.minerEmissionTaoPerDay * 730 : undefined,
  });
  let minVramGb = hw.minVramGb;
  let recommendedGpu = hw.recommendedGpu;
  let gpuSource: string = "curated";
  if (scraped.minVramGb || scraped.recommendedGpu) {
    minVramGb = scraped.minVramGb ?? minVramGb;
    recommendedGpu = scraped.recommendedGpu ?? recommendedGpu;
    gpuSource = "repo";
  } else if (hw.classified) gpuSource = "classifier";
  else if (snap.minerEmissionTaoPerDay != null) gpuSource = "revenue-est";
  base.display = { minVramGb, recommendedGpu, gpuSource };

  // --- verdict ---
  if (base.gtMinCompute) {
    const gt = base.gtMinCompute;
    if (gpuSource !== "repo") {
      base.verdict = "MISMATCH";
      base.reason = `repo has min_compute.yml (min_vram=${gt.minVram}, rec_gpu=${gt.recommendedGpu}) but display is ${gpuSource}-guessed (${recommendedGpu ?? "none"})`;
    } else if (gt.minVram != null && minVramGb !== gt.minVram) {
      base.verdict = "MISMATCH";
      base.reason = `displayed min VRAM ${minVramGb} != min_compute.yml min_vram ${gt.minVram}`;
    } else if (!compatible(recommendedGpu, gt)) {
      base.verdict = "MISMATCH";
      base.reason = `displayed GPU "${recommendedGpu}" incompatible with min_compute.yml spec (min_vram=${gt.minVram}, rec_gpu=${gt.recommendedGpu}, models=${gt.gpuModels.join("/") || "n/a"})`;
    } else {
      base.verdict = "OK";
      base.reason = `matches min_compute.yml (min_vram=${gt.minVram}, rec_gpu=${gt.recommendedGpu ?? "n/a"})`;
    }
  } else if (base.readmeEvidence.length || base.readmeVram) {
    // no CDL file — README is the best ground truth; flag clear contradictions
    const evidenceModels = [...new Set(base.readmeEvidence.map((l) => normModel(l)).filter(Boolean))] as string[];
    const dispModel = normModel(recommendedGpu);
    if (gpuSource !== "repo") {
      const single = evidenceModels.length === 1 ? evidenceModels[0] : null;
      if (single && dispModel && single !== dispModel) {
        base.verdict = "MISMATCH";
        base.reason = `README states ${single} ("${base.readmeEvidence[0].slice(0, 120)}") but display is ${gpuSource}-guessed ${dispModel}`;
      } else {
        base.verdict = "ESTIMATE";
        base.reason = `no min_compute.yml; README evidence (${evidenceModels.join("/") || "VRAM only"}) not reflected by display (${gpuSource})`;
      }
    } else {
      base.verdict = "OK";
      base.reason = `repo-sourced (${dispModel ?? `VRAM ${minVramGb}`}); README evidence: ${evidenceModels.join("/") || `VRAM ${base.readmeVram}`}`;
    }
  } else if (scraped.source === "github" && (scraped.minVramGb || scraped.recommendedGpu)) {
    base.verdict = "OK";
    base.reason = "repo-sourced (no explicit CDL/README GPU line detected by audit parser — scraper found GPU text)";
  } else if (scraped.source === "error") {
    base.verdict = "ERROR";
    base.reason = `scrape failed: ${scraped.error} — display is ${gpuSource} estimate`;
  } else {
    base.verdict = "ESTIMATE";
    base.reason = `no GPU ground truth found in repo — display is ${gpuSource} estimate`;
  }
  return base;
}

async function main() {
  const snapRow = await db.chainSnapshot.findFirst({ orderBy: { id: "desc" } });
  const subnets = (JSON.parse(snapRow!.subnetsJson) as any[]).filter((s) => s.netuid >= 1);
  const overrides = await db.subnetOverride.findMany();
  const ovrBy = new Map(overrides.map((o) => [o.netuid, o]));

  const results: Row[] = [];
  const CONC = 6;
  const queue = [...subnets];
  let done = 0;
  async function worker() {
    while (queue.length) {
      const s = queue.shift()!;
      try {
        const row = await auditSubnet(s, ovrBy.get(s.netuid) ?? null);
        results.push(row);
      } catch (e) {
        results.push({
          netuid: s.netuid, name: s.name, repo: null, repoLayer: "none",
          gtMinCompute: null, readmeEvidence: [], readmeVram: null,
          display: { minVramGb: null, recommendedGpu: null, gpuSource: "?" },
          scrapeDebug: { minVramGb: null, recommendedGpu: null },
          verdict: "ERROR", reason: `audit exception: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
      done++;
      if (done % 10 === 0) console.error(`progress: ${done}/${subnets.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));

  results.sort((a, b) => a.netuid - b.netuid);
  writeFileSync("/home/z/my-project/scripts/gpu-audit/audit-results.json", JSON.stringify(results, null, 2));

  const counts = { OK: 0, MISMATCH: 0, ESTIMATE: 0, "NO-REPO": 0, ERROR: 0 } as Record<string, number>;
  for (const r of results) counts[r.verdict]++;
  console.log("\n=== VERDICT SUMMARY ===");
  console.log(JSON.stringify(counts));
  console.log("\n=== MISMATCHES ===");
  for (const r of results.filter((x) => x.verdict === "MISMATCH")) {
    console.log(`SN${r.netuid} ${r.name}: ${r.reason}\n   display: GPU=${r.display.recommendedGpu} vram=${r.display.minVramGb} src=${r.display.gpuSource} | repo=${r.repo}`);
  }
  console.log("\n=== ERRORS ===");
  for (const r of results.filter((x) => x.verdict === "ERROR")) {
    console.log(`SN${r.netuid} ${r.name}: ${r.reason} | repo=${r.repo}`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch((e) => { console.error(e); process.exit(1); });
