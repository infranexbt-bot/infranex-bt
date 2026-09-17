/**
 * MINER-MINDSET — analyze every RUN-status subnet like an operator who has
 * to pay the bills: earning reality (where emission actually lands), seat
 * safety (entry burn + immunity), exit economics (liquidity vs monthly alpha
 * earned), and cost realism (GPU tier vs revenue guess flags).
 * Run: bun scripts/analyze-run-miners.ts
 */
const BASE = process.env.AUTH_TEST_BASE ?? "http://localhost:3000";
const USERS: Array<{ userId: string; code: string }> = JSON.parse(
  (await import("node:fs")).readFileSync(
    new URL("./users.local.json", import.meta.url),
    "utf8"
  )
);

const admin = USERS.find((u) => u.userId === "admin")!;
const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userId: admin.userId, code: admin.code }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
const res = await fetch(`${BASE}/api/network`, { headers: { cookie } });
const snap = (await res.json()) as any;

const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
const ops: any[] = await mergeOpportunities(snap);
const run = ops.filter(
  (o) => o.meetsMinimum !== false && o.score >= 60 // mirrors scoreBand() RUN label
);
console.log(`RUN subnets: ${run.length} of ${ops.length}\n`);

const tao = snap.taoPriceUsd;
const subById = new Map<number, any>((snap.subnets ?? []).map((s: any) => [s.netuid, s]));

const rows = run.map((o: any) => {
  const s = subById.get(o.netuid) ?? {};
  const miners = s.minersCount ?? null;
  const minerEmTaoDay = s.minerEmissionTaoPerDay ?? null;
  const rewarded = s.rewardedMiners ?? null;
  const top10Share = s.top10IncentiveShare ?? null;
  // Naive even-share monthly alpha per miner; and concentration-aware share
  // (median share × miners) where chain data exists.
  const evenShareTaoMo = miners && minerEmTaoDay ? (minerEmTaoDay * 30) / miners : null;
  const liquidity = o.liquidityTao ?? s.subnetTao ?? null;
  const alphaPrice = o.alphaPriceUsd ?? (s.movingPrice != null ? s.movingPrice * tao : null);
  // Exit stress: months of even-share alpha the pool can absorb at current price
  const exitMonths =
    evenShareTaoMo && liquidity ? liquidity / evenShareTaoMo : null;
  return {
    netuid: o.netuid,
    name: o.subnetName,
    sym: o.subnetSymbol,
    score: Math.round(o.score * 10) / 10,
    work: o.workType,
    gpu: o.recommendedGpu,
    vram: o.minVramGb,
    gpuSrc: o.requirementsSource ? "repo" : o.hardwareClassified ? "classified" : "est",
    gpuCost: o.gpuCostMonthlyUsd,
    netMo: Math.round(o.netMonthlyUsd ?? 0),
    apy: o.estimatedApy != null ? Math.round(o.estimatedApy) : null,
    alpha: alphaPrice != null ? Math.round(alphaPrice * 100) / 100 : null,
    a24h: o.alphaChange24h,
    liq: liquidity != null ? Math.round(liquidity) : null,
    util: o.utilization != null ? Math.round(o.utilization * 100) : null,
    miners,
    rewarded,
    top10: top10Share,
    evenTaoMo: evenShareTaoMo != null ? Math.round(evenShareTaoMo) : null,
    exitMonths: exitMonths != null ? Math.round(exitMonths * 10) / 10 : null,
    burn: s.burnCostTao,
    imm: s.immunityBlocks,
    earn: o.earnChance != null ? Math.round(o.earnChance * 100) : null,
    ramp: o.rampWeeks,
    host: o.hosting ? (o.hosting.bareMetalOnly ? "bareMetal" : o.hosting.teeRequired ? "tee" : null) : null,
    conf: o.confidence != null ? Math.round(o.confidence * 100) : null,
  };
});

rows.sort((a, b) => b.netMo - a.netMo);
console.log("ranked by net monthly USD:");
for (const r of rows) {
  console.log(
    `#${String(r.netuid).padStart(3)} ${r.name.padEnd(14)} score=${String(r.score).padStart(4)}` +
    ` net=$${String(r.netMo).padStart(6)} gpu=${String(r.gpu ?? "?").padEnd(15)} src=${r.gpuSrc}` +
    ` gpuCost=$${r.gpuCost ?? "?"} apy=${r.apy ?? "?"}%` +
    ` α=$${r.alpha} (${r.a24h >= 0 ? "+" : ""}${r.a24h}%) liq=${r.liq}` +
    ` miners=${r.miners} rewarded=${r.rewarded} top10=${r.top10}` +
    ` evenShare=${r.evenTaoMo}T/mo exitOK=${r.exitMonths}mo` +
    ` util=${r.util}% burn=${r.burn} earn=${r.earn}% ramp=${r.ramp}wk` +
    ` host=${r.host ?? "-"} conf=${r.conf}`
  );
}
