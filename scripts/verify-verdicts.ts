// Verify the Opportunities page verdict distribution against the engine.
import { mergeOpportunities } from "../src/lib/infranex/live-merge";
import { computeVerdictMapFor } from "../src/lib/infranex/verdict";
import { computeOpportunityScoreMap } from "../src/lib/infranex/subnet-opportunity";
import type { LiveNetworkSnapshot } from "../src/lib/infranex/live-merge";
import type { ProfitabilityConfig } from "../src/lib/infranex/profitability";

const snap = JSON.parse(await Bun.file("/tmp/snap.json").text()) as LiveNetworkSnapshot;
const prof = JSON.parse(await Bun.file("/tmp/prof.json").text()) as ProfitabilityConfig;
const rawOverrides = JSON.parse(await Bun.file("/tmp/overrides.json").text()) as
  | { overrides?: Record<string, Record<string, unknown>>[] }
  | Record<string, Record<string, unknown>>[];
const overrideRows = Array.isArray(rawOverrides) ? rawOverrides : (rawOverrides.overrides ?? []);
const overrides = new Map<number, Record<string, unknown>>();
for (const row of overrideRows) {
  const netuid = Number((row as { netuid?: unknown }).netuid);
  if (Number.isFinite(netuid)) overrides.set(netuid, row);
}
console.log("OVERRIDES LOADED:", overrides.size);

const rows = mergeOpportunities(snap, prof, overrides);
const verdictMap = computeVerdictMapFor(rows as never, prof);
const scoreMap = computeOpportunityScoreMap(rows as never, {
  hardwareMode: prof?.hardwareMode === "owned" ? "owned" : "rented",
  minNetTargetUsd: prof?.minNetProfitTargetUsd,
  weights: prof?.opportunityWeights,
});

const counts = { RUN: 0, WATCH: 0, AVOID: 0 } as Record<string, number>;
for (const r of rows) {
  const v = verdictMap.get(r.id ?? "");
  if (v) counts[v]++;
}
console.log("TOTAL ROWS:", rows.length, "| CONFIG: minNet=$" + prof?.minNetProfitTargetUsd, "mode=" + prof?.hardwareMode);
console.log("VERDICT COUNTS:", JSON.stringify(counts));
console.log("\n--- RUN ROWS ---");
for (const r of rows) {
  if (verdictMap.get(r.id ?? "") !== "RUN") continue;
  const s = scoreMap.get(r.id ?? "");
  console.log(
    `SN${String(r.netuid).padStart(3)} ${String(r.name ?? "").slice(0, 14).padEnd(14)}` +
      ` net=$${Math.round(r.netMonthlyUsd ?? 0)}/mo meetsMin=${r.meetsMinimum}` +
      ` score=${s?.effectiveScore} conf=${s?.dataConfidence?.toFixed(2)}` +
      ` gates=[${(s?.gates ?? []).map((g: { kind: string }) => g.kind).join(",")}]`
  );
}
console.log("\n--- rows near the RUN bar (WATCH, score>=45) ---");
for (const r of rows) {
  if (verdictMap.get(r.id ?? "") !== "WATCH") continue;
  const s = scoreMap.get(r.id ?? "");
  if ((s?.effectiveScore ?? 0) >= 45)
    console.log(
      `SN${String(r.netuid).padStart(3)} ${String(r.name ?? "").slice(0, 14).padEnd(14)}` +
        ` net=$${Math.round(r.netMonthlyUsd ?? 0)}/mo meetsMin=${r.meetsMinimum}` +
        ` score=${s?.effectiveScore} conf=${s?.dataConfidence?.toFixed(2)}` +
        ` gates=[${(s?.gates ?? []).map((g: { kind: string }) => g.kind).join(",")}]`
    );
}
