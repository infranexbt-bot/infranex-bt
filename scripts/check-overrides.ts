import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const ids = [64, 4, 28, 51, 58, 90, 33, 38, 71, 94, 122];
const rows = await db.subnetOverride.findMany({ where: { netuid: { in: ids } } });
for (const r of rows.sort((a, b) => a.netuid - b.netuid)) {
  const h = r.hostingRequirements ? JSON.parse(r.hostingRequirements) : null;
  const flags = h ? [h.bareMetalOnly && "BARE", h.teeRequired && "TEE", h.staticIpRequired && "IP"].filter(Boolean).join("+") || "none-true" : "null";
  console.log(`#${String(r.netuid).padStart(3)} gpu=${(r.recommendedGpu ?? "-").padEnd(10)} hosting=[${flags}] src=${(r.requirementsSource ?? "-").slice(-40)} at=${r.requirementsScrapedAt?.toISOString().slice(0, 16)}`);
}
const total = await db.subnetOverride.count();
const withHosting = await db.subnetOverride.count({ where: { hostingRequirements: { not: null } } });
console.log(`\ntotal overrides=${total}, with hosting=${withHosting}`);
await db.$disconnect();
