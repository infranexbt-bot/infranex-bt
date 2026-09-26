/**
 * audit-verify.ts — GPU-TAXONOMY final verification pass.
 *
 * Re-checks every subnet AFTER the scraper fixes:
 *   GT layer   : raw min_compute.yml → the app's OWN parseMinComputeSpec
 *                (single source of truth) + README GPU evidence lines.
 *   Display    : SubnetOverride row (what the Subnet Ledger / opportunity
 *                views show) — refreshed by rescrape-parallel.ts.
 *   Verdicts   : OK | MISMATCH | ESTIMATE (no GT) | NO-REPO | ERROR
 *
 * Run: npx tsx scripts/gpu-audit/audit-verify.ts
 */

import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import {
  parseMinComputeSpec,
  CURATED_MINER_REPOS,
  CURATED_GPU_SPECS,
} from "../../src/lib/infranex/github-scraper";
import { vramForGpuModel } from "../../src/lib/infranex/miner-score";

const db = new PrismaClient();

async function fetchRaw(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "infranex-audit/1.0" }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function normRepo(u: string | null): string | null {
  if (!u) return null;
  const t = u.trim().replace(/\/+$/, "");
  const m = t.replace(/^https?:\/\//, "").match(/^(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)/i)
    ?? (/(^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*)$/.test(t) ? t.match(/^([^/]+)\/(.+)$/) : null);
  if (!m) return null;
  return `https://github.com/${m[1]}/${m[2].replace(/\.git$/, "")}`;
}

const MODEL_RES: Array<[RegExp, string]> = [
  [/\b(B300|B200|H200|H100|A100|L40S|L40|A40|A6000|A5000|L4|A10|T4|MI300X|H800|A800)\b/i, "$1"],
  [/\b(RTX\s*PRO\s*6000|RTX\s*6000\s*ADA|RTX\s*5090|RTX\s*4090|RTX\s*3090\s*TI|RTX\s*3090|RTX\s*3080|GTX\s*1660\s*SUPER|GTX\s*1660)\b/i, "$1"],
];

function readmeGpuEvidence(readme: string): string[] {
  const hits: string[] = [];
  for (const line of readme.split("\n")) {
    if (/variety|from .* to |such as|e\.g\.|etc\./i.test(line)) continue;
    if (!/(require|minimum|supported|validated|must|need|recommend|hardware|spec)/i.test(line)) continue;
    for (const [re] of MODEL_RES) {
      if (re.test(line)) { hits.push(line.trim().replace(/[#*`>]/g, "").slice(0, 160)); break; }
    }
  }
  return [...new Set(hits)].slice(0, 6);
}

async function fetchReadmeFast(owner: string, repo: string): Promise<string | null> {
  for (const path of ["README.md", "readme.md", "AGENTS.md", "docs/MINING.md"]) {
    const raw = await fetchRaw(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`);
    if (raw) return raw;
  }
  return null;
}

interface Row {
  netuid: number;
  name: string;
  repo: string | null;
  verdict: "OK" | "MISMATCH" | "ESTIMATE" | "NO-REPO" | "ERROR";
  reason: string;
  display: { gpu: string | null; vram: number | null };
  gt: { cdGpu: string | null; cdVram: number | null; cdCpuOnly: boolean; cdQpu: boolean; cdBoilerplate: boolean } | null;
  readmeEvidence: string[];
}

async function main() {
  const snapRow = await db.chainSnapshot.findFirst({ orderBy: { id: "desc" } });
  const subnets = (JSON.parse(snapRow!.subnetsJson) as any[]).filter((s) => s.netuid >= 1);
  const overrides = await db.subnetOverride.findMany();
  const ovrBy = new Map(overrides.map((o) => [o.netuid, o]));

  const rows: Row[] = [];
  const queue = [...subnets];

  async function worker() {
    while (queue.length) {
      const s = queue.shift()!;
      const ovr = ovrBy.get(s.netuid);
      const row: Row = {
        netuid: s.netuid, name: s.name, repo: null,
        verdict: "ERROR", reason: "",
        display: { gpu: ovr?.recommendedGpu ?? null, vram: ovr?.minVramGb ?? null },
        gt: null, readmeEvidence: [],
      };

      let repoUrl = normRepo(s.identityGithub);
      if (ovr?.githubUrl) { const o = normRepo(ovr.githubUrl); if (o) repoUrl = o; }
      if (CURATED_MINER_REPOS[s.netuid]) repoUrl = normRepo(CURATED_MINER_REPOS[s.netuid]);
      if (!repoUrl || repoUrl === "https://github.com/0x/0x") {
        row.verdict = "NO-REPO";
        row.reason = "no usable repo on-chain (parked/for-sale) — display is a labeled classifier/revenue estimate";
        rows.push(row);
        continue;
      }
      row.repo = repoUrl;
      const m = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/)!;
      const [, owner, repo] = m;

      // GT: official CDL file via the app's own parser
      const mcRaw =
        (await fetchRaw(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/min_compute.yml`)) ??
        (await fetchRaw(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/min_compute.yaml`));
      if (mcRaw) {
        const spec = parseMinComputeSpec(mcRaw, "gt");
        // boilerplate detector mirrors the parser: null spec + file HAS a gpu block = boilerplate/empty
        row.gt = spec
          ? { cdGpu: spec.recommendedGpu, cdVram: spec.minVramGb, cdCpuOnly: spec.cpuOnly, cdQpu: spec.qpuRequired, cdBoilerplate: false }
          : { cdGpu: null, cdVram: null, cdCpuOnly: false, cdQpu: false, cdBoilerplate: /gpu\s*:/.test(mcRaw) };
      }
      const readme = await fetchReadmeFast(owner, repo);
      if (readme) row.readmeEvidence = readmeGpuEvidence(readme);

      // --- verdict ---
      const gt = row.gt;
      const d = row.display;
      const dispModel = d.gpu && !/cpu-only|qpu/i.test(d.gpu) ? d.gpu : null;
      if (gt?.cdCpuOnly || gt?.cdQpu) {
        if (dispModel == null && (d.vram === 0 || d.vram == null)) {
          row.verdict = "OK";
          row.reason = gt.cdQpu ? "QPU (no GPU) per official min_compute.yml" : "CPU-only per official min_compute.yml (gpu.required: False)";
        } else {
          row.verdict = "MISMATCH";
          row.reason = `min_compute.yml declares no-GPU but display shows "${d.gpu}" / vram ${d.vram}`;
        }
      } else if (gt && (gt.cdGpu || gt.cdVram != null)) {
        const okGpu = !gt.cdGpu || (dispModel != null && compatible(dispModel, gt.cdGpu, gt.cdVram));
        const okVram = gt.cdVram == null || d.vram === gt.cdVram;
        if (okGpu && okVram) {
          row.verdict = "OK";
          row.reason = `matches min_compute.yml (min_vram=${gt.cdVram ?? "n/a"}, rec_gpu=${gt.cdGpu ?? "n/a"})`;
        } else {
          row.verdict = "MISMATCH";
          row.reason = `display "${d.gpu}" / vram ${d.vram} vs min_compute.yml (min_vram=${gt.cdVram}, rec_gpu=${gt.cdGpu})`;
        }
      } else if (gt?.cdBoilerplate) {
        row.verdict = dispModel || d.vram ? "ESTIMATE" : "OK";
        row.reason = "min_compute.yml is unmodified template boilerplate (no info) — display from README/classifier estimate";
      } else if (CURATED_GPU_SPECS[s.netuid]) {
        // GPU-TAXONOMY 2: hand-verified repo-doc spec counts as ground truth.
        const c = CURATED_GPU_SPECS[s.netuid];
        if ((c.minVramGb ?? -1) === 0) {
          const okCpu = dispModel == null && (d.vram === 0 || d.vram == null);
          row.verdict = okCpu ? "OK" : "MISMATCH";
          row.reason = okCpu
            ? `CPU-only per hand-verified repo docs (${c.sourceFile})`
            : `docs say no GPU required (${c.sourceFile}) but display shows "${d.gpu}" / vram ${d.vram}`;
        } else {
          const okVram = c.minVramGb == null || d.vram === c.minVramGb;
          const okGpu = dispModel != null && compatible(dispModel, c.recommendedGpu, c.minVramGb);
          row.verdict = okGpu && okVram ? "OK" : "MISMATCH";
          if (row.verdict === "OK") {
            row.reason = `matches hand-verified repo docs (${c.sourceFile}): "${c.quote.slice(0, 80)}"`;
          } else {
            row.reason = `display "${d.gpu}" / vram ${d.vram} vs curated docs spec (min_vram=${c.minVramGb}, gpu=${c.recommendedGpu})`;
          }
        }
      } else if (row.readmeEvidence.length) {
        row.verdict = dispModel ? "OK" : "ESTIMATE";
        row.reason = dispModel
          ? `repo-sourced "${dispModel}"; README evidence: "${row.readmeEvidence[0].slice(0, 100)}"`
          : `README states GPU evidence but display is empty/estimate: "${row.readmeEvidence[0].slice(0, 100)}"`;
      } else if (d.gpu || d.vram != null) {
        row.verdict = "ESTIMATE";
        row.reason = `no machine-readable GT in repo — display is a labeled estimate (${d.gpu}, vram ${d.vram})`;
      } else {
        row.verdict = "ESTIMATE";
        row.reason = "no GPU info available anywhere — display honestly empty/estimate";
      }
      rows.push(row);
    }
  }

  function compatible(display: string, cdGpu: string | null, cdVram: number | null): boolean {
    const d = display.toLowerCase();
    const g = (cdGpu ?? "").toLowerCase();
    const vram = vramForGpuModel(display);
    if (g && (g.includes(d) || d.includes(g.replace(/^nvidia\s+/, "")))) return true;
    if (cdVram != null && vram != null) return cdVram <= vram;
    return vram != null && (cdVram == null || cdVram <= vram);
  }

  await Promise.all(Array.from({ length: 6 }, worker));
  rows.sort((a, b) => a.netuid - b.netuid);
  writeFileSync("/home/z/my-project/scripts/gpu-audit/verify-results.json", JSON.stringify(rows, null, 2));

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  console.log("SUMMARY:", JSON.stringify(counts));
  console.log("\n=== MISMATCH / ERROR ===");
  for (const r of rows.filter((x) => x.verdict === "MISMATCH" || x.verdict === "ERROR")) {
    console.log(`SN${r.netuid} ${r.name}: ${r.reason} | display: ${r.display.gpu} / ${r.display.vram}`);
  }
  await db.$disconnect();
}

main().catch(async (e) => { console.error(e); process.exit(1); });
