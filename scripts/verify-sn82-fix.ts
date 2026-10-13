/**
 * COMPELLE-FIX verify — SN82 Compelle research/confirm task.
 *
 * User report: opportunity card showed SN82 as
 *   Work type "Unclassified workload" + "GPU (revenue est.) H200 141GB".
 * Root cause: SN82's on-chain identity is SCRUBBED (name/description null,
 * repo deleted) AND it had no SubnetOverride row → classifier had zero text
 * to match → revenue-based GPU guess (paper per-miner revenue ≈$1.6k/day
 * ≥ $1200/mo → H200 tier) presented as a hardware requirement.
 * Research verdict (2026-10-13, block ~9.27M): zero-GPU subnet — miners
 * commit written debate strategies as on-chain txns; the validator runs the
 * Pro/Con LLM debates via Chutes API. Miner hardware: wallet only.
 *
 * Fix under test:
 *   1. miner-score.ts CATEGORY_RULES gains a debate/persuasion rule (CPU)
 *      whose literal "compelle" alternative hits the curated override name.
 *   2. Curated SubnetOverride row for SN82 (name "Compelle", CPU-only).
 *   3. compat-seed SN82 TEE false positive → cpu-only (generator override).
 *
 * Verifies against the LIVE snapshot served by the running server, merged
 * with the live SubnetOverride rows exactly like the UI does:
 * Run: bun scripts/verify-sn82-fix.ts
 */
const BASE = process.env.AUTH_TEST_BASE ?? "http://localhost:3000";
const USERS: Array<{ userId: string; code: string }> = JSON.parse(
  (await import("node:fs")).readFileSync(
    new URL("./users.local.json", import.meta.url),
    "utf8"
  )
);

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ FAIL: ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

const admin = USERS.find((u) => u.userId === "admin")!;
const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: admin.userId, code: admin.code }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
check("login ok", login.ok);

const res = await fetch(`${BASE}/api/network`, { headers: { cookie } });
const snap = (await res.json()) as any;
check("snapshot is live", snap?.source === "live", `source=${snap?.source}`);

// Live overrides — same shape logic as use-subnet-overrides.ts fetchOverrides.
const ovRes = await fetch(`${BASE}/api/subnet-overrides`, { headers: { cookie } });
const ovJson = (await ovRes.json()) as any;
const overrides = new Map<number, Record<string, unknown>>();
for (const o of (ovJson?.overrides ?? []) as any[]) {
  const entry: Record<string, unknown> = {};
  if (o.name) entry.name = o.name;
  if (o.description) entry.description = o.description;
  if (o.category) entry.category = o.category;
  if (o.minVramGb != null) entry.minVramGb = o.minVramGb;
  if (o.recommendedGpu) entry.recommendedGpu = o.recommendedGpu;
  if (o.gpuCount != null) entry.gpuCount = o.gpuCount;
  if (o.hostingRequirements) {
    try { entry.hosting = JSON.parse(o.hostingRequirements); } catch { /* ignore */ }
  }
  if (o.requirementsSource) entry.requirementsSource = o.requirementsSource;
  overrides.set(o.netuid, entry);
}
check("curated SN82 override row exists", overrides.has(82));
check("SN82 override name = Compelle", overrides.get(82)?.name === "Compelle");

const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
const { COMPAT_SEED } = await import("../src/lib/infranex/compat-seed");

// Old rule head (pre-fix) — faithful replication of CATEGORY_RULES BEFORE the
// COMPELLE-FIX: NO debate rule, but INCLUDING every rule that already existed
// (Ridges software-engineering, \bagents?\b, Bandwidth/DePIN with lookahead).
// SN82's scrubbed identity matched nothing → revenue-guess fallback (bug path).
function oldClassify(name: string | null, desc: string | null) {
  const text = `${name ?? ""} ${desc ?? ""}`;
  const rules: Array<[RegExp, string]> = [
    [/\b(frontier|llm|text.?gen|prompt|language model|chat|assistant|inference)\b/i, "Frontier inference"],
    [/\b(pretrain|pre-train|model training|training network|grpo|rlhf|post.?training)\b/i, "Model training"],
    [/\b(video|image|diffusion|vision|photo|generative media|3d|render)\b/i, "Media generation"],
    [/\b(audio|speech|voice|music|sound)\b/i, "Audio & speech"],
    [/\b(scrap|crawl|data collect|data index|social data|sentiment|feed|dataset)\b/i, "Data & scraping"],
    [/\b(storag|file|archiv|backup)\b/i, "Storage"],
    [/\b(prediction|market mak|trading|financ|quant|hedge|odds)\b/i, "Prediction & markets"],
    [/\b(software[ -]?engineer(?:ing)?|coding|code[ -]?(?:gen|agent|repair)|program(?:ming)?|developer)\b/i, "Software engineering agents"],
    [/\b(agents?|orchestrat|routing|logic|swarm|tool use|evm|smart contract|web3 infra)\b/i, "Agents & logic"],
    [/\b(protein|fold|bio|genom|drug|science|research|simulat)\b/i, "Science & simulation"],
    [/^(?!.*\b(gpu|inference|training|video|image|render|llm)\b).*\b(bandwidth|network shar|depin)\b/i, "Bandwidth / DePIN node"],
    [/\b(compute|gpu|depin|edge|latency|bandwidth|network shar)\b/i, "Compute sharing"],
    [/\b(moderat|detect|scan|verif|audit|secur|privacy|zero.?know)\b/i, "Verification & security"],
    [/\b(maps?|geo|weather|energy|robot|drone|iot)\b/i, "Real-world data"],
  ];
  for (const [re, cat] of rules) if (re.test(text)) return cat;
  return null; // → revenue-guess fallback (the bug path)
}

