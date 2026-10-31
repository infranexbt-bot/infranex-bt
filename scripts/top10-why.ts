// TOP10-WHY — for every GPU subnet where rewards concentrate: pull the live
// competitive fields + the playbook's own top10Strategy/top10Levers research.
// Answers: why top-10 take all, what hardware they run, what it takes to enter.
// Run: bun --smol scripts/top10-why.ts

const BASE = "http://127.0.0.1:3000";

async function api<T>(path: string): Promise<T> {
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: process.env.INFRANEX_ADMIN_CODE ?? "" }),
  });
  if (!login.ok) throw new Error("login failed " + login.status);
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const res = await fetch(BASE + path, { headers: { cookie } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

function strip(s: unknown, max = 300): string {
  if (s == null) return "";
  if (Array.isArray(s)) s = s.join(" | ");
  if (typeof s !== "string") s = String(s);
  return s.replace(/\s+/g, " ").trim().slice(0, max);
}

async function main() {
  const snap = await api<any>("/api/network");
  const profConfig = await api<any>("/api/profitability-config");
  const ovrJson = await api<any>("/api/subnet-overrides");
  const overrides = new Map<number, Record<string, unknown>>();
  for (const o of ovrJson.overrides as any[]) {
    const e: Record<string, unknown> = {};
    if (o.name) e.name = o.name;
    if (o.minVramGb != null) e.minVramGb = o.minVramGb;
    if (o.recommendedGpu) e.recommendedGpu = o.recommendedGpu;
    if (o.gpuCount != null) e.gpuCount = o.gpuCount;
    overrides.set(o.netuid, e);
  }

  // playbook rows = curated research incl. top10Strategy/top10Levers
  const pbJson: any = await api<any>("/api/playbook").catch(() => ({ entries: [] }));
  const pbRows: any[] = pbJson.entries ?? [];
  const pb = new Map<number, any>();
  for (const p of pbRows) pb.set(p.netuid, p);

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const opps = mergeOpportunities(snap, profConfig, overrides);

  // concentrated GPU subnets: rewardedRatio < 0.4 or top10 >= 0.5, minVram > 0
  const conc = opps
    .filter((s: any) => (s.minVramGb ?? 0) > 0)
    .filter((s: any) => (s.rewardedRatio ?? 1) < 0.4 || (s.top10IncentiveShare ?? 0) >= 0.5)
    .sort((a: any, b: any) => (b.rewardMedianShare ?? 0) - (a.rewardMedianShare ?? 0));

  console.log(`CONCENTRATED GPU SUBNETS: ${conc.length} (of ${opps.length} total)`);
  console.log("=".repeat(100));
  for (const s of conc) {
    const p = pb.get(s.netuid);
    console.log(`\n### SN${s.netuid} ${s.subnetName ?? ""} — rewarded ${(100 * (s.rewardedRatio ?? 0)).toFixed(0)}%, top10 ${(100 * (s.top10IncentiveShare ?? 0)).toFixed(0)}%, median share ${(100 * (s.rewardMedianShare ?? 0)).toFixed(0)}%`);
    console.log(`    hw: minVram ${s.minVramGb}GB recGpu ${s.recommendedGpu ?? "?"} count ${s.gpuCount ?? "?"} | seats ${s.freeSlots ?? "?"}/${s.totalSlots ?? "?"} | burn ${s.burnCostTao ?? "?"} tau | alpha $${(s.alphaPriceUsd ?? 0).toFixed(3)} | 24h ${(s.alphaChange24h ?? 0).toFixed(1)}%`);
    if (p) {
      console.log(`    WORK: ${strip(p.whatItDoes || p.minerJob, 220)}`);
      console.log(`    HW-REC: ${strip(p.hardwareRec, 200)}`);
      console.log(`    TOP10-STRATEGY: ${strip(p.top10Strategy, 260)}`);
      console.log(`    TOP10-LEVERS: ${strip(p.top10Levers, 260)}`);
      console.log(`    REQS: ${strip(p.keyRequirements, 200)}`);
      console.log(`    CONFIDENCE: ${p.confidence} | researched ${String(p.researchedAt).slice(0, 10)}`);
    } else {
      console.log(`    (no playbook research)`);
    }
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
