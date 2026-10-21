/** debug-sn75.ts — why does SN75 show H200 when its description says "storage"? */
const BASE = "http://localhost:3000";

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const snap = await (await fetch(`${BASE}/api/network`, { headers: { cookie } })).json();
  const ov = await (await fetch(`${BASE}/api/subnet-overrides`, { headers: { cookie } })).json();
  let profConfig: unknown;
  try { profConfig = await (await fetch(`${BASE}/api/profitability-config`, { headers: { cookie } })).json(); } catch { /* default */ }

  const map = new Map<number, Record<string, unknown>>();
  for (const o of ov.overrides) {
    const e: Record<string, unknown> = {};
    if (o.name) e.name = o.name;
    if (o.description) e.description = o.description;
    if (o.category) e.category = o.category;
    if (o.minVramGb != null) e.minVramGb = o.minVramGb;
    if (o.recommendedGpu) e.recommendedGpu = o.recommendedGpu;
    if (o.gpuCount != null) e.gpuCount = o.gpuCount;
    if (o.hostingRequirements) { try { e.hosting = JSON.parse(String(o.hostingRequirements)); } catch { /* ignore */ } }
    if (o.requirementsSource) e.requirementsSource = o.requirementsSource;
    if (o.mechanicsJson) { try { e.mechanics = JSON.parse(String(o.mechanicsJson)); } catch { /* ignore */ } }
    map.set(Number(o.netuid), e);
  }

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const rows = mergeOpportunities(snap, profConfig, map) as Array<Record<string, unknown>>;

  for (const nid of [75, 86, 39, 19]) {
    const r = rows.find((x) => x.netuid === nid);
    if (!r) continue;
    console.log(`\n=== SN${nid} merged row ===`);
    for (const k of ["subnetName", "workType", "recommendedGpu", "minVramGb", "hardwareClassified", "requirementsSource", "gpuCount", "grossMonthlyUsd", "expectedDailyTao"]) {
      console.log(`  ${k}: ${JSON.stringify(r[k])}`);
    }
  }

  // Direct classifier calls with the exact chain inputs
  const { classifySubnetHardware } = await import("../src/lib/infranex/miner-score");
  const live75 = (snap as { snapshot?: { subnets: Array<Record<string, unknown>> } }).snapshot?.subnets?.find((x) => x.netuid === 75)
    ?? (snap as { subnets: Array<Record<string, unknown>> }).subnets?.find((x) => x.netuid === 75);
  console.log("\n=== direct classifySubnetHardware('Hippius', <identityDescription>) ===");
  const p = classifySubnetHardware("Hippius", live75?.identityDescription as string, { fallbackMonthlyUsd: 8 });
  console.log(JSON.stringify(p, null, 1));
}

main().catch((e) => { console.error("DEBUG ERROR:", e); process.exit(1); });
