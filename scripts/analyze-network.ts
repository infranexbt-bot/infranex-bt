// Complete picture: UID earning across the whole Bittensor network + IOTA deep-dive
const net = JSON.parse(await Bun.file("/home/z/my-project/scripts/network.json").text());
const subs = net.subnets as Array<{
  netuid: number; name: string; minersCount: number; rewardedMiners: number | null;
  top10IncentiveShare: number | null; incentiveMedianShare: number | null;
  emissionTaoPerDay: number | null; minerEmissionTaoPerDay: number | null;
  emissionEnabled?: boolean;
}>;

console.log(`block ${net.blockNumber} · ${subs.length} subnets · TAO $${net.taoPriceUsd}`);

// ---- IOTA row ----
const iota = subs.find(s => s.netuid === 9);
console.log("\n=== IOTA (netuid 9) row from /api/network ===");
console.log(JSON.stringify(iota, null, 2));

// ---- Network-wide earning stats ----
const rows = subs
  .filter(s => (s.minersCount ?? 0) > 0)
  .map(s => {
    const rewarded = s.rewardedMiners;
    const ratio = rewarded != null && s.minersCount > 0 ? rewarded / s.minersCount : null;
    return { netuid: s.netuid, name: s.name ?? `subnet-${s.netuid}`, miners: s.minersCount, rewarded, ratio, top10: s.top10IncentiveShare, emission: s.minerEmissionTaoPerDay };
  });

const withData = rows.filter(r => r.ratio !== null);
const totalMiners = rows.reduce((a, r) => a + r.miners, 0);
const totalRewarded = rows.reduce((a, r) => a + (r.rewarded ?? 0), 0);

console.log("\n=== NETWORK-WIDE UID EARNING ===");
console.log(`total registered miner UIDs: ${totalMiners}`);
console.log(`total rewarded UIDs (last epoch): ${totalRewarded}`);
console.log(`share earning: ${((totalRewarded / totalMiners) * 100).toFixed(1)}%`);

const ratios = withData.map(r => r.ratio!).sort((a, b) => a - b);
const med = ratios[Math.floor(ratios.length / 2)];
console.log(`\nsubnets with reward data: ${withData.length}/${rows.length}`);
console.log(`median subnet rewarded-share: ${(med * 100).toFixed(1)}%`);

// Buckets
const buckets = [
  ["<5%", (x: number) => x < 0.05],
  ["5–20%", (x: number) => x >= 0.05 && x < 0.2],
  ["20–50%", (x: number) => x >= 0.2 && x < 0.5],
  ["50–80%", (x: number) => x >= 0.5 && x < 0.8],
  ["≥80%", (x: number) => x >= 0.8],
];
console.log("\nsubnet rewarded-share distribution:");
for (const [label, fn] of buckets) {
  const n = ratios.filter(fn).length;
  console.log(`  ${label.padEnd(7)} ${String(n).padStart(3)} subnets (${((n / ratios.length) * 100).toFixed(0)}%)`);
}

// Top-10 concentration stats
const t10 = withData.filter(r => r.top10 != null);
if (t10.length) {
  const shares = t10.map(r => r.top10!).sort((a, b) => a - b);
  const med10 = shares[Math.floor(shares.length / 2)];
  const ge90 = shares.filter(s => s >= 0.9).length;
  const ge50 = shares.filter(s => s >= 0.5).length;
  console.log(`\ntop-10% UID incentive share: median across ${t10.length} subnets = ${(med10 * 100).toFixed(0)}%`);
  console.log(`subnets where top-10% take ≥90% of pot: ${ge90} (${((ge90 / t10.length) * 100).toFixed(0)}%)`);
  console.log(`subnets where top-10% take ≥50% of pot: ${ge50} (${((ge50 / t10.length) * 100).toFixed(0)}%)`);
}

// Best & worst examples
console.log("\nmost OPEN subnets (highest rewarded share, ≥100 miners):");
[...withData].filter(r => r.miners >= 100).sort((a, b) => b.ratio! - a.ratio!).slice(0, 8)
  .forEach(r => console.log(`  α${String(r.netuid).padStart(3)} ${r.name.slice(0, 28).padEnd(28)} rewarded ${r.rewarded}/${r.miners} (${(r.ratio! * 100).toFixed(0)}%) · top10 ${(100 * (r.top10 ?? 0)).toFixed(0)}%`));

console.log("\nmost WINNER-TAKE-ALL subnets (lowest rewarded share, ≥100 miners):");
[...withData].filter(r => r.miners >= 100).sort((a, b) => a.ratio! - b.ratio!).slice(0, 12)
  .forEach(r => console.log(`  α${String(r.netuid).padStart(3)} ${r.name.slice(0, 28).padEnd(28)} rewarded ${r.rewarded}/${r.miners} (${(r.ratio! * 100).toFixed(1)}%) · top10 ${(100 * (r.top10 ?? 0)).toFixed(0)}%`));

// GPU-relevant subnets for the 4090 angle
console.log("\nGPU-training/GPU subnets near IOTA (rewarded share):");
withData.filter(r => [9, 12, 27, 35, 52].includes(r.netuid) || /train|gpu|compute|horde/i.test(r.name))
  .sort((a, b) => a.netuid - b.netuid).slice(0, 10)
  .forEach(r => console.log(`  α${String(r.netuid).padStart(3)} ${r.name.slice(0, 28).padEnd(28)} rewarded ${r.rewarded}/${r.miners} (${(r.ratio! * 100).toFixed(1)}%)`));
