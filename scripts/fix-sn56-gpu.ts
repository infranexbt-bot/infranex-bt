// One-off surgical fix: SN56 Gradients GPU spec was validator-side hardware
// (Basilica A100 eval) mislabeled as miner requirement. Miner guide verbatim:
// "You do not need to provide tournament compute..." -> CPU-only endpoint.
// Mirrors the corrected CURATED_GPU_SPECS[56] entry in github-scraper.ts.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const row = await db.subnetOverride.findUnique({ where: { netuid: 56 } });
  console.log("BEFORE:", JSON.stringify(
    { netuid: 56, name: row?.name, minVramGb: row?.minVramGb, recommendedGpu: row?.recommendedGpu,
      requirementsSource: row?.requirementsSource, scrapedAt: row?.requirementsScrapedAt },
    null, 2,
  ));

  const updated = await db.subnetOverride.update({
    where: { netuid: 56 },
    data: {
      minVramGb: 0,
      recommendedGpu: "None (CPU-only)",
    },
  });
  console.log("AFTER:", JSON.stringify(
    { netuid: 56, name: updated.name, minVramGb: updated.minVramGb, recommendedGpu: updated.recommendedGpu },
    null, 2,
  ));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
