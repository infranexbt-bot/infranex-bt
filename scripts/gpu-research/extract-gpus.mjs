/**
 * INFRANEX GPU research — Step 3: GPU extraction from READMEs + code files.
 * Canonical GPU model detection, VRAM minimums, miner/validator context
 * classification, evidence quotes. -> subnet-evidence.json
 */
import fs from "fs";

const DIR = "/home/z/my-project/scripts/gpu-research";
const RAW = `${DIR}/raw`;
const dataset = JSON.parse(fs.readFileSync(`${DIR}/dataset.json`, "utf8"));
const taostat = JSON.parse(fs.readFileSync(`${DIR}/taostat-subnets.json`, "utf8"));
const taostatByIndex = Array.isArray(taostat) ? taostat : Object.values(taostat);

// ---------- GPU catalog ----------
// pattern matches are applied per-line; canon is the ranking key
const GPU_PATTERNS = [
  { canon: "NVIDIA B200 / GB200", res: [/\bGB200\s?(NVL)?\b/i, /\bB200\b(?!\d)/i] },
  { canon: "NVIDIA RTX PRO 6000", res: [/\bRTX\s*PRO\s*6000\b/i] },
  { canon: "NVIDIA RTX 6000 Ada", res: [/\bRTX\s*6000\s*Ada\b/i] },
  { canon: "NVIDIA RTX A5000", res: [/\bRTX\s*A5000\b/i] },
  { canon: "NVIDIA RTX A4000", res: [/\bRTX\s*A4000\b/i] },
  { canon: "NVIDIA GTX 1660 family", res: [/\bGTX\s*1660\s*(SUPER|Super|Ti)?\b/i] },
  { canon: "NVIDIA H200", res: [/\bH\s?200\s?(NVL)?\b/i] },
  { canon: "NVIDIA H100", res: [/\bH\s?100\s?(NVL|PCIe|SXM)?\b/i] },
  { canon: "NVIDIA H800", res: [/\bH\s?800\b/i] },
  { canon: "NVIDIA H20", res: [/\bH\s?20\b(?!\d)/i], gated: true },
  { canon: "NVIDIA A100", res: [/\bA\s?100\s?(SXM|PCIe|80GB|40GB)?\b/i] },
  { canon: "NVIDIA A800", res: [/\bA\s?800\b/i] },
  { canon: "NVIDIA A60 / A6000", res: [/\b(RTX\s*)?A6000\b/i, /\bA60\b(?![0-9])/i] },
  { canon: "NVIDIA A40", res: [/\bA40\b(?![0-9])/i], gated: true },
  { canon: "NVIDIA L40S", res: [/\bL40S\b/i] },
  { canon: "NVIDIA L40", res: [/\bL40\b(?!S)/i], gated: true },
  { canon: "NVIDIA L4", res: [/\bL4\b(?!0)/i], gated: true },
  { canon: "NVIDIA V100", res: [/\bV\s?100\b/i], gated: true },
  { canon: "NVIDIA T4", res: [/\bT4\b/i], gated: true },
  { canon: "NVIDIA P40", res: [/\bP\s?40\b/i], gated: true },
  { canon: "NVIDIA P100", res: [/\bP\s?100\b/i], gated: true },
  { canon: "NVIDIA RTX 5090", res: [/\bRTX\s*5090\b/i, /\b5090\b(?!\d)/i] },
  { canon: "NVIDIA RTX 5080", res: [/\bRTX\s*5080\b/i, /\b5080\b(?!\d)/i] },
  { canon: "NVIDIA RTX 4090", res: [/\bRTX\s*4090D?\b/i, /\b4090\b(?!\d)/i] },
  { canon: "NVIDIA RTX 4080", res: [/\bRTX\s*4080\b/i, /\b4080\b(?!\d)/i] },
  { canon: "NVIDIA RTX 4070 family", res: [/\bRTX\s*4070\s*(Ti\s*(SUPER|Super)?|SUPER|Super|Ti)?\b/i, /\b4070\b(?!\d)/i] },
  { canon: "NVIDIA RTX 4060 family", res: [/\bRTX\s*4060\s*(Ti|SUPER|Super|Ti\s*(SUPER|Super)?)?\b/i, /\b4060\b(?!\d)/i] },
  { canon: "NVIDIA RTX 3090", res: [/\bRTX\s*3090\s*Ti?\b/i, /\b3090\b(?!\d)/i] },
  { canon: "NVIDIA RTX 3080", res: [/\bRTX\s*3080\s*Ti?\b/i, /\b3080\b(?!\d)/i] },
  { canon: "NVIDIA RTX 3070", res: [/\bRTX\s*3070\b/i, /\b3070\b(?!\d)/i], gated: true },
  { canon: "NVIDIA RTX 3060", res: [/\bRTX\s*3060\b/i, /\b3060\b(?!\d)/i], gated: true },
  { canon: "NVIDIA RTX 2080 Ti", res: [/\bRTX\s*2080\s*Ti?\b/i, /\b2080\s?Ti\b/i], gated: true },
  { canon: "NVIDIA GTX 1080 Ti", res: [/\bGTX\s*1080\s*Ti?\b/i, /\b1080\s?Ti\b/i], gated: true },
  { canon: "AMD MI325X / MI300X", res: [/\bMI325X\b/i, /\bMI300X\b/i] },
  { canon: "AMD RX 7900 XTX", res: [/\b7900\s?XTX\b/i], gated: true },
  { canon: "Apple Silicon", res: [/\bM[1-4]\s?(Max|Ultra|Pro)\b/i, /Apple\s+Silicon/i], gated: true },
];