const opps = mergeOpportunities(snap as any, undefined, overrides);
const byId = new Map(opps.map((o) => [o.netuid, o]));

console.log("\n— SN82 Compelle (the reported row) —");
const r = byId.get(82);
if (!r) {
  check("SN82 present", false);
} else {
  console.log(`    name=${r.subnetName} · workType=${r.workType} · gpu=${r.recommendedGpu} · vram=${r.minVramGb}GB · classified=${r.hardwareClassified} · gpuCost=$${r.gpuCostMonthlyUsd}/mo · net=$${r.netMonthlyUsd}/mo`);
  check("SN82 name = 'Compelle' (curated identity)", r.subnetName === "Compelle", r.subnetName);
  check("SN82 work type = 'Debate & persuasion'", r.workType === "Debate & persuasion", r.workType);
  check("SN82 GPU line = CPU VPS (research-verified: no GPU needed)", r.recommendedGpu === "CPU VPS", r.recommendedGpu);
  check("SN82 minVramGb = 0", r.minVramGb === 0, String(r.minVramGb));
  check("SN82 hardwareClassified = true (honest UI label)", r.hardwareClassified === true);
  check("SN82 GPU cost re-modeled to CPU tier ($50/mo)", r.gpuCostMonthlyUsd === 50, String(r.gpuCostMonthlyUsd));
  check("SN82 requirementsSource stays null (repo deleted — no false repo claim)",
    r.requirementsSource == null, String(r.requirementsSource));
}

console.log("\n— Compat seed (TEE false positive) —");
const compat82 = (COMPAT_SEED as any)[82];
console.log(`    tier=${compat82?.tier} · note=${(compat82?.note ?? "").slice(0, 90)}…`);
check("SN82 compat tier = cpu-only (was tee-required false positive)",
  compat82?.tier === "cpu-only", compat82?.tier);
check("SN82 compat note documents the sudo-tee false positive",
  /sudo tee/.test(compat82?.note ?? ""));

console.log("\n— Blast radius vs pre-fix rules —");
const changed: string[] = [];
for (const live of (snap as any).subnets as any[]) {
  if (live.netuid === 0) continue;
  const ovrName = (overrides.get(live.netuid)?.name as string) ?? null;
  const oldCat = oldClassify(ovrName ?? live.name, live.identityDescription);
  const now = byId.get(live.netuid);
  if (!now) continue;
  const newCat = now.workType ?? "";
  const oldWasGuess = oldCat === null;
  const newClassified = now.hardwareClassified === true;
  if (oldWasGuess !== !newClassified || (oldCat !== null && oldCat !== newCat)) {
    changed.push(`    α${live.netuid} ${ovrName ?? live.name ?? "(no name)"}: ${oldCat ?? "Unclassified(revenue-guess)"} → ${newCat}`);
  }
}
console.log(changed.length ? changed.join("\n") : "    (no changes)");
check("SN82 is in the changed set", changed.some((c) => c.startsWith("    α82 ")));
check("changed set is exactly SN82 (no collateral reclassification)", changed.length === 1, String(changed.length));
// The changed-set-equals-α82 check above is the real no-collateral proof:
// the debate rule was added at the TOP of the list, so any subnet whose text
// matches it reclassifies to CPU (can only LOSE VRAM), and every other rule's
// relative order is untouched. Invariant: every "Debate & persuasion" row is
// a zero-VRAM row (scraped GPU ground truth would indicate a rule misfire).
const debateRows = opps.filter((o) => o.workType === "Debate & persuasion");
check("debate-rule rows are exactly SN82", debateRows.length === 1 && debateRows[0].netuid === 82,
  debateRows.map((o) => `α${o.netuid}`).join(","));
check("every debate-rule row is zero-VRAM (rule cannot fabricate GPUs)",
  debateRows.every((o) => o.minVramGb === 0),
  debateRows.filter((o) => o.minVramGb !== 0).map((o) => `α${o.netuid}=${o.minVramGb}GB`).join(","));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
