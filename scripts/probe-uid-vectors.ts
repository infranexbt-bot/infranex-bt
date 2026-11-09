// Live probe: per-UID vectors for SN83 (CliqueAI) — eval harness feasibility
import { getUidState } from "/home/z/my-project/src/lib/infranex/metagraph";

const t0 = Date.now();
const st = await getUidState(83);
console.log("elapsed_ms", Date.now() - t0);
console.log("registered", st.vectors?.registeredUids, "block", st.vectors?.blockNumber);
console.log("cohort", JSON.stringify(st.cohort));
const v = st.vectors;
if (v) {
  const idx = v.incentive.map((inc, i) => ({ i, inc })).sort((a, b) => b.inc - a.inc);
  const earners = idx.filter((x) => x.inc > 0);
  console.log("earners", earners.length);
  console.log("top12 by incentive:", earners.slice(0, 12).map((x) => `#${x.i}:${x.inc.toFixed(3)}`).join(" "));
  console.log("last earners:", earners.slice(-4).map((x) => `#${x.i}:${x.inc.toFixed(4)}`).join(" "));
  const sorted = earners.map((x) => x.inc);
  console.log("sum incentive", sorted.reduce((s, x) => s + x, 0).toFixed(3));
}
process.exit(0);