// gates: T4/P40/V100 etc. only count when a GPU-ish word is near
const GATE_RE = /\b(gpu|cuda|nvidia|vram|tesla|graphics|driver|device|tensor)\b/i;

const MINER_RE = /\b(miner|mining|run\s+(a\s+)?miner|miners?\s+(must|need|require|should)|hardware\s+(requirement|spec)|minimum\s+(hardware|requirement|spec)|system\s+requirement|get\s+started|setup|installation|install|deploy(ing)?\s+(a\s+)?(miner|subnet)|prerequisite)\b/i;
const VAL_RE = /\b(validator|validating|training|pretrain(ing)?|fine-?tun(ing)?|research\s+harness|model\s+training|dataset)\b/i;
const REQUIRE_RE = /\b(require[sd]?|need[sd]?|must|minimum|min\.?\s|at\s+least|least\s+\d|recommend(ed|s)?|support(ed|s)?|only|or\s+(higher|better|newer|above)|>=?|≥|GB\s*\+|\+\s*GB|GB)/i;

// ---------- min_compute.yml structured parser ----------
// parse compute_spec.miner.gpu / compute_spec.validator.gpu blocks
function parseMinCompute(text) {
  const out = { miner: null, validator: null };
  const lines = text.split(/\r?\n/);
  let role = null;
  let roleIndent = -1;
  let gpuIndent = -1;
  let cur = null;
  const newBlk = () => ({ required: null, minVram: null, recVram: null, recGpu: null, minCc: null });
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, ""); // strip comments
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)[0].length;
    const m = line.trim().match(/^([A-Za-z_][\w-]*):(.*)$/);
    if (!m) continue;
    const [, key, valRaw] = m;
    const val = valRaw.trim();

    if (roleIndent < 0) {
      if ((key === "miner" || key === "validator") && indent <= 4) {
        role = key; roleIndent = indent; gpuIndent = -1; cur = newBlk(); out[role] = cur;
      }
      continue;
    }
    // inside a role block
    if (indent <= roleIndent) {
      if ((key === "miner" || key === "validator") && indent === roleIndent) {
        role = key; gpuIndent = -1; cur = newBlk(); out[role] = cur;
      } else { role = null; roleIndent = -1; gpuIndent = -1; }
      continue;
    }
    if (gpuIndent < 0) {
      if (key === "gpu") gpuIndent = indent;
      continue;
    }
    if (indent <= gpuIndent) { gpuIndent = -1; continue; } // left gpu block
    if (key === "required") cur.required = /true/i.test(val) ? true : /false/i.test(val) ? false : null;
    else if (key === "min_vram") cur.minVram = parseFloat(val) || null;
    else if (key === "recommended_vram") cur.recVram = parseFloat(val) || null;
    else if (key === "recommended_gpu") cur.recGpu = val.replace(/^["']|["']$/g, "");
    else if (key === "min_compute_capability") cur.minCc = parseFloat(val) || null;
  }
  return out;
}

// ---------- helpers ----------
function detectGpusInLine(line) {
  const hits = [];
  for (const spec of GPU_PATTERNS) {
    for (const re of spec.res) {
      if (re.test(line)) {
        if (spec.gated && !GATE_RE.test(line)) continue;
        hits.push(spec.canon);
        break; // one canon per line per spec
      }
    }
  }
  return [...new Set(hits)];
}

function detectVramInLine(line) {
  const out = [];
  const re = /(\d{1,3})\s?GB\b/gi;
  let m;
  const gpuish = /\b(gpu|vram|memory|hbm|graphics)\b/i.test(line);
  while ((m = re.exec(line))) {
    const gb = parseInt(m[1], 10);
    if ([2,4,8,10,11,12,16,20,21,24,32,40,44,45,46,47,48,80,94,96,141,180,192].includes(gb) || (gpuish && gb >= 6 && gb <= 200)) {
      out.push(gb);
    }
  }
  return gpuish || /\b(gpu|vram|h100|h200|a100|4090|3090|a6000|l40)\b/i.test(line) ? out : [];
}

