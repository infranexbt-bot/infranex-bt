// Verify mergeOpportunities output over the live snapshot.
const m = await import("/home/z/my-project/infranex-bt/src/lib/infranex/use-network.ts");
const snap = await Bun.file("/tmp/net.json").json();
const opps = m.mergeOpportunities(snap);
console.log("rows:", opps.length);
const zero = opps.filter((o) => o.estimatedMonthlyRewardUsd === 0);
const noGpu = opps.filter((o) => !o.recommendedGpu || o.minVramGb === 0);
console.log("monthly $0 rows:", zero.length, "| rows w/o GPU req:", noGpu.length);
console.log("ranks:", opps[0].rank, "..", opps[opps.length - 1].rank, "| unique ids:", new Set(opps.map((o) => o.id)).size);
const band = (s) => (s >= 70 ? "RUN" : s >= 46 ? "WATCH" : "AVOID");
const dist = {};
for (const o of opps) dist[band(o.score)] = (dist[band(o.score)] ?? 0) + 1;
console.log("bands:", JSON.stringify(dist));
const row = (o) =>
  `#${String(o.rank).padStart(2)} ${o.subnetName.padEnd(15)} score:${o.score.toFixed(1).padStart(5)} monthly:$${String(o.estimatedMonthlyRewardUsd).padStart(7)} apy:${o.estimatedApy.toFixed(1).padStart(6)}% stake:${String(Math.round(o.requiredStake)).padStart(7)} util:${(o.utilization * 100).toFixed(1).padStart(5)}% gpu:${String(o.minVramGb).padStart(3)}GB ${o.recommendedGpu}`;
console.log("--- top 8 ---");
opps.slice(0, 8).forEach((o) => console.log(row(o)));
console.log("--- middle 64-66 ---");
opps.slice(63, 66).forEach((o) => console.log(row(o)));
console.log("--- bottom 3 ---");
opps.slice(-3).forEach((o) => console.log(row(o)));
