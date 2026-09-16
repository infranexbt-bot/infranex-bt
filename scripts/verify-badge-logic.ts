// Verify Fix 2's badge logic: simulate what the dashboard card would render
// for each of its top ROI candidates (badge shows when Ledger band != RUN).
import { readFileSync } from "fs";
import { mergeOpportunities, type LiveNetworkSnapshot } from "../src/lib/infranex/use-network";
import { computeOpportunityScore } from "../src/lib/infranex/opportunity-score";
import { opportunityBand } from "../src/lib/utils";

const snap: LiveNetworkSnapshot = JSON.parse(readFileSync("/tmp/network2.json", "utf8"));
const opps = mergeOpportunities(snap, undefined);
const byNetuid = new Map(opps.map((o) => [o.netuid, o]));
const score = computeOpportunityScore(snap, { capitalTao: 10 });

console.log("Dashboard recommends:", score.recommended.strategy, score.recommended.title, "α" + score.recommended.netuid);
console.log("\nBadge simulation per top ROI candidate (badge renders when band != RUN):");
for (const m of score.alternatives.mining) {
  const o = byNetuid.get(m.netuid)!;
  const band = opportunityBand(o);
  const wouldShow = band.label !== "RUN";
  console.log(
    `  #${m.netuid} ${m.name.padEnd(10)} ledger ${String(o.score).padStart(5)} → ${band.label.padEnd(5)} | badge: ${wouldShow ? `"${band.label} on Opportunities" + note` : "hidden (RUN)"}`
  );
}