// split text into lines with running "current heading"
function scanText(text, file) {
  const events = [];
  const lines = text.split(/\r?\n/);
  let heading = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) heading = hm[2].trim();
    const gpus = detectGpusInLine(line);
    const vrams = detectVramInLine(line);
    if (!gpus.length && !vrams.length) continue;
    // context window: this line + neighbors (excluding markdown noise)
    const ctx = [lines[i - 2], lines[i - 1], line, lines[i + 1], lines[i + 2]]
      .filter(Boolean).join(" ").slice(0, 600);
    events.push({
      file,
      lineNo: i + 1,
      heading,
      gpus,
      vrams,
      minerCtx: MINER_RE.test(ctx) || MINER_RE.test(heading),
      valCtx: VAL_RE.test(ctx) || VAL_RE.test(heading),
      requireCtx: REQUIRE_RE.test(ctx),
      quote: line.replace(/[`*#>]/g, "").replace(/\s+/g, " ").trim().slice(0, 220),
    });
  }
  return events;
}

// ---------- per-subnet processing ----------
const results = [];
for (const s of dataset.subnets) {
  const f = `${RAW}/${s.netuid}.json`;
  if (!fs.existsSync(f)) continue;
  const rec = JSON.parse(fs.readFileSync(f, "utf8"));

  const events = [];
  if (rec.readme && rec.readmeStatus === "ok") events.push(...scanText(rec.readme, "README"));
  for (const [fname, content] of Object.entries(rec.codeFiles || {})) {
    if (/pyproject|setup\.py|requirements/.test(fname) && content.length < 20000) {
      events.push(...scanText(content, fname));
    } else if (/Dockerfile|docker-compose|\.env/.test(fname)) {
      events.push(...scanText(content, fname));
    }
  }

  // min_compute.yml structured requirements (miner-side by definition)
  let minCompute = null;
  if (rec.minComputePath && rec.codeFiles[rec.minComputePath]) {
    minCompute = parseMinCompute(rec.codeFiles[rec.minComputePath]);
    for (const role of ["miner", "validator"]) {
      const blk = minCompute && minCompute[role];
      if (!blk) continue;
      const gpuStr = blk.recGpu && !/^none|n\/a|^null$/i.test(blk.recGpu || "") ? blk.recGpu : "";
      const gpus = gpuStr ? detectGpusInLine(gpuStr) : [];
      if (blk.required === true || gpus.length || blk.minVram) {
        events.push({
          file: rec.minComputePath,
          lineNo: 0,
          heading: `min_compute.yml compute_spec.${role}.gpu`,
          gpus,
          vrams: blk.minVram ? [blk.minVram] : [],
          minerCtx: role === "miner",
          valCtx: role === "validator",
          requireCtx: true,
          quote: `required=${blk.required} min_vram=${blk.minVram ?? "-"} rec_vram=${blk.recVram ?? "-"} rec_gpu=${blk.recGpu ?? "-"}`,
        });
      }
    }
  }

  // dedupe per (gpu, file) keep strongest evidence (requireCtx then minerCtx then first)
  const perGpu = new Map();
  for (const ev of events) {
    for (const g of ev.gpus) {
      const prev = perGpu.get(g);
      const score = (ev.requireCtx ? 2 : 0) + (ev.minerCtx ? 1 : 0);
      if (!prev || score > prev.score) perGpu.set(g, { ...ev, gpu: g, score });
    }
  }
  // vram minimums: smallest "at least" number per file-group
  const vramMins = [];
  for (const ev of events) {
    for (const gb of ev.vrams) vramMins.push({ gb, quote: ev.quote, file: ev.file, requireCtx: ev.requireCtx });
  }
  const minVram = vramMins.filter((v) => v.requireCtx || v.file !== "README").map((v) => v.gb);
  const minVramGb = minVram.length ? Math.max(...minVram) : null; // requirement-context max = the binding constraint

  // taostat hw requirements cross-check
  const ts = taostatByIndex[s.netuid];
  const taostatHw = (ts && ts.hw_requirements) || null;

  results.push({
    netuid: s.netuid,
    name: s.name,
    githubUrl: s.githubUrl,
    githubSource: s.githubSource,
    readmeUrl: rec.readmeUrl || null,
    readmeStatus: rec.readmeStatus,
    recoveryNote: rec.recoveryNote || null,
    emissionTaoPerDay: s.emissionTaoPerDay,
    minerEmissionTaoPerDay: s.minerEmissionTaoPerDay,
    taoPriceUsd: s.taoPriceUsd,
    appGpuRequired: s.appGpuRequired,
    appMinVramGb: s.appMinVramGb,
    appCategory: s.appCategory,
    gpus: [...perGpu.values()].map(({ gpu, file, quote, minerCtx, valCtx, requireCtx, heading }) => ({
      gpu, file, quote, minerCtx, valCtx, requireCtx, heading: heading.slice(0, 80),
      // tier 1 = explicit requirement, tier 2 = miner-side supported/declared, tier 3 = generic mention
      tier: requireCtx && !valCtx ? 1 : minerCtx ? 2 : 3,
    })),
    minVramGb,
    vramMins: vramMins.slice(0, 6),
    minCompute: minCompute ? { miner: minCompute.miner, validator: minCompute.validator, path: rec.minComputePath } : null,
    taostatHw,
    mentionCount: events.length,
  });
}

fs.writeFileSync(`${DIR}/subnet-evidence.json`, JSON.stringify(results, null, 2));
const withMentions = results.filter((r) => r.gpus.length).length;
console.log(`subnet-evidence.json: ${results.length} subnets processed, ${withMentions} with GPU mentions`);
