/**
 * RIDGES-FIX verify — SN62 Ridges research/confirm task.
 *
 * User report: Opportunities card showed for Ridges
 *   Work type "Unclassified workload" + "GPU required: H200 141GB".
 * Root cause: \bagent\b missed plural "Software Engineering Agents" →
 * revenue-based GPU guess presented as a requirement. The official repo
 * (github.com/ridgesai/ridges) documents a CPU+API miner (agent.py run on
 * Harbor benchmarks, inference via OpenRouter/Targon/Chutes — NO GPU).
 *
 * Verifies against the LIVE snapshot served by the running dev server:
 *   1. SN62 classifies as "Software engineering agents" (CPU, no GPU line)
 *   2. hardwareClassified=true so the UI labels the GPU line honestly
 *   3. SN62 alpha price / liquidity / 24h change match the chain numbers
 *   4. Blast radius: exact diff of classification changes vs the OLD rules
 * Run: bun scripts/verify-ridges-fix.ts
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

const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");

// Old rule tail (pre-fix) — for the exact blast-radius diff.
const OLD_RULES: Array<{ re: RegExp; category: string; minVram: number }> = [
  { re: /\b(frontier|llm|text.?gen|prompt|language model|chat|assistant|inference)\b/i, category: "Frontier inference", minVram: 80 },
  { re: /\b(pretrain|pre-train|model training|training network|grpo|rlhf|post.?training)\b/i, category: "Model training", minVram: 141 },
  { re: /\b(video|image|diffusion|vision|photo|generative media|3d|render)\b/i, category: "Media generation", minVram: 24 },
  { re: /\b(audio|speech|voice|music|sound)\b/i, category: "Audio & speech", minVram: 24 },
  { re: /\b(scrap|crawl|data collect|data index|social data|sentiment|feed|dataset)\b/i, category: "Data & scraping", minVram: 0 },
  { re: /\b(storag|file|archiv|backup)\b/i, category: "Storage", minVram: 0 },
  { re: /\b(prediction|market mak|trading|financ|quant|hedge|odds)\b/i, category: "Prediction & markets", minVram: 0 },
  { re: /\b(agent|orchestrat|routing|logic|swarm|tool use|evm|smart contract|web3 infra)\b/i, category: "Agents & logic", minVram: 0 },
  { re: /\b(protein|fold|bio|genom|drug|science|research|simulat)\b/i, category: "Science & simulation", minVram: 48 },
  { re: /\b(compute|gpu|depin|edge|latency|bandwidth|network shar)\b/i, category: "Compute sharing", minVram: 24 },
  { re: /\b(moderat|detect|scan|verif|audit|secur|privacy|zero.?know)\b/i, category: "Verification & security", minVram: 24 },
  { re: /\b(maps?|geo|weather|energy|robot|drone|iot)\b/i, category: "Real-world data", minVram: 24 },
];
function oldClassify(name: string | null, desc: string | null) {
  const text = `${name ?? ""} ${desc ?? ""}`;
  for (const r of OLD_RULES) if (r.re.test(text)) return r.category;
  return null; // → revenue-guess fallback (the bug path)
}

const opps = mergeOpportunities(snap as any);
const byId = new Map(opps.map((o) => [o.netuid, o]));

console.log("\n— SN62 Ridges (the reported row) —");
const r = byId.get(62);
if (!r) {
  check("SN62 present", false);
} else {
  console.log(`    workType=${r.workType} · gpu=${r.recommendedGpu} · vram=${r.minVramGb}GB · classified=${r.hardwareClassified} · gpuCost=$${r.gpuCostMonthlyUsd}/mo · net=$${r.netMonthlyUsd}/mo`);
  check("SN62 work type = 'Software engineering agents'", r.workType === "Software engineering agents", r.workType);
  check("SN62 GPU line = CPU VPS (repo-verified: no GPU needed)", r.recommendedGpu === "CPU VPS", r.recommendedGpu);
  check("SN62 minVramGb = 0", r.minVramGb === 0, String(r.minVramGb));
  check("SN62 hardwareClassified = true (honest UI label)", r.hardwareClassified === true);
  check("SN62 GPU cost re-modeled to CPU tier ($50/mo)", r.gpuCostMonthlyUsd === 50, String(r.gpuCostMonthlyUsd));
  // Chain-derived figures the user quoted:
  console.log(`    alphaPriceUsd=${r.alphaPriceUsd} · change24h=${r.alphaChange24h} · liquidity=${r.liquidityTao} TAO`);
  check("SN62 alpha price ~ $10.19 (chain movingPrice × TAO spot)",
    r.alphaPriceUsd != null && Math.abs(r.alphaPriceUsd - 10.19) < 0.6, String(r.alphaPriceUsd));
  // Chain values DRIFT — the fix pinned 30,221 TAO at fix time; assert it is
  // the same ballpark (±15%) so the suite stays green on a live chain.
  check("SN62 pool liquidity ~ 30,221 TAO ±15% (chain subnetTao, drift-tolerant)",
    r.liquidityTao != null && Math.abs(r.liquidityTao - 30221) / 30221 < 0.15, String(r.liquidityTao));
  // 24h change is a live market value — assert it is a number, not a pin.
  check("SN62 24h change present (live chain value, not pinned)",
    typeof r.alphaChange24h === "number", String(r.alphaChange24h));
}

console.log("\n— SN27 Orion (old SN27 — now SILX-LABS data subnet) —");
const o27 = byId.get(27);
if (o27) {
  console.log(`    name=${o27.subnetName} · workType=${o27.workType} · gpu=${o27.recommendedGpu} · classified=${o27.hardwareClassified}`);
  check("SN27 is Orion (chain identity, not Ridges)", o27.subnetName === "Orion", o27.subnetName);
  check("SN27 stays honestly unclassified (no keyword invention)", o27.hardwareClassified === false, o27.workType);
}

console.log("\n— Blast radius vs OLD rules —");
const changed: string[] = [];
for (const live of (snap as any).subnets as any[]) {
  if (live.netuid === 0) continue;
  const oldCat = oldClassify(live.name, live.identityDescription);
  const now = byId.get(live.netuid);
  if (!now) continue;
  const newCat = now.workType ?? "";
  const oldWasGuess = oldCat === null;
  const newClassified = now.hardwareClassified === true;
  if (oldWasGuess !== !newClassified || (oldCat !== null && oldCat !== newCat)) {
    changed.push(`    α${live.netuid} ${live.name}: ${oldCat ?? "Unclassified(revenue-guess)"} → ${newCat}`);
  }
}
console.log(changed.length ? changed.join("\n") : "    (no changes)");
// Ridges must be in the changed set (the point of the fix), and the change
// set must stay small and CPU-ward (no subnet suddenly gained a GPU req).
check("SN62 is in the changed set", changed.some((c) => c.startsWith("    α62 ")));
const gainedVram = opps.filter((o) => {
  const oldCat = oldClassify(o.subnetName, (snap as any).subnets.find((s: any) => s.netuid === o.netuid)?.identityDescription);
  return oldCat !== null && o.minVramGb > (OLD_RULES.find((x) => x.category === oldCat)?.minVram ?? 0);
});
check("no subnet gained a GPU requirement from this fix", gainedVram.length === 0,
  gainedVram.map((o) => `α${o.netuid}`).join(","));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
