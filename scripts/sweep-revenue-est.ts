/**
 * sweep-revenue-est.ts — audit ALL subnets' displayed hardware against their
 * repo-scraped ground truth (SubnetOverride). Finds:
 *   A) "revenue-est." rows — no repo source, not work-type-classified, and a
 *      GPU invented from per-miner revenue (the SN82 Noah bug class).
 *   B) disagreements — the override documents a GPU/VRAM but the merged row
 *      displays something else.
 * Replicates the browser data flow: /api/network + /api/subnet-overrides +
 * /api/profitability-config → mergeOpportunities().
 */
const BASE = "http://localhost:3000";

interface Row {
  netuid: number;
  name: string;
  gpu: string;
  vram: number | null;
  classified: boolean;
  source: string | null;
  grossMonthlyUsd: number;
}

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  if (!login.ok) throw new Error("login failed");

  async function jfetch(path: string): Promise<never> {
    const res = await fetch(`${BASE}${path}`, { headers: { cookie }, cache: "no-store" });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json();
  }

  const snap = await jfetch("/api/network");
  const ov = await jfetch("/api/subnet-overrides") as { overrides: Array<Record<string, unknown>> };
  let profConfig: unknown;
  try { profConfig = await jfetch("/api/profitability-config"); } catch { profConfig = undefined; }

  // Replicate fetchOverrides() (use-subnet-overrides.ts)
  const map = new Map<number, Record<string, unknown>>();
  for (const o of ov.overrides) {
    const entry: Record<string, unknown> = {};
    if (o.name) entry.name = o.name;
    if (o.description) entry.description = o.description;
    if (o.category) entry.category = o.category;
    if (o.minVramGb != null) entry.minVramGb = o.minVramGb;
    if (o.recommendedGpu) entry.recommendedGpu = o.recommendedGpu;
    if (o.gpuCount != null) entry.gpuCount = o.gpuCount;
    if (o.hostingRequirements) { try { entry.hosting = JSON.parse(String(o.hostingRequirements)); } catch { /* ignore */ } }
    if (o.requirementsSource) entry.requirementsSource = o.requirementsSource;
    map.set(Number(o.netuid), entry);
  }

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const rows = mergeOpportunities(snap, profConfig as never, map) as unknown as Row[];

  // ---- Audit -------------------------------------------------------------
  const revenueEst: Row[] = [];
  const disagreements: Array<{ r: Row; scrapedGpu: string; scrapedVram: number | null; issue: string }> = [];

  for (const raw of rows) {
    if (raw.netuid === 0) continue;
    const r = raw as unknown as Record<string, unknown> & { netuid: number; name: string; grossMonthlyUsd: number };
    const gpu = String(r.recommendedGpu ?? "");
    const vram = typeof r.minVramGb === "number" ? r.minVramGb : null;
    const classified = r.hardwareClassified === true;
    const source = (r.requirementsSource as string | null) ?? null;
    const ovr = map.get(r.netuid) ?? {};
    const scrapedGpu = typeof ovr.recommendedGpu === "string" ? ovr.recommendedGpu : "";
    const scrapedVram = typeof ovr.minVramGb === "number" ? ovr.minVramGb : null;

    // A) revenue-est fabrication zone: GPU shown, but neither repo nor
    //    work-type classifier backs it.
    if (vram !== 0 && vram != null && !source && !classified) {
      revenueEst.push({ netuid: r.netuid, name: String(r.subnetName ?? r.name ?? `SN${r.netuid}`), gpu, vram, classified, source, grossMonthlyUsd: Number(r.grossMonthlyUsd ?? 0) });
    }

    // B) scraped ground truth vs displayed value disagree.
    if (scrapedGpu) {
      const displayed = gpu.replace(/^NVIDIA\s+/i, "").toLowerCase();
      const scrapedN = scrapedGpu.replace(/^NVIDIA\s+/i, "").toLowerCase();
      const norm = (s: string) => s.replace(/\d+\s*[x×]\s*/i, "").replace(/\s+/g, " ").trim();
      const sameFamily = displayed.includes(norm(scrapedN)) || norm(scrapedN).includes(displayed);
      // tier-equivalence: displayed tier vram == scraped vram (e.g. "A100 80GB" vs tier "A100-class")
      const vramMatches = scrapedVram == null || vram === scrapedVram;
      if (!sameFamily && !vramMatches) {
        disagreements.push({ r: { netuid: r.netuid, name: String(r.subnetName ?? r.name ?? `SN${r.netuid}`), gpu, vram, classified, source, grossMonthlyUsd: Number(r.grossMonthlyUsd ?? 0) }, scrapedGpu, scrapedVram, issue: `display "${gpu}" vs repo "${scrapedGpu}"` });
      }
    }
  }

  console.log(`audited: ${rows.length - 1} subnets (excl. SN0)`);
  console.log(`\n=== A) REVENUE-EST rows (fabrication zone): ${revenueEst.length} ===`);
  for (const r of revenueEst.sort((a, b) => b.grossMonthlyUsd - a.grossMonthlyUsd)) {
    console.log(`  SN${r.netuid} ${r.name.padEnd(18)} gpu=${r.gpu.padEnd(16)} vram=${r.vram} paperRev=$${Math.round(r.grossMonthlyUsd)}/mo`);
  }
  console.log(`\n=== B) DISAGREEMENTS (repo data vs display): ${disagreements.length} ===`);
  for (const d of disagreements) {
    console.log(`  SN${d.r.netuid} ${d.r.name.padEnd(18)} ${d.issue} (repo vram=${d.scrapedVram}, display vram=${d.r.vram}, src=${d.r.source ?? "—"})`);
  }
  if (revenueEst.length === 0 && disagreements.length === 0) console.log("\nCLEAN — no fabrications or disagreements.");
}

main().catch((e) => { console.error("SWEEP ERROR:", e.message); process.exit(1); });
