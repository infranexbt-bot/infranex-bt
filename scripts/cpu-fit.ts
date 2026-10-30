// CPU-FIT — "as a CPU miner, what should I do?"
// Runs the app's OWN fit engine (miner-fit.ts) with a cpu-vps profile
// against the live merged opportunities (same pipeline the UI uses).
import { mergeOpportunities } from "../src/lib/infranex/live-merge";
import { computeMinerFit } from "../src/lib/infranex/miner-fit";
import type { LiveNetworkSnapshot } from "../src/lib/infranex/chain";

async function get(path: string) {
  const res = await fetch(`http://localhost:3000${path}`, {
    headers: { cookie: process.env.COOKIE ?? "" },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

function cookieHeader(): string {
  const txt = require("fs").readFileSync("/tmp/bt-cookies.txt", "utf8");
  const pairs: string[] = [];
  for (const raw of txt.split("\n")) {
    const line = raw.startsWith("#HttpOnly_") ? raw.slice("#HttpOnly_".length) : raw;
    if (!line || line.startsWith("#")) continue;
    const cols = line.trim().split(/\s+/);
    if (cols.length >= 7) pairs.push(`${cols[5]}=${cols[6]}`);
  }
  return pairs.join("; ");
}

type Row = {
  netuid: number;
  subnetName: string;
  subnetSymbol: string;
  workType?: string | null;
  minVramGb?: number | null;
  netMonthlyUsd?: number | null;
  score?: number;
  verdict?: string;
  minersCount?: number;
  rewardedRatio?: number | null;
  meetsMinimum?: boolean;
};

async function main() {
  process.env.COOKIE = cookieHeader();
  const snap = (await get("/api/network")) as LiveNetworkSnapshot;
  const prof = await get("/api/profitability-config");
  const { overrides } = await get("/api/subnet-overrides");

  const map = new Map<number, Record<string, unknown>>();
  for (const o of overrides ?? []) {
    const e: Record<string, unknown> = {};
    if (o.name) e.name = o.name;
    if (o.minVramGb != null) e.minVramGb = o.minVramGb;
    if (o.recommendedGpu) e.recommendedGpu = o.recommendedGpu;
    if (o.gpuCount != null) e.gpuCount = o.gpuCount;
    if (o.hostingRequirements) {
      try { e.hosting = JSON.parse(o.hostingRequirements); } catch { /* ignore */ }
    }
    if (o.mechanicsJson) {
      try { e.mechanics = JSON.parse(o.mechanicsJson); } catch { /* ignore */ }
    }
    map.set(o.netuid, e);
  }

  const opps = mergeOpportunities(snap, prof, map) as unknown as Row[];
  console.log(`scanned ${opps.length} active opportunities (tao=$${snap.taoPriceUsd}, block=${snap.blockNumber})\n`);

  // ---- Part 1: all CPU-only (minVramGb<=0) rows, ranked by score ----
  const cpuRows = opps
    .filter((o) => (o.minVramGb ?? 0) <= 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  console.log(`=== CPU-ONLY SUBNETS (${cpuRows.length} of ${opps.length}) — ranked by app score ===`);
  console.log("netuid | score | verdict | net$/mo/model | miners | rewarded | work");
  for (const o of cpuRows) {
    console.log(
      `#${o.netuid} | ${o.score ?? "-"} | ${o.verdict ?? "-"}${o.meetsMinimum === false ? "(fails profit floor)" : ""} | $${Math.round(o.netMonthlyUsd ?? 0)} | ${o.minersCount ?? "-"} | ${o.rewardedRatio != null ? Math.round(o.rewardedRatio * 100) + "%" : "-"} | ${o.workType ?? "-" }`
    );
  }

  // ---- Part 2: the app's own fit engine for a CPU-only miner ----
  const profiles = [
    { label: "PROFILE A — CPU VPS, basic skills, $500/mo budget, 2-4 h/wk", p: { techLevel: "basic", budget: "500", hardware: "cpu-vps", hoursPerWeek: "2-4" } },
    { label: "PROFILE B — CPU VPS, coder, $2000+/mo budget, 10 h/wk", p: { techLevel: "coder", budget: "2000plus", hardware: "cpu-vps", hoursPerWeek: "10" } },
  ] as const;

  for (const { label, p } of profiles) {
    const rep = computeMinerFit(opps as never, p);
    console.log(`\n=== ${label} ===`);
    console.log(`fits=${rep.fits.length} stretch=${rep.stretch.length} excluded=${rep.excludedCount}/${rep.scanned}`);
    for (const f of [...rep.fits, ...rep.stretch]) {
      const tag = rep.fits.includes(f) ? "FIT   " : "STRETCH";
      console.log(`${tag} #${f.netuid} ${f.subnetName} (${f.subnetSymbol}) fit=${f.fitScore} net=$${f.monthlyNetUsd ?? 0}/mo entry=${f.entryChancePct ?? "-"}% risk=${f.riskLevel}`);
      if (f.reasons.length) console.log(`        + ${f.reasons.join(" | ")}`);
      if (f.blockers.length) console.log(`        - ${f.blockers.join(" | ")}`);
    }
    console.log(rep.stakingNote);
  }

  // ---- Part 3: SN9 under the CPU profile (the direct answer) ----
  const repA = computeMinerFit(opps as never, profiles[0].p);
  const all = [...repA.fits, ...repA.stretch, ...repA.excludedSamples];
  console.log("\n=== SN9 (IOTA) for a CPU miner ===");
  const sn9 = all.find((f) => f.netuid === 9);
  if (sn9) {
    console.log(`verdict=${sn9.verdict} blockers=${sn9.blockers.join(" | ")}`);
  } else {
    console.log("SN9 not surfaced in top buckets (excluded long before the top 4) — hardware gate rejects it.");
  }
  const sn9raw = opps.find((o) => o.netuid === 9);
  if (sn9raw) {
    console.log(`raw: score=${sn9raw.score} minVram=${sn9raw.minVramGb}GB work="${sn9raw.workType}" net=$${Math.round(sn9raw.netMonthlyUsd ?? 0)}/mo/model miners=${sn9raw.minersCount} rewarded=${sn9raw.rewardedRatio}`);
  }
}

main().catch((e) => {
  console.error("cpu-fit failed:", e.message);
  process.exit(1);
});
