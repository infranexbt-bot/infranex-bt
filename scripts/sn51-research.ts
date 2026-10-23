// SN51 (Lium?) deep-dive — dump every fact the platform holds for netuid 51:
// live chain identity + economics, scraped GPU/hosting requirements, override
// fields, playbook entry, and the mine-pick / rent-earn verdicts under the
// ACTIVE cost basis. Pure read-only research helper.
const BASE = "http://localhost:3000";

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  const get = async (p: string) =>
    (await fetch(`${BASE}${p}`, { headers: { cookie }, cache: "no-store" })).json();

  const snap = await get("/api/network");
  const overrides = await get("/api/subnet-overrides");
  const playbook = await get("/api/playbook");
  const config = await get("/api/profitability-config");

  const sub = (snap as any).subnets?.find((s: any) => s.netuid === 51);
  const ov = (overrides as any).overrides?.find((o: any) => o.netuid === 51)
    ?? (overrides as any).rows?.find((o: any) => o.netuid === 51)
    ?? (Array.isArray(overrides) ? (overrides as any[]).find((o: any) => o.netuid === 51) : null);
  const pb = (playbook as any).entries?.find((e: any) => e.netuid === 51)
    ?? (playbook as any).subnets?.find((e: any) => e.netuid === 51)
    ?? (playbook as any).playbook?.find((e: any) => e.netuid === 51);

  console.log("=== CHAIN (live) ===");
  if (sub) {
    const keys = ["netuid", "name", "symbol", "emission", "emissionSharePct", "price", "priceChange24h",
      "marketCap", "rewardedRatio", "top10IncentiveShare", "freeSlots", "totalSlots", "hotkeys",
      "burnCostTao", "alphaIssuance", " liquidityRao", "liquidityTao", "netInflow24h"];
    for (const k of keys) if (sub[k] !== undefined) console.log(`  ${k}: ${JSON.stringify(sub[k])}`);
    const extra = Object.keys(sub).filter((k) => !keys.includes(k));
    console.log("  other fields:", extra.join(", "));
  } else console.log("  SN51 not found in snapshot");

  console.log("\n=== OVERRIDE (requirements) ===");
  if (ov) {
    for (const k of ["name", "description", "category", "workType", "recommendedGpu", "minVramGb",
      "gpuCount", "hostingRequirements", "requirementsSource", "revenueEstMonthlyUsd"]) {
      if ((ov as any)[k] !== undefined) console.log(`  ${k}: ${JSON.stringify((ov as any)[k])}`);
    }
  } else console.log("  no override row for SN51");

  console.log("\n=== PLAYBOOK ===");
  if (pb) {
    const p: any = pb;
    console.log(`  name: ${p.name} | confidence: ${p.confidence}`);
    console.log(`  summary: ${(p.summary ?? "").slice(0, 400)}`);
    console.log(`  hardware: ${JSON.stringify(p.hardware ?? p.hardwareRequirement)}`);
    if (p.requirements?.length) console.log(`  requirements (${p.requirements.length}):`);
    for (const r of (p.requirements ?? []).slice(0, 12)) console.log(`   - ${typeof r === "string" ? r : JSON.stringify(r)}`);
    if (p.economics) console.log(`  economics: ${JSON.stringify(p.economics).slice(0, 500)}`);
    if (p.sources?.length) for (const s of p.sources) console.log(`   src: ${s.url ?? s}`);
  } else console.log("  no playbook row for SN51");

  console.log("\n=== CONFIG ===");
  console.log(`  hardwareMode=${(config as any).hardwareMode} kWh=${(config as any).electricityUsdPerKwh} target=$${(config as any).minNetProfitTargetUsd}/mo`);
}

main().catch((e) => { console.error(e); process.exit(1); });
