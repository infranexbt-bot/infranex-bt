/**
 * EPAGO-CHECK — why does the dashboard card show "GPU required / CPU VPS /
 * 0 GB VRAM · 61% confidence" for Epago α36?
 *
 * Dumps the merged Opportunity for SN36 plus the ScoredStrategy the
 * dashboard home cards consume, so we can see exactly which field the
 * hardcoded "GPU required" label sits on.
 * Run: bun scripts/check-epago.ts
 */
const BASE = process.env.AUTH_TEST_BASE ?? "http://localhost:3000";
const USERS: Array<{ userId: string; code: string }> = JSON.parse(
  (await import("node:fs")).readFileSync(
    new URL("./users.local.json", import.meta.url),
    "utf8"
  )
);

const admin = USERS.find((u) => u.userId === "admin")!;
const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: admin.userId, code: admin.code }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

const res = await fetch(`${BASE}/api/network`, { headers: { cookie } });
const snap = (await res.json()) as any;
console.log("snapshot source:", snap?.source);

const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
const ops = await mergeOpportunities(snap);
const e = ops.find((o: any) => o.netuid === 36);
if (!e) {
  console.log("SN36 missing; total ops:", ops.length);
  process.exit(0);
}
console.log("\n=== merged Opportunity SN36 ===");
const keys = [
  "subnetName", "subnetSymbol", "category", "workType",
  "recommendedGpu", "minVramGb", "gpuCount", "gpuModelRaw",
  "hosting", "requirementsSource", "hardwareClassified",
  "confidence", "githubUrl", "requirementsUrl", "readmeUrl",
];
for (const k of keys) console.log(`  ${k}:`, JSON.stringify(e[k]));

// What the dashboard ScoredStrategy carries (opportunity-score.ts mapping):
const strat = {
  requiredGpu: e.recommendedGpu,
  minVramGb: e.minVramGb,
  confidence: e.confidence,
};
console.log("\n=== dashboard ScoredStrategy fields ===");
console.log(JSON.stringify(strat, null, 2));
console.log(
  "\nDashboard renders: label=\"GPU required\" (hardcoded), value=",
  strat.requiredGpu ?? "—",
  ", sub=\"",
  strat.minVramGb != null ? `${strat.minVramGb} GB VRAM · ` : "",
  Math.round(strat.confidence * 100),
  "% confidence\""
);
