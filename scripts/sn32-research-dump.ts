import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const snap: any = require("/home/z/my-project/tool-results/net-live32.json");
const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
const ovRes = await fetch("http://localhost:3000/api/subnet-overrides", {
  headers: { cookie: (process.env.COOKIE ?? "") },
}).catch(() => null);
let overrides = new Map<number, Record<string, unknown>>();
const rows = await db.subnetOverride.findMany();
for (const o of rows) {
  const e: Record<string, unknown> = {};
  if (o.name) e.name = o.name;
  if (o.description) e.description = o.description;
  if (o.category) e.category = o.category;
  if (o.minVramGb != null) e.minVramGb = o.minVramGb;
  if (o.recommendedGpu) e.recommendedGpu = o.recommendedGpu;
  if (o.gpuCount != null) e.gpuCount = o.gpuCount;
  if (o.hostingRequirements) { try { e.hosting = JSON.parse(o.hostingRequirements); } catch {} }
  if (o.requirementsSource) e.requirementsSource = o.requirementsSource;
  overrides.set(o.netuid, e);
}
const opps = mergeOpportunities(snap, undefined, overrides);
const o = opps.find((x) => x.netuid === 32)!;
console.log("=== SN32 merged opportunity (app diagnostics) ===");
for (const k of ["subnetName","workType","recommendedGpu","minVramGb","hardwareClassified","requirementsSource","gpuCostMonthlyUsd","infraCostMonthlyUsd","estimatedDailyReward","estimatedMonthlyRewardUsd","netMonthlyUsd","grossMonthlyUsd","netDailyTao","requiredStake","estimatedApy","earnChance","freeSlots","totalSlots","utilization","rewardedRatio","top10IncentiveShare","rewardMedianShare","rampWeeks","burnCostTao","immunityBlocks","alphaPriceUsd","realizableAlphaPriceUsd","rewardRealizability","dilutionRatio","alphaChange24h","liquidityTao","slippagePct","demandScore","demandBand","score","rank","riskLevel","verdict","meetsMinimum","perEarningMeanDailyTao","liveMiners","liveStake"]) {
  console.log(`${k}: ${(o as any)[k]}`);
}
const pb = await db.subnetPlaybook.findFirst({ where: { netuid: 32 } });
console.log("\n=== SubnetPlaybook SN32 ===");
console.log(pb ? JSON.stringify(pb, null, 1).slice(0, 1200) : "none");
const req = await db.$queryRawUnsafe<any[]>(`SELECT * FROM SubnetRequirements WHERE netuid=32 LIMIT 1`).catch(() => []);
console.log("\n=== SubnetRequirements SN32 ===");
console.log(req.length ? JSON.stringify(req[0], null, 1).slice(0, 800) : "none");
await db.$disconnect();
