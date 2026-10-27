// VERDICT-DIAGNOSIS — why does the app show only 4 RUN?
// Replicates the app pipeline exactly: fetchLiveSnapshot + loadOverrides +
// loadProfitabilityConfig → mergeOpportunities → computeMinePickMap, then
// breaks down every row's conviction into its three engines and the gates
// that block RUN. Read-only; safe to run against the live DB.

import { db } from "../src/lib/db";
import { fetchLiveSnapshot } from "../src/lib/infranex/chain";
import { loadOverrides } from "../src/lib/infranex/optimization";
import { loadProfitabilityConfig } from "../src/lib/infranex/trust";
import { mergeOpportunities } from "../src/lib/infranex/live-merge";
import { computeMinePickMap } from "../src/lib/infranex/mine-pick";
import { computeOpportunityScoreMap } from "../src/lib/infranex/subnet-opportunity";
import { computeEntryDifficultyMap } from "../src/lib/infranex/entry-difficulty";
import { classifyOpportunityMap } from "../src/lib/infranex/opportunity-class";
import { computeNetEarningsMap } from "../src/lib/infranex/net-earnings";

async function main() {
  const snap = await fetchLiveSnapshot();
  const [overrides, profConfig] = await Promise.all([
    loadOverrides(),
    loadProfitabilityConfig(),
  ]);
  const rows = mergeOpportunities(snap, profConfig, overrides);
  const picks = computeMinePickMap(rows as never, "rent");

  const verdictCount = { RUN: 0, WATCH: 0, AVOID: 0 } as Record<string, number>;
  for (const p of picks.values()) verdictCount[p.verdict] = (verdictCount[p.verdict] ?? 0) + 1;
  console.log("=== VERDICT DISTRIBUTION (computeMinePickMap, basis=rent) ===");
  console.log(verdictCount, `total=${picks.size}`);

  // Conviction histogram around the RUN threshold (>= 50)
  const near = [...picks.values()]
    .filter((p) => p.verdict === "WATCH")
    .sort((a, b) => b.conviction - a.conviction);
  console.log(`\n=== TOP 25 WATCH rows (closest to RUN) ===`);
  console.log(
    "netuid | conv | rentEarn | diligHlth | conf | rentable | diligVerdict | meetsMin | rewardedRatio | confModel | name"
  );
  for (const p of near.slice(0, 25)) {
    const o = p.o as never as Record<string, unknown>;
    console.log(
      [
        String(o.netuid).padStart(6),
        String(p.conviction).padStart(4),
        String(Math.round(p.rent.score)).padStart(8),
        String(p.diligenceHealth).padStart(9),
        String(p.confidencePct).padStart(4),
        String(p.rent.rentable).padStart(8),
        p.diligence.verdict.padStart(12),
        String(o.meetsMinimum).padStart(8),
        o.rewardedRatio == null ? "null" : (o.rewardedRatio as number).toFixed(2).padStart(5),
        String(Math.round(((o.confidence as number) ?? 0.5) * 100)).padStart(5),
        String(o.subnetName).slice(0, 22),
      ].join(" | ")
    );
  }

  // Gate / blocker frequency across ALL rows
  console.log("\n=== BLOCKER FREQUENCY (all rows) ===");
  const freq = new Map<string, number>();
  for (const p of picks.values()) {
    if (!p.rent.rentable) freq.set("rentable=false", (freq.get("rentable=false") ?? 0) + 1);
    if (p.diligence.verdict === "DO NOT PROVISION")
      freq.set("diligence DO-NOT-PROVISION", (freq.get("diligence DO-NOT-PROVISION") ?? 0) + 1);
    if ((p.o as never as Record<string, unknown>).meetsMinimum === false)
      freq.set("meetsMinimum=false", (freq.get("meetsMinimum=false") ?? 0) + 1);
    if (p.confidencePct < 40) freq.set("confidence<40", (freq.get("confidence<40") ?? 0) + 1);
    if (p.rent.score < 40) freq.set("rentEarn<40", (freq.get("rentEarn<40") ?? 0) + 1);
    if (p.diligenceHealth < 60) freq.set("diligHealth<60", (freq.get("diligHealth<60") ?? 0) + 1);
    if ((p.o as never as Record<string, unknown>).rewardedRatio == null)
      freq.set("no rewardedRatio", (freq.get("no rewardedRatio") ?? 0) + 1);
    if ((p.o as never as Record<string, unknown>).netMonthlyUsd == null)
      freq.set("no netMonthlyUsd", (freq.get("no netMonthlyUsd") ?? 0) + 1);
    if (((p.o as never as Record<string, unknown>).netMonthlyUsd as number) <= 0)
      freq.set("net<=0", (freq.get("net<=0") ?? 0) + 1);
    if (p.rent.knifeFight) freq.set("knifeFight", (freq.get("knifeFight") ?? 0) + 1);
    if (p.rent.whaleMean) freq.set("whaleMean", (freq.get("whaleMean") ?? 0) + 1);
  }
  for (const [k, v] of [...freq.entries()].sort((a, b) => b[1] - a[1])) console.log(`${k}: ${v}`);

  // The new 7-factor score + classification distribution for contrast
  const scoreMap = computeOpportunityScoreMap(rows as never, {
    hardwareMode: profConfig?.hardwareMode === "owned" ? "owned" : "rented",
    minNetTargetUsd: profConfig?.minNetProfitTargetUsd,
    weights: profConfig?.opportunityWeights,
  });
  const estMap = computeNetEarningsMap(rows as never, {
    minNetTargetUsd: profConfig?.minNetProfitTargetUsd,
    hardwareMode: profConfig?.hardwareMode === "owned" ? "owned" : "rent",
  });
  const diffMap = computeEntryDifficultyMap(rows as never);
  const cls = classifyOpportunityMap(rows as never, (o) => ({
    score: scoreMap.get(o.id),
    est: estMap.get(o.id) ?? null,
    difficulty: diffMap.get(o.id),
  }));
  const clsCount: Record<string, number> = {};
  for (const c of cls.values()) clsCount[c.action] = (clsCount[c.action] ?? 0) + 1;
  console.log("\n=== 4-WAY CLASSIFICATION DISTRIBUTION (SCALE/TEST/WATCHLIST/AVOID) ===");
  console.log(clsCount, `total=${cls.size}`);

  // Confidence drivers on top WATCH rows — what data would unlock RUN
  console.log("\n=== DATA COVERAGE ===");
  const cov = (key: string) =>
    rows.filter((o) => (o as never as Record<string, unknown>)[key] != null).length;
  console.log(`rows=${rows.length} rewardedRatio=${cov("rewardedRatio")} earnChance=${cov("earnChance")} mechanics=${cov("mechanics")} requirementsSource=${cov("requirementsSource")} top10Share=${cov("top10IncentiveShare")} freeSlots=${cov("freeSlots")} rampWeeks=${cov("rampWeeks")} hosting=${cov("hosting")}`);

  // RUN rows detail
  console.log("\n=== CURRENT RUN ROWS ===");
  for (const p of picks.values()) {
    if (p.verdict !== "RUN") continue;
    const o = p.o as never as Record<string, unknown>;
    console.log(`SN${o.netuid} ${o.subnetName} conv=${p.conviction} net=$${Math.round((o.netMonthlyUsd as number) ?? 0)}/mo conf=${p.confidencePct} ratio=${o.rewardedRatio}`);
  }

  // VERDICT-UNIFY-2 counterfactual — verdict derived from the evidence
  // classification + effective score, NOT the legacy conviction bands.
  console.log("\n=== UNIFIED-VERDICT COUNTERFACTUAL ===");
  const unified = { RUN: [] as string[], WATCH: [] as string[], AVOID: [] as string[] };
  for (const o of rows) {
    const ro = o as never as Record<string, unknown>;
    const id = o.id;
    const c = cls.get(id);
    const s = scoreMap.get(id);
    let v: "RUN" | "WATCH" | "AVOID";
    if (!c) v = "WATCH";
    else if (c.action === "AVOID") v = "AVOID";
    else if (c.action === "SCALE") v = "RUN";
    else if (c.action === "TEST") v = (s?.effectiveScore ?? 0) >= 50 && (s?.dataConfidence ?? 0) >= 0.5 ? "RUN" : "WATCH";
    else v = "WATCH";
    unified[v].push(`SN${ro.netuid} ${ro.subnetName} eff=${s?.effectiveScore ?? "?"} conf=${s ? Math.round(s.dataConfidence * 100) : "?"} [%${ro.netuid}]`);
  }
  for (const k of ["RUN", "WATCH", "AVOID"] as const)
    console.log(`${k}: ${unified[k].length}`);
  console.log("\n-- unified RUN rows (full list) --");
  for (const line of unified.RUN) console.log(line);
  console.log("\n-- unified WATCH sample (first 25) --");
  for (const line of unified.WATCH.slice(0, 25)) console.log(line);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
