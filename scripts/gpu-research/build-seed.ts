/**
 * GPU-RESEARCH SEED GENERATOR — merges three evidence layers into the
 * typed seed module consumed by the Subnet GPU Requirements Research page:
 *
 *   1. scripts/gpu-research/audit-raw.json — fresh repo-level tarball scan
 *      (READMEs, min_compute.yml declarations, Docker files) run today.
 *   2. CURATED_GPU_SPECS from src/lib/infranex/github-scraper.ts —
 *      hand-verified specs quoted from deep repo docs / official pages.
 *   3. DB subnetOverride — the platform's persisted README scrape (older
 *      README revisions; models / CPU-only markers / VRAM floors).
 *   4. scripts/gpu-research/repo-list.json — netuids, chain names, repos.
 *
 * Output: src/lib/infranex/gpu-research-seed.ts (client-safe, static).
 *
 * Run: npx tsx scripts/gpu-research/build-seed.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { CURATED_GPU_SPECS } from "../../src/lib/infranex/github-scraper";
import { OVERRIDES } from "../../src/lib/infranex/gpu-landscape";

const HERE = import.meta.dirname ?? new URL(".", import.meta.url).pathname;

interface RawArtifact {
  path: string;
  models: Record<string, number>;
  quotes: Record<string, string>;
  cpuOnly: boolean;
  qpu: boolean;
  gpuCount: number | null;
  vramFloor: number | null;
  baseImages: string[];
  lines: number;
}
interface RawRow {
  netuid: number;
  name: string | null;
  repo: string | null;
  artifacts: { readme?: RawArtifact[]; min_compute?: RawArtifact[]; docker?: RawArtifact[] } | null;
  filesScanned: string[] | null;
  error: string | null;
}

const MODEL_CLASS: Record<string, "datacenter" | "pro" | "consumer"> = {
  H200: "datacenter", H100: "datacenter", GH200: "datacenter", B200: "datacenter",
  B300: "datacenter", GB200: "datacenter", A100: "datacenter", A800: "datacenter",
  H800: "datacenter", H20: "datacenter", MI325X: "datacenter", MI300X: "datacenter",
  "RTX PRO 6000": "pro", "RTX 6000 Ada": "pro", L40S: "pro", L40: "pro", L4: "pro",
  A6000: "pro", A5000: "pro",
  "RTX 5090": "consumer", "RTX 5080": "consumer", "RTX 4090": "consumer",
  "RTX 3090 Ti": "consumer", "RTX 3090": "consumer", A10G: "consumer", A10: "consumer",
  V100: "consumer", T4: "consumer",
};
const CLASS_ORDER = { datacenter: 0, pro: 1, consumer: 2 } as const;

const raw: RawRow[] = JSON.parse(readFileSync(join(HERE, "audit-raw.json"), "utf8"));
const list: { netuid: number; name: string | null; gh: string | null }[] = JSON.parse(
  readFileSync(join(HERE, "repo-list.json"), "utf8")
);
const listById = new Map(list.map((e) => [e.netuid, e]));

// DB layer — the platform's persisted scrape (README snapshots from earlier
// revisions; every string was extracted from a subnet repo at scrape time).
const dbRows: { netuid: number; recommendedGpu: string | null; minVramGb: number | null; gpuCount: number | null }[] = [];
const dbById = new Map(dbRows.map((r) => [r.netuid, r]));
const pbRows: { netuid: number; hardwareRec: string | null }[] = [];
const pbById = new Map(pbRows.map((r) => [r.netuid, r]));
const CPU_ONLY_DB_RE = /^none\s*\(|cpu[- ]only|no gpu/i;
const UNSPECIFIED_RE = /gpu required|unspecified|not (?:be )?(?:named|specified)|verify with/i;
const BAN_RE = /excluded|banned|not\s*(?:allowed|supported|accepted)/i;
const PB_CPU_ONLY_RE = /no (?:dedicated )?gpu|cpu[- ]only|needs no gpu|without (?:a )?gpu|no gpu or heavy/i;

// Per-subnet audit nuances the regexes cannot see — wording copied from the
// platform's hand-verified OVERRIDES (gpu-landscape.ts) plus audit-specific
// entries. Applied last: these win over any inferred class/headline.
const AUDIT_OVERRIDES: Record<number, { cls: SeedRow["cls"] | null; headline?: string }> = {
  1: {
    cls: null,
    headline:
      "No fixed GPU floor in repo — compute is competition-dependent (CPU + LLM-agent workflows; some competitions want GPUs).",
  },
};
function overrideCls(netuid: number): { cls: SeedRow["cls"] | null; headline?: string } | null {
  if (AUDIT_OVERRIDES[netuid]) return AUDIT_OVERRIDES[netuid];
  const ov = OVERRIDES[netuid];
  if (!ov) return null;
  const specialMap: Record<string, SeedRow["cls"]> = {
    banned: "consumer", // realistic entry is 4090-class; note explains the ban
    fallback: "datacenter", // DC SKU is the scored target
    unspecified: "unverified",
    quantum: "quantum",
    unverified: "unverified",
    "cpu-only": "cpu-only",
  };
  return {
    cls: ov.classes.length
      ? (ov.classes[0] as SeedRow["cls"])
      : ov.special
        ? (specialMap[ov.special] ?? null)
        : null,
    headline: ov.note,
  };
}

async function loadDb() {
  const db = new PrismaClient();
  const rows = await db.subnetOverride.findMany({
    select: { netuid: true, recommendedGpu: true, minVramGb: true, gpuCount: true },
  });
  const pb = await db.subnetPlaybook.findMany({
    select: { netuid: true, hardwareRec: true },
  });
  await db.$disconnect();
  for (const r of rows) {
    dbRows.push(r);
    dbById.set(r.netuid, r);
  }
  for (const r of pb) {
    pbRows.push(r);
    pbById.set(r.netuid, r);
  }
}

function mergeArtifact(files: RawArtifact[]) {
  const models: Record<string, number> = {};
  const quotes: Record<string, string> = {};
  let cpuOnly = false;
  let qpu = false;
  let gpuCount: number | null = null;
  let vramFloor: number | null = null;
  let strongest: { path: string; hits: number } | null = null;
  for (const f of files) {
    for (const [k, n] of Object.entries(f.models)) {
      models[k] = (models[k] ?? 0) + n;
      if (!quotes[k]) quotes[k] = f.quotes[k] ?? "";
    }
    cpuOnly = cpuOnly || f.cpuOnly;
    qpu = qpu || f.qpu;
    if (f.gpuCount != null && gpuCount == null) gpuCount = f.gpuCount;
    if (f.vramFloor != null) vramFloor = vramFloor == null ? f.vramFloor : Math.max(vramFloor, f.vramFloor);
    const hits = Object.values(f.models).reduce((a, b) => a + b, 0);
    if (hits > (strongest?.hits ?? 0)) strongest = { path: f.path, hits };
  }
  return { models, quotes, cpuOnly, qpu, gpuCount, vramFloor, strongest };
}

function mergeGenericGpu(files: RawArtifact[]) {
  return files.reduce((acc, f) => acc + (f.genericGpuLines ?? 0), 0);
}

interface SeedArtifact {
  files: number;
  models: Record<string, number>;
  quote: string | null;
  baseImages?: string[];
}
interface SeedRow {
  netuid: number;
  name: string;
  repo: string | null;
  status: "repo-scan" | "curated-docs" | "no-repo" | "repo-offline" | "root";
  cls: "datacenter" | "pro" | "consumer" | "cpu-only" | "quantum" | "unverified";
  models: string[];
  classes: string[];
  headline: string;
  gpuCount: number | null;
  vramFloor: number | null;
  artifacts: { readme?: SeedArtifact; min_compute?: SeedArtifact; docker?: SeedArtifact };
  curated: { spec: string; sourceFile: string; quote: string } | null;
  evidence: string | null;
}

void (async () => {
await loadDb();
await build();
})();

async function build() {
const rows: SeedRow[] = [];

for (const r of raw) {
  const listRow = listById.get(r.netuid);
  const name =
    r.netuid === 0 ? "Root Network" : (r.name ?? listRow?.name ?? `Subnet ${r.netuid}`);

  const readme = r.artifacts?.readme?.length ? mergeArtifact(r.artifacts.readme) : null;
  const minc = r.artifacts?.min_compute?.length ? mergeArtifact(r.artifacts.min_compute) : null;
  const dock = r.artifacts?.docker?.length ? mergeArtifact(r.artifacts.docker) : null;

  const curatedSpec = CURATED_GPU_SPECS[r.netuid];
  const curated = curatedSpec
    ? { spec: curatedSpec.recommendedGpu, sourceFile: curatedSpec.sourceFile, quote: curatedSpec.quote }
    : null;
  const dbRow = dbById.get(r.netuid);
  const dbGpu = (dbRow?.recommendedGpu ?? "").trim();
  const dbCpuOnly = dbRow != null && CPU_ONLY_DB_RE.test(dbGpu);
  const dbUnspecified = dbRow != null && dbGpu.length > 0 && UNSPECIFIED_RE.test(dbGpu);
  const dbBanned = dbRow != null && BAN_RE.test(dbGpu);
  const dbFloor = dbRow?.minVramGb ?? null;

  // merged model set: scan hits first (repo-proven), curated parse second
  const models: string[] = [];
  const pushModels = (m: Record<string, number>) => {
    for (const k of Object.keys(m)) if (!models.includes(k)) models.push(k);
  };
  if (readme) pushModels(readme.models);
  if (minc) pushModels(minc.models);
  if (dock) pushModels(dock.models);
  // curated string may name models the scan missed (deep docs)
  if (curated) {
    for (const k of Object.keys(MODEL_CLASS)) {
      if (!models.includes(k) && new RegExp(`\\b${k.replace(/ /g, "\\s*")}\\b`, "i").test(curated.spec))
        models.push(k);
    }
  }
  // DB layer may name models the fresh scan missed (README revision changed)
  if (dbGpu && !dbCpuOnly) {
    for (const k of Object.keys(MODEL_CLASS)) {
      if (!models.includes(k) && new RegExp(`\\b${k.replace(/ /g, "\\s*")}\\b`, "i").test(dbGpu))
        models.push(k);
    }
  }
  const classes = [...new Set(models.map((m) => MODEL_CLASS[m]).filter(Boolean))] as string[];
  classes.sort((a, b) => CLASS_ORDER[a as "pro"] - CLASS_ORDER[b as "pro"]);

  // status + headline
  let status: SeedRow["status"] = "repo-scan";
  let headline = "";
  // Class resolution: named models first, then the strongest VRAM floor
  // (scan > DB), mirroring gpu-landscape.ts's floor bucketing.
  const floor = readme?.vramFloor ?? minc?.vramFloor ?? dock?.vramFloor ?? dbFloor;
  // playbook layer — platform research notes on the miner hardware path
  const pb = pbById.get(r.netuid);
  const pbText = (pb?.hardwareRec ?? "").trim();
  const pbCpuOnly = PB_CPU_ONLY_RE.test(pbText);
  const genericGpuLines =
    (readme ? mergeGenericGpu(r.artifacts!.readme!) : 0) +
    (minc ? mergeGenericGpu(r.artifacts!.min_compute!) : 0) +
    (dock ? mergeGenericGpu(r.artifacts!.docker!) : 0);
  let cls: SeedRow["cls"];
  if (classes.length) cls = classes[0] as SeedRow["cls"];
  else if (floor != null && floor > 0)
    cls = floor <= 32 ? "consumer" : floor <= 96 ? "pro" : "datacenter";
  else cls = "unverified";
  const cpuOnly = Boolean(
    readme?.cpuOnly || minc?.cpuOnly || dock?.cpuOnly || dbCpuOnly || pbCpuOnly || curatedSpec?.minVramGb === 0
  );
  const qpu = Boolean(readme?.qpu || minc?.qpu);

  if (r.netuid === 0) {
    status = "root";
    cls = "cpu-only";
    headline = "Root network — pure TAO staking; no mining hardware of any kind.";
  } else if (r.error?.includes("no public repo")) {
    status = "no-repo";
    headline = "No public GitHub repo identified — requirements unverifiable from source.";
  } else if (r.error?.includes("tarball")) {
    status = "repo-offline";
    headline = "Repo deleted or offline — last known requirement line cannot be re-verified.";
  } else if (qpu) {
    cls = "quantum";
    headline = "Quantum hardware (QPU) — no GPU involved.";
  } else if (cpuOnly && models.length === 0) {
    cls = "cpu-only";
    headline = "CPU-only workload — the miner path needs no GPU.";
  } else if (dbBanned) {
    headline = dbGpu;
  } else if (dbUnspecified) {
    headline = "GPU required — model/VRAM not specified in the repo; verify with the subnet team.";
  } else if (models.length > 0) {
    headline = models
      .slice()
      .sort((a, b) => CLASS_ORDER[MODEL_CLASS[a]] - CLASS_ORDER[MODEL_CLASS[b]])
      .join(" · ");
    if (curated && !r.error) headline = curated.spec;
  } else if (curated) {
    status = "curated-docs";
    headline = curated.spec;
  } else if (floor != null && floor > 0 && !models.length) {
    headline = `Per-GPU VRAM floor ${floor} GB — repo states a budget without naming a model.`;
  } else if (genericGpuLines > 0) {
    headline = `Repo mentions GPU hardware (${genericGpuLines} lines) but never names a model — verify with the subnet team.`;
  } else if (pbText) {
    headline = `No GPU signal in the repo artifacts — platform research notes: ${pbText.slice(0, 120)}`;
  } else {
    headline = "No GPU signal in README, min_compute.yml or Docker files — requirements likely documented off-repo.";
  }

  // headline overrides that need nuance
  if (r.netuid === 0) headline = "Root network — pure TAO staking; no mining hardware of any kind.";
  const audOv = overrideCls(r.netuid);
  if (audOv) {
    if (audOv.cls) cls = audOv.cls;
    if (audOv.headline) headline = audOv.headline;
  }

  // best evidence quote (prefer min_compute declaration, then readme, then docker)
  let evidence: string | null = null;
  if (minc) {
    const first = Object.values(minc.quotes).find(Boolean);
    if (first) evidence = `min_compute: ${first}`;
  }
  if (!evidence && readme) {
    const first = Object.values(readme.quotes).find(Boolean);
    if (first) evidence = `README: ${first}`;
  }
  if (!evidence && dock) {
    const first = Object.values(dock.quotes).find(Boolean);
    if (first) evidence = `docker: ${first}`;
  }
  if (!evidence && curated) evidence = `${curated.sourceFile}: ${curated.quote}`;

  const seedArtifact = (m: typeof readme): SeedArtifact | undefined =>
    m
      ? {
          files: (r.artifacts?.readme?.length ?? r.artifacts?.min_compute?.length ?? r.artifacts?.docker?.length) || 0,
          models: m.models,
          quote: Object.values(m.quotes).find(Boolean) ?? null,
          baseImages: dock === m ? m.baseImages : undefined,
        }
      : undefined;

  const fixFiles = (kind: "readme" | "min_compute" | "docker", m: typeof readme): SeedArtifact | undefined =>
    m
      ? {
          files: r.artifacts?.[kind]?.length ?? 0,
          models: m.models,
          quote: Object.values(m.quotes).find(Boolean) ?? null,
          baseImages: kind === "docker" ? m.baseImages : undefined,
        }
      : undefined;

  rows.push({
    netuid: r.netuid,
    name,
    repo: r.repo,
    status,
    cls,
    models,
    classes,
    headline,
    gpuCount: readme?.gpuCount ?? minc?.gpuCount ?? curatedSpec?.gpuCount ?? dbRow?.gpuCount ?? null,
    vramFloor: readme?.vramFloor ?? minc?.vramFloor ?? curatedSpec?.minVramGb ?? dbFloor ?? null,
    artifacts: {
      readme: fixFiles("readme", readme),
      min_compute: fixFiles("min_compute", minc),
      docker: fixFiles("docker", dock),
    },
    curated,
    evidence: evidence ? evidence.slice(0, 240) : null,
  });
  void seedArtifact;
}


// summary meta
const scanned = rows.filter((r) => r.status === "repo-scan" || r.status === "curated-docs").length;
const meta = {
  auditedAt: "2026-11-09",
  totalSubnets: rows.length,
  reposScanned: scanned,
  noRepo: rows.filter((r) => r.status === "no-repo").length,
  repoOffline: rows.filter((r) => r.status === "repo-offline").length,
  readmeHits: rows.filter((r) => r.artifacts.readme && Object.keys(r.artifacts.readme.models).length > 0).length,
  minComputeHits: rows.filter((r) => r.artifacts.min_compute && Object.keys(r.artifacts.min_compute.models).length > 0).length,
  dockerHits: rows.filter((r) => r.artifacts.docker && Object.keys(r.artifacts.docker.models).length > 0).length,
};

const out = `// GENERATED by scripts/gpu-research/build-seed.ts — do not edit by hand.
// Source: repo-level tarball audit (READMEs + min_compute.yml + Docker files)
// run ${meta.auditedAt} over all ${meta.totalSubnets} Bittensor subnets, merged with the
// platform's hand-verified curated GPU specs (deep docs / official pages).
// Regenerate: npx tsx scripts/gpu-research/build-seed.ts

export const GPU_RESEARCH_META = ${JSON.stringify(meta, null, 2)} as const;

export interface GpuResearchArtifact {
  files: number;
  models: Record<string, number>;
  quote: string | null;
  baseImages?: string[];
}

export interface GpuResearchRow {
  netuid: number;
  name: string;
  repo: string | null;
  status: "repo-scan" | "curated-docs" | "no-repo" | "repo-offline" | "root";
  cls: "datacenter" | "pro" | "consumer" | "cpu-only" | "quantum" | "unverified";
  models: string[];
  classes: string[];
  headline: string;
  gpuCount: number | null;
  vramFloor: number | null;
  artifacts: { readme?: GpuResearchArtifact; min_compute?: GpuResearchArtifact; docker?: GpuResearchArtifact };
  curated: { spec: string; sourceFile: string; quote: string } | null;
  evidence: string | null;
}

export const GPU_RESEARCH_ROWS: GpuResearchRow[] = ${JSON.stringify(rows, null, 1)};
`;

writeFileSync(join(HERE, "../../src/lib/infranex/gpu-research-seed.ts"), out);
console.log("seed written:", rows.length, "rows; meta:", JSON.stringify(meta));
const dist = {};
for (const r of rows) dist[r.cls] = (dist[r.cls] ?? 0) + 1;
console.log("class distribution:", JSON.stringify(dist));
}
