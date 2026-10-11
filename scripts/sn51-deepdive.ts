import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const o = await p.subnetOverride.findUnique({ where: { netuid: 51 } });
if (o) {
  console.log("name:", o.name);
  console.log("desc:", (o.description ?? "").slice(0, 300));
  console.log("minVramGb:", o.minVramGb, "| recGpu:", o.recommendedGpu, "| gpuCount:", o.gpuCount);
  console.log("reqSource:", o.requirementsSource, "| scrapedAt:", o.requirementsScrapedAt?.toISOString());
  if (o.hostingRequirements) console.log("hosting:", o.hostingRequirements.slice(0, 500));
  if (o.mechanicsJson) console.log("mechanics:", o.mechanicsJson.slice(0, 400));
} else console.log("no override for 51");
await p.$disconnect();
