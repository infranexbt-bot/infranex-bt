// Analyze live IOTA (netuid 9) neurons data — why only ~10% of UIDs earn
const data = JSON.parse(await Bun.file("/home/z/my-project/scripts/iota-neurons.json").text());

const rows: Array<{
  uid: number; hotkey: string | null; active: boolean;
  tier: "earning" | "active" | "stale" | "idle";
  incentive: number; consensus: number; validatorTrust: number;
  emissionRel: number; blocksSinceUpdate: number | null;
}> = data.rows ?? [];

console.log("=== SNAPSHOT HEADER ===");
console.log(JSON.stringify(data, (k, v) => (k === "rows" ? undefined : v), 2));

const total = rows.length;
const earning = rows.filter(r => r.tier === "earning");
const active = rows.filter(r => r.tier === "active");
const idle = rows.filter(r => r.tier === "idle");
const stale = rows.filter(r => r.tier === "stale");

console.log("\n=== TIER DISTRIBUTION ===");
console.log(`total rows: ${total}`);
console.log(`earning:  ${earning.length} (${((earning.length / total) * 100).toFixed(1)}%)`);
console.log(`active:   ${active.length} (${((active.length / total) * 100).toFixed(1)}%)  [serving validators but ZERO incentive]`);
console.log(`idle:     ${idle.length} (${((idle.length / total) * 100).toFixed(1)}%)`);
console.log(`stale:    ${stale.length} (${((stale.length / total) * 100).toFixed(1)}%)  [idle >7200 blocks ≈ 1 day]`);

// Incentive concentration
const sorted = [...rows].sort((a, b) => b.incentive - a.incentive);
const totalIncentive = sorted.reduce((s, r) => s + r.incentive, 0);
const top10pctCount = Math.max(1, Math.round(total * 0.10));
const top10Share = sorted.slice(0, top10pctCount).reduce((s, r) => s + r.incentive, 0) / (totalIncentive || 1);
const top25Share = sorted.slice(0, Math.round(total * 0.25)).reduce((s, r) => s + r.incentive, 0) / (totalIncentive || 1);
console.log("\n=== INCENTIVE CONCENTRATION ===");
console.log(`top-10% of UIDs hold ${(top10Share * 100).toFixed(1)}% of all incentive`);
console.log(`top-25% of UIDs hold ${(top25Share * 100).toFixed(1)}% of all incentive`);

console.log("\n=== TOP 15 EARNERS ===");
for (const r of sorted.slice(0, 15)) {
  console.log(
    `uid ${String(r.uid).padStart(3)} inc=${r.incentive.toFixed(4)} cons=${r.consensus.toFixed(3)} vtrust=${r.validatorTrust.toFixed(3)} emRel=${r.emissionRel.toFixed(3)} active=${r.active} lastUpd=${r.blocksSinceUpdate ?? "?"} blocks ago`
  );
}

// Among earning: how concentrated is the tail?
const earningSorted = earning.map(r => r.incentive).sort((a, b) => a - b);
if (earningSorted.length) {
  const q = (p: number) => earningSorted[Math.floor(p * (earningSorted.length - 1))];
  console.log("\n=== EARNERS' INCENTIVE SPREAD ===");
  console.log(`min=${q(0).toFixed(4)} p25=${q(0.25).toFixed(4)} median=${q(0.5).toFixed(4)} p75=${q(0.75).toFixed(4)} max=${q(1).toFixed(4)}`);
}

// Non-earners diagnostics
function blocksStats(list: typeof rows) {
  const vals = list.map(r => r.blocksSinceUpdate).filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (!vals.length) return "no lastUpdate data";
  const q = (p: number) => vals[Math.floor(p * (vals.length - 1))];
  return `min=${q(0)} p25=${q(0.25)} median=${q(0.5)} p75=${q(0.75)} max=${q(1)} blocks since last update`;
}
console.log("\n=== NON-EARNERS DIAGNOSTICS ===");
console.log(`active-tier: ${blocksStats(active)}`);
console.log(`idle-tier:   ${blocksStats(idle)}`);
console.log(`stale-tier:  ${blocksStats(stale)}`);

// 12s per block conversions
const fmt = (b: number) => {
  const mins = (b * 12) / 60;
  if (mins < 60) return `${mins.toFixed(0)} min`;
  const hrs = mins / 60;
  if (hrs < 48) return `${hrs.toFixed(1)} h`;
  return `${(hrs / 24).toFixed(1)} days`;
};
const staleVals = stale.map(r => r.blocksSinceUpdate).filter((v): v is number => v !== null);
if (staleVals.length) {
  console.log(`stale range in time: ${fmt(Math.min(...staleVals))} → ${fmt(Math.max(...staleVals))}`);
}
const idleVals = idle.map(r => r.blocksSinceUpdate).filter((v): v is number => v !== null);
if (idleVals.length) {
  console.log(`idle range in time:  ${fmt(Math.min(...idleVals))} → ${fmt(Math.max(...idleVals))}`);
}

// Consensus among non-earners (are validators even trusting them?)
const nonEarning = rows.filter(r => r.tier !== "earning");
const withConsensus = nonEarning.filter(r => r.consensus > 0.01);
console.log(`\nnon-earners with any consensus > 0.01: ${withConsensus.length}/${nonEarning.length}`);
console.log(`non-earners with any vtrust  > 0.01: ${nonEarning.filter(r => r.validatorTrust > 0.01).length}/${nonEarning.length}`);
