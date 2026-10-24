// Diagnostic: reproduce the Dashboard subnet-chooser pipeline headlessly
// (mergeOpportunities → rankMinePicks) and print every GPU row with its
// band + blocking reason, under the CURRENT profitability config (owned).
// Answer for the user: "why does every owned GPU say NO-GO?"

const BASE = "http://localhost:3000";

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
});
if (!login.ok) throw new Error(`login failed: ${login.status}`);
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
const H = { cookie };

const snap = (await (await fetch(`${BASE}/api/network`, { headers: H, cache: "no-store" })).json()) as any;
const cfgRes = (await (await fetch(`${BASE}/api/profitability-config`, { headers: H, cache: "no-store" })).json()) as any;
const ovRes = (await (await fetch(`${BASE}/api/subnet-overrides`, { headers: H, cache: "no-store" })).json()) as any;

const config = cfgRes.config ?? cfgRes;
const map = new Map<number, Record<string, unknown>>();
for (const o of ovRes.overrides ?? []) map.set(o.netuid, o);

console.log(`mode=${config.hardwareMode} · block=${snap.blockNumber} · tao=$${snap.taoPriceUsd}`);

const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
const { rankMinePicks } = await import("../src/lib/infranex/mine-pick");

const rows = mergeOpportunities(snap, config, map);
const picks = rankMinePicks(rows);
const shown = new Set(picks.map((p) => p.o.netuid));

const gpuPicks = picks.filter((p) => p.hardware === "GPU");
const cpuPicks = picks.filter((p) => p.hardware === "CPU");

// Rows that never reached the picker (filtered by rankMinePicks)
const excluded = rows.filter(
  (o) =>
    o.netuid !== 0 &&
    !shown.has(o.netuid) &&
    ((o.minVramGb ?? 0) > 0 || /gpu|rtx|a100|h100|h200|b200|b300/i.test(o.recommendedGpu ?? ""))
);

console.log(`\npicker shows ${picks.length} rows (CPU ${cpuPicks.length} / GPU ${gpuPicks.length}); ~${excluded.length} GPU-class rows excluded pre-filter (net≤0 or below minimum)\n`);

const nm = (netuid: number) => (map.get(netuid)?.name as string) ?? `SN${netuid}`;

console.log("=== GPU rows IN the picker ===");
const failStageCount = new Map<string, number>();
for (const p of gpuPicks) {
  const failed = p.diligence.stages.filter((s: any) => s.status === "fail");
  for (const s of failed) failStageCount.set(s.stage ?? s.name ?? String(s), (failStageCount.get(s.stage ?? s.name ?? String(s)) ?? 0) + 1);
  console.log(
    `SN${p.o.netuid} ${nm(p.o.netuid)} | ${p.band} (conv ${p.conviction}) | rentable=${p.rent.rentable} | dil=${p.diligence.verdict} | minOK=${p.o.meetsMinimum} | EV=$${p.rent.expectedNetMonthlyUsd ?? "?"}/mo\n   failed stages: ${failed.map((s: any) => `${s.stage ?? s.name}: ${s.note ?? s.detail ?? ""}`).join(" | ") || "(none)"}`
  );
}
console.log("\n=== failing diligence stages across GPU picks ===");
for (const [k, v] of [...failStageCount.entries()].sort((a, b) => b[1] - a[1])) console.log(`${k}: ${v} subnets`);

console.log("\n=== GPU-class rows EXCLUDED before the picker ===");
for (const o of excluded.slice(0, 12)) {
  console.log(
    `SN${o.netuid} ${o.name} | net=$${o.netMonthlyUsd ?? o.estimatedMonthlyRewardUsd ?? "?"}/mo | meetsMinimum=${o.meetsMinimum} | gpu=${o.recommendedGpu ?? "-"} | hosting=${JSON.stringify(o.hosting ?? null).slice(0, 90)}`
  );
}
if (excluded.length > 12) console.log(`… +${excluded.length - 12} more`);
