import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const snap: any = require("/home/z/my-project/tool-results/net-live32.json");
const rows = await db.subnetOverride.findMany();
const overrides = new Map<number, Record<string, unknown>>();
for (const o of rows) {
  const e: Record<string, unknown> = {};
  if (o.name) e.name = o.name;
  if (o.category) e.category = o.category;
  if (o.minVramGb != null) e.minVramGb = o.minVramGb;
  if (o.recommendedGpu) e.recommendedGpu = o.recommendedGpu;
  if (o.gpuCount != null) e.gpuCount = o.gpuCount;
  if (o.hostingRequirements) { try { e.hosting = JSON.parse(o.hostingRequirements); } catch {} }
  if (o.requirementsSource) e.requirementsSource = o.requirementsSource;
  overrides.set(o.netuid, e);
}
const { mergeOpportunities } = await import("../src/lib/infranex/live-merge");
const { computeRentEarnMap } = await import("../src/lib/infranex/rent-earn");
const opps = mergeOpportunities(snap, undefined, overrides);
const rentMap = computeRentEarnMap(opps);
const r = rentMap.get("opp-live-32");
console.log("=== SN32 rent-earn verdict ===");
console.log(JSON.stringify(r, null, 1)?.slice(0, 1500));
await db.$disconnect();
