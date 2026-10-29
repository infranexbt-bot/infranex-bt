// Final shortlist: what a single-4090 owner should look at instead of IOTA
// Merge: latest opportunity snapshot (minVram via subnet-opportunity fields if
// present) is NOT here, so pull rewardedRatio + net economics from snapshots,
// and hardware fit from the live-merged opportunities via /api/network is not
// enough — so also fetch the opportunities the UI uses.
const snaps = JSON.parse(await Bun.file("/home/z/my-project/scripts/snaps.json").text());
const list = snaps.snapshots as Array<{
  id: string; netuid: number; scoreEffective: number; scoreRaw: number;
  netMonthlyUsd: number | null; netTaoPerMonth: number | null;
  gpuCostMonthlyUsd: number | null; emissionTaoPerDay: number | null;
  minersCount: number | null; rewardedRatio: number | null;
  classification: string | null; difficulty: string | null; day: string;
}>;

// keep only the newest row per netuid
const byNet = new Map<number, typeof list[number]>();
for (const r of list) {
  const prev = byNet.get(r.netuid);
  if (!prev || (r.updatedAt ?? "") > (prev.updatedAt ?? "")) byNet.set(r.netuid, r);
}
const rows = [...byNet.values()];

console.log(`snapshot day: ${snaps.day} · unique subnets: ${rows.length}`);

// ---- IOTA current snapshot ----
const iota = rows.find(r => r.netuid === 9);
console.log("\n=== IOTA latest snapshot ===");
console.log(JSON.stringify(iota, null, 2));

// ---- Broad-reward subnets worth a 4090 (rewardedRatio ≥ 50%) ----
const broad = rows
  .filter(r => (r.rewardedRatio ?? 0) >= 0.5)
  .filter(r => (r.minersCount ?? 0) >= 50)
  .sort((a, b) => (b.rewardedRatio ?? 0) - (a.rewardedRatio ?? 0));

console.log("\n=== BROAD-REWARD SUBNETS (≥50% of seats earned, ≥50 miners) ===");
for (const r of broad.slice(0, 15)) {
  console.log(
    `α${String(r.netuid).padStart(3)} rewarded ${(100 * (r.rewardedRatio ?? 0)).toFixed(0)}% · ` +
    `miners ${r.minersCount} · net≈$${Math.round(r.netMonthlyUsd ?? 0).toLocaleString()}/mo · ` +
    `emission ${Math.round(r.emissionTaoPerDay ?? 0)} τ/d · score ${r.scoreEffective} · ${r.classification ?? ""}`
  );
}

// ---- Also: decent net for a 24GB rig among knife-fight subnets (for contrast) ----
const paying = rows
  .filter(r => (r.netMonthlyUsd ?? 0) > 200)
  .sort((a, b) => (b.netMonthlyUsd ?? 0) - (a.netMonthlyUsd ?? 0));
console.log("\n=== HIGHEST MODELED NET (any subnet, top 10) ===");
for (const r of paying.slice(0, 10)) {
  console.log(
    `α${String(r.netuid).padStart(3)} net≈$${Math.round(r.netMonthlyUsd ?? 0).toLocaleString()}/mo · ` +
    `rewarded ${r.rewardedRatio != null ? (100 * r.rewardedRatio).toFixed(0) + "%" : "?"} · miners ${r.minersCount} · score ${r.scoreEffective}`
  );
}
