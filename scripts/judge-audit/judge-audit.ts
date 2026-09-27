/**
 * judge-audit.ts — Validator Lab data-correctness audit.
 *
 * For all 129 subnets, mirrors EXACTLY what src/lib/infranex/judge/extract.ts
 * does (probe order, tree fallback, deadline mining), running the app's own
 * pure extractJudgeProfile() against repo inputs fetched from codeload
 * tarballs (rate-limit free). Then verifies:
 *
 *   A. GROUNDING   — every evidence quote exists verbatim in the repo file
 *   B. PROVENANCE  — profile classified from real validator code, README, or
 *                    archetype priors only
 *   C. DEADLINE    — which file/line produced deadlineMs (and is it plausible)
 *   D. REPO        — was a repo reachable at all
 *   E. CROSS-CHECK — judgeKind vs SUBNET_JOBS_SEED work type (soft heuristic)
 *
 * Verdicts: validator-code | readme-only | priors-only | no-repo | error
 * Flags:    UNGROUNDED_EVIDENCE, DEADLINE_FROM_README, SEED_CONTRADICTION
 *
 * Run: npx tsx scripts/judge-audit/judge-audit.ts
 */

import { readFileSync, writeFileSync } from "fs";
import {
  extractDeadlineMs,
  extractJudgeProfile,
  type JudgeInputs,
} from "../../src/lib/infranex/judge/extract";
import { DIMENSION_CATALOG } from "../../src/lib/infranex/judge/types";
import { SUBNET_JOBS_SEED } from "../../src/lib/infranex/subnet-jobs-seed";

// The app's probe order — copied verbatim from extract.ts (audit must mirror).
const VALIDATOR_PATHS = [
  "neurons/validator.py",
  "neurons/validators.py",
  "validator.py",
  "validators/validator.py",
  "neuron/validator.py",
  "src/validator.py",
  "validator/validator.py",
  "neurons/base/validator.py",
];
const README_PATHS = ["README.md", "readme.md", "README.rst"];

interface TarballRecord {
  status: string;
  error?: string;
  files: Record<string, string>;
  validator_paths_all: string[];
  total_files: number;
}
interface AuditInput {
  by_netuid: Record<string, { repo: string | null; data: TarballRecord | null }>;
}

// --- seed cross-check mapping (soft) ---------------------------------------
const SEED_KIND_HINTS: Array<[RegExp, string]> = [
  [/uptime|sla|availability|monitor/i, "uptime_sla"],
  [/latency|real[- ]time|low[- ]latency|speed|ping/i, "latency_race"],
  [/market|pricing|auction|bid|rental|marketplace|orderbook|clearing/i, "market_clearing"],
  [/resource|bandwidth|storage|sharing|efficient/i, "resource_fit"],
  [/quality|evaluat|benchmark|accura|correct/i, "quality_judge"],
];

function seedExpectedKind(entry: { category: string; minerWorkType: string; rewardBasis: string }): string | null {
  const text = `${entry.minerWorkType} ${entry.rewardBasis} ${entry.category}`;
  for (const [re, kind] of SEED_KIND_HINTS) if (re.test(text)) return kind;
  return null;
}

// --- mirror the app's input construction -----------------------------------
function mirrorAppInputs(rec: TarballRecord): { inputs: JudgeInputs; provenance: string } {
  const files: Record<string, string> = {};
  const avail = (p: string) => Object.keys(rec.files).find((k) => k === p || k.endsWith("/" + p));

  // 1. standard probe (first match wins — matches the app's `break outer`)
  let validatorFile: string | null = null;
  for (const path of VALIDATOR_PATHS) {
    const hit = avail(path);
    if (hit) {
      files[path] = rec.files[hit];
      validatorFile = path;
      break;
    }
  }

  // 2. README probe (same preference order)
  for (const path of README_PATHS) {
    const hit = avail(path);
    if (hit) {
      files[path] = rec.files[hit];
      break;
    }
  }

  // 3. tree fallback — same condition as the app
  let provenance = validatorFile ? "validator-code" : "no-validator-file";
  if (!Object.keys(files).some((p) => p.endsWith("validator.py"))) {
    const candidates = rec.validator_paths_all
      .filter((p) => p.endsWith(".py") && /validat/i.test(p))
      .filter((p) => !/scripts\/(start|run|launch)/i.test(p))
      .slice(0, 3);
    for (const path of candidates) {
      files[path] = rec.files[path];
      if (files[path]) {
        validatorFile = path;
        break;
      }
    }
    if (validatorFile) provenance = "validator-code-tree-fallback";
  }

  return {
    inputs: { files, tree: rec.validator_paths_all, sources: [], treeFailed: false },
    provenance,
  };
}

