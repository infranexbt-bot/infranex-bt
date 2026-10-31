/**
 * verify-sn82-e2e.ts — E2E check that the Opportunities row for SN82 (Noah)
 * is CPU-only now, replicating the browser's exact data flow:
 * /api/network + /api/subnet-overrides + /api/profitability-config
 * → mergeOpportunities() → SN82 row hardware fields.
 */
const BASE = "http://localhost:3000";

async function jfetch(path: string, cookie: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie }, cache: "no-store" });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: process.env.INFRANEX_ADMIN_CODE ?? "" }),
  });
  const setCookie = login.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  if (!login.ok) throw new Error("login failed");

  const snap = (await jfetch("/api/network", cookie)) as Record<string, unknown>;
  const ov = (await jfetch("/api/subnet-overrides", cookie)) as { overrides: Array<Record<string, unknown>> };
  const profConfig = (await jfetch("/api/profitability-config", cookie)) as unknown;

  // Replicate fetchOverrides() Map building (use-subnet-overrides.ts)
  const map = new Map<number, Record<string, unknown>>();
  for (const o of ov.overrides) {
    const entry: Record<string, unknown> = {};
    if (o.name) entry.name = o.name;
    if (o.description) entry.description = o.description;
    if (o.category) entry.category = o.category;
    if (o.minVramGb != null) entry.minVramGb = o.minVramGb;
    if (o.recommendedGpu) entry.recommendedGpu = o.recommendedGpu;
    if (o.gpuCount != null) entry.gpuCount = o.gpuCount;
    if (o.hostingRequirements) {
      try { entry.hosting = JSON.parse(String(o.hostingRequirements)); } catch { /* ignore */ }
    }
    if (o.requirementsSource) entry.requirementsSource = o.requirementsSource;
    map.set(Number(o.netuid), entry);
  }

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const rows = mergeOpportunities(snap as never, profConfig as never, map) as Array<Record<string, unknown>>;
  const sn82 = rows.find((r) => r.netuid === 82);
  if (!sn82) throw new Error("SN82 missing from opportunities");

  console.log("SN82 opportunity row (browser-equivalent):");
  for (const k of ["name", "workType", "recommendedGpu", "minVramGb", "hardwareClassified", "requirementsSource", "gpuMonthlyCostUsd", "grossMonthlyUsd"]) {
    console.log(`  ${k}: ${JSON.stringify(sn82[k])}`);
  }

  const gpu = String(sn82.recommendedGpu ?? "");
  const vram = Number(sn82.minVramGb ?? -1);
  const ok = !/h200/i.test(gpu) && vram === 0;
  console.log(ok ? "\nE2E PASS — SN82 is CPU-only, no more H200 revenue-est fabrication"
                 : "\nE2E FAIL — SN82 still shows a GPU requirement");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error("E2E ERROR:", e.message); process.exit(1); });
