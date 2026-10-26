// PDF-DATA-DUMP — pull the live app state and dump a JSON snapshot used to
// build the investor PDF (census, top picks, $ projections, spot rows).
// Run: npx tsx scripts/pdf-data-dump.ts

import * as fs from "fs";

const BASE = "http://127.0.0.1:3000";
const OUT = "/home/z/my-project/scripts/pdf-data.json";

async function cookie(): Promise<string> {
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
  });
  if (!login.ok) throw new Error("login failed " + login.status);
  return (login.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function main() {
  const ck = await cookie();
  const api = async (p: string) => {
    const r = await fetch(BASE + p, { headers: { cookie: ck } });
    if (!r.ok) throw new Error(`${p} -> ${r.status}`);
    return r.json();
  };

  const snap = await api("/api/network");
  const profConfig = await api("/api/profitability-config");
  const ovrJson = await api("/api/subnet-overrides");
  const overrides = new Map<number, Record<string, unknown>>(
    Object.entries(ovrJson?.overrides ?? {}).map(([k, v]) => [Number(k), v as Record<string, unknown>])
  );

  const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
  const opps = mergeOpportunities(snap, profConfig, overrides) as any[];

  const { costBasisFromConfig } = await import("../src/lib/infranex/rent-earn");
  const basis = costBasisFromConfig(profConfig);

  const { computeMinePickMap, rankMinePicks } = await import("../src/lib/infranex/mine-pick");
  const pickMap = computeMinePickMap(opps as any, basis);
  const rankedPicks = rankMinePicks(opps as any, basis);

  const { rankWinOdds, winTierCounts } = await import("../src/lib/infranex/win-odds");
  const rankedOdds = rankWinOdds(opps as any);
  const census = winTierCounts(rankedOdds);

  const verdictTally = { RUN: 0, WATCH: 0, AVOID: 0 } as Record<string, number>;
  for (const p of pickMap.values()) verdictTally[p.verdict] += 1;

  const slimO = (o: any) => ({
    netuid: o.netuid,
    id: o.id,
    name: o.subnetName,
    symbol: o.subnetSymbol,
    category: o.category ?? null,
    workType: o.workType ?? null,
    minVramGb: o.minVramGb ?? 0,
    recommendedGpu: o.recommendedGpu ?? null,
    earnChance: o.earnChance ? { level: o.earnChance.level, pct: o.earnChance.pct } : null,
    rewardedRatio: o.rewardedRatio ?? null,
    top10IncentiveShare: o.top10IncentiveShare ?? null,
    rewardMedianShare: o.rewardMedianShare ?? null,
    freeSlots: o.freeSlots ?? null,
    totalSlots: o.totalSlots ?? null,
    rampWeeks: o.rampWeeks ?? null,
    estimatedMonthlyRewardUsd: o.estimatedMonthlyRewardUsd ?? null,
    netMonthlyUsd: o.netMonthlyUsd ?? null,
    meetsMinimum: o.meetsMinimum ?? null,
    confidence: o.confidence ?? null,
  });

  const slimPick = (p: any) => ({
    ...slimO(p.o),
    conviction: p.conviction,
    band: p.band,
    verdict: p.verdict,
    hardware: p.hardware,
    diligenceHealth: p.diligenceHealth,
    confidencePct: p.confidencePct,
    rent: {
      rentable: p.rent.rentable,
      entry: p.rent.entry ?? null,
      expectedNetMonthlyUsd: p.rent.expectedNetMonthlyUsd ?? null,
      expectedGrossMonthlyUsd: p.rent.expectedGrossMonthlyUsd ?? null,
      knifeFight: p.rent.knifeFight ?? null,
      whaleMean: p.rent.whaleMean ?? null,
      powerCostUsd: p.rent.powerCostUsd ?? null,
    },
    reasons: p.reasons,
  });

  const spot = (netuid: number) => {
    const o = opps.find((x: any) => x.netuid === netuid);
    if (!o) return null;
    const p = pickMap.get(o.id);
    return p ? slimPick(p) : null;
  };

  const dump = {
    generatedAt: new Date().toISOString(),
    isLive: snap.isLive ?? null,
    fetchedAt: snap.fetchedAt ?? null,
    chainMetaBlock: snap.block ?? null,
    taoPriceUsd: snap.taoPriceUsd ?? snap.priceUsd ?? snap.taoPrice ?? null,
    subnetCount: opps.length,
    census,
    verdictTally,
    costBasis: typeof basis === "string" ? basis : basis,
    topPicksByConviction: rankedPicks.slice(0, 12).map(slimPick),
    winOddsTop: rankedOdds.slice(0, 24).map((w: any) => ({
      netuid: w.netuid,
      name: w.subnetName,
      tier: w.tier,
      oddsPct: w.oddsPct,
      rewardedPct: w.rewardedPct,
      top10Pct: w.top10Pct,
      displacement: w.displacement,
      minVramGb: w.minVramGb,
      why: w.why,
      netMonthly: pickMap.get((opps.find((x: any) => x.netuid === w.netuid) || {}).id)?.rent.expectedNetMonthlyUsd ?? null,
    })),
    spot: {
      noah82: spot(82),
      hone5: spot(5),
      cliqueai83: spot(83),
      reax92: spot(92),
      chutes64: spot(64),
      iota9: spot(9),
      sn30: spot(30),
      nova: spot(27),
      actual: spot(18),
      targon: spot(3),
    },
  };

  fs.writeFileSync(OUT, JSON.stringify(dump, null, 2));
  console.log("dumped", OUT);
  console.log("census:", JSON.stringify(census));
  console.log("verdicts:", JSON.stringify(verdictTally));
  console.log("taoPrice:", dump.taoPriceUsd, "| subnets:", dump.subnetCount, "| isLive:", dump.isLive);
  console.log("costBasis:", JSON.stringify(dump.costBasis));
  console.log("\nTOP PICKS:");
  for (const p of dump.topPicksByConviction.slice(0, 8)) {
    console.log(
      `SN${String(p.netuid).padStart(2, "0")} ${p.name.padEnd(12)} ${p.hardware.padEnd(3)}` +
        ` conv ${String(p.conviction).padStart(3)} ${p.verdict.padEnd(5)}` +
        ` net ${p.rent.expectedNetMonthlyUsd == null ? "-" : "$" + Math.round(p.rent.expectedNetMonthlyUsd).toLocaleString()}` +
        ` odds ${p.earnChance?.pct ?? "-"}% tier?`
    );
  }
}

main().catch((e) => {
  console.error("DUMP FAILED:", e.message);
  process.exit(1);
});