// --- deadline provenance (mirror of extractDeadlineMs with capture) --------
const TIMEOUT_NOISE_PATTERNS = [/wait\s*\(/i, /sleep\s*\(/i, /subprocess/i, /popen/i, /join\s*\(/i];

function deadlineProvenance(files: Record<string, string>): { file: string; line: string; ms: number } | null {
  for (const [file, content] of Object.entries(files)) {
    if (!file.endsWith(".py")) continue;
    for (const line of content.split("\n")) {
      if (!/timeout|deadline|time_limit|synapse/i.test(line)) continue;
      if (TIMEOUT_NOISE_PATTERNS.some((re) => re.test(line))) continue;
      const m = line.match(/(\d+(?:\.\d+)?)\s*(?:s\b|sec|seconds?)?/gi);
      if (!m) continue;
      for (const raw of m) {
        const n = parseFloat(raw);
        if (!Number.isFinite(n)) continue;
        if (n >= 1 && n <= 1800) return { file, line: line.trim().slice(0, 200), ms: Math.round(n * 1000) };
      }
    }
  }
  return null;
}

// --- main -------------------------------------------------------------------
interface SubnetVerdict {
  netuid: number;
  name: string;
  repo: string | null;
  verdict: string;
  judgeKind: string;
  confidence: number;
  deadlineMs: number | null;
  deadlineFrom: string | null;
  evidenceCount: number;
  groundedCount: number;
  ungrounded: string[];
  seedCategory: string | null;
  seedKind: string | null;
  seedNote: string;
  notes: string;
  /** audit detail — why unknown, where evidence came from */
  provenance: string;
  validatorFileUsed: string | null;
  validatorInTree: string[];
  codeHits: Record<string, number>;
  readmeHits: Record<string, number>;
  topEvidence: string[];
}

function main() {
  const audit = JSON.parse(readFileSync(__dirname + "/tarball-inputs.json", "utf8")) as AuditInput;
  const results: SubnetVerdict[] = [];

  for (let netuid = 0; netuid < 129; netuid++) {
    const entry = audit.by_netuid[String(netuid)];
    const seed = SUBNET_JOBS_SEED[netuid];
    const base: SubnetVerdict = {
      netuid,
      name: seed?.name ?? `Subnet ${netuid}`,
      repo: entry?.repo ?? null,
      verdict: "error",
      judgeKind: "unknown",
      confidence: 0,
      deadlineMs: null,
      deadlineFrom: null,
      evidenceCount: 0,
      groundedCount: 0,
      ungrounded: [],
      seedCategory: seed?.category ?? null,
      seedKind: seed ? seedExpectedKind(seed) : null,
      seedNote: "",
      notes: "",
    };

    if (!entry?.repo) {
      results.push({ ...base, verdict: "no-repo", notes: "no repo URL (no override, no curated seed)" });
      continue;
    }
    const rec = entry.data;
    if (!rec || rec.status !== "ok") {
      results.push({
        ...base,
        verdict: "no-repo",
        notes: `repo unreachable: ${rec?.error ?? rec?.status ?? "no data"}`,
      });
      continue;
    }

    const { inputs, provenance } = mirrorAppInputs(rec);
    const extracted = extractJudgeProfile(inputs, base.name);

    // instrumented hit counts (mirror of the extractor's scan)
    const codeHits: Record<string, number> = {};
    const readmeHits: Record<string, number> = {};
    for (const d of DIMENSION_CATALOG) {
      codeHits[d.key] = 0;
      readmeHits[d.key] = 0;
    }
    const lineMatches = (line: string, kw: string) =>
      new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(line);
    const noise = [/wait\s*\(/i, /sleep\s*\(/i, /subprocess/i, /popen/i, /join\s*\(/i];
    for (const [file, content] of Object.entries(inputs.files)) {
      const isCode = file.endsWith(".py");
      for (const raw of content.split("\n")) {
        const line = raw.trim();
        if (!line || line.length > 400) continue;
        if (isCode && noise.some((re) => re.test(line))) continue;
        for (const dim of DIMENSION_CATALOG) {
          const matched = dim.keywords.filter(
            (kw) => lineMatches(line, kw) && (isCode || !dim.codeOnlyKeywords?.includes(kw))
          );
          if (!matched.length) continue;
          const t = isCode ? codeHits : readmeHits;
          t[dim.key] += matched.length;
        }
      }
    }

    // grounding check
    let grounded = 0;
    const ungrounded: string[] = [];
    for (const dim of extracted.dimensions) {
      for (const ev of dim.evidence) {
        base.evidenceCount++;
        const content = inputs.files[ev.file];
        if (content && content.split("\n").some((l) => l.trim() === ev.line)) {
          grounded++;
        } else {
          ungrounded.push(`${dim.key}: "${ev.line.slice(0, 80)}" not in ${ev.file}`);
        }
      }
    }
    base.groundedCount = grounded;
    base.ungrounded = ungrounded.slice(0, 3);

    // deadline provenance
    base.deadlineMs = extracted.deadlineMs;
    if (extracted.deadlineMs) {
      const prov = deadlineProvenance(inputs.files);
      base.deadlineFrom = prov ? `${prov.file}: ${prov.line}` : "not reproduced";
    }

    base.judgeKind = extracted.judgeKind;
    base.confidence = extracted.confidence;
    base.verdict = provenance.startsWith("validator-code") ? "validator-code" : "readme-only";
    if (!Object.keys(inputs.files).length) base.verdict = "priors-only";
    base.provenance = provenance;
    base.validatorFileUsed = Object.keys(inputs.files).find((p) => p.endsWith(".py")) ?? null;
    base.validatorInTree = rec.validator_paths_all.slice(0, 8);
    base.codeHits = codeHits;
    base.readmeHits = readmeHits;
    base.topEvidence = extracted.dimensions
      .flatMap((d) => d.evidence.slice(0, 1).map((e) => `${d.key}: ${e.file} :: ${e.line.slice(0, 110)}`))
      .slice(0, 4);

    // soft seed cross-check
    if (base.seedKind && extracted.judgeKind !== "unknown") {
      base.seedNote =
        base.seedKind === extracted.judgeKind
          ? "consistent"
          : `seed suggests ${base.seedKind}, lab says ${extracted.judgeKind}`;
    } else {
      base.seedNote = "unverifiable (seed has no kind hint or lab unknown)";
    }

    results.push(base);
  }

  writeFileSync(__dirname + "/judge-audit-results.json", JSON.stringify(results, null, 2));

  // summary
  const by = (v: string) => results.filter((r) => r.verdict === v).length;
  const ungroundedTotal = results.filter((r) => r.ungrounded.length > 0).length;
  const kinds: Record<string, number> = {};
  for (const r of results) kinds[r.judgeKind] = (kinds[r.judgeKind] ?? 0) + 1;
  const contradictions = results.filter((r) => r.seedNote.startsWith("seed suggests")).length;
  const dlFromReadme = results.filter((r) => r.deadlineFrom?.startsWith("README")).length;

  console.log("=== JUDGE AUDIT SUMMARY ===");
  console.log(JSON.stringify({
    verdicts: {
      "validator-code": by("validator-code"),
      "readme-only": by("readme-only"),
      "priors-only": by("priors-only"),
      "no-repo": by("no-repo"),
      error: by("error"),
    },
    judgeKinds: kinds,
    ungroundedEvidenceSubnets: ungroundedTotal,
    seedContradictions: contradictions,
    deadlineFromReadme: dlFromReadme,
  }, null, 2));

  const worst = results.filter((r) => r.ungrounded.length > 0 || r.seedNote.startsWith("seed suggests"));
  console.log("\n=== FLAGS ===");
  for (const r of worst.slice(0, 40)) {
    console.log(`SN${r.netuid} ${r.name} [${r.verdict}] ${r.judgeKind} conf=${r.confidence}`);
    for (const u of r.ungrounded) console.log(`   UNGROUNDED ${u}`);
    if (r.seedNote.startsWith("seed suggests")) console.log(`   SEED: ${r.seedNote}`);
  }
}

main();
