// Inspect overrides for suspect netuids (1, 7) + how many overrides look
// possibly-stale vs chain metadata.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  for (const n of [1, 7, 9, 3, 19, 23]) {
    const o = await db.subnetOverride.findUnique({ where: { netuid: n } });
    if (!o) { console.log(`sn${n}: no override`); continue; }
    const anyO = o as any;
    console.log(
      `sn${n}: name=${o.name} | repo=${anyO.githubUrl} | gpu=${anyO.recommendedGpu} | vram=${anyO.minVramGb} | scrapedAt=${o.requirementsScrapedAt?.toISOString?.()}`
    );
  }
  const total = await db.subnetOverride.count();
  const macro = await db.subnetOverride.findMany({
    where: { OR: [{ name: { contains: "Apex" } }, { githubUrl: { contains: "apex" } }] },
    select: { netuid: true, name: true },
  });
  console.log("apex-named rows:", JSON.stringify(macro), `| total overrides: ${total}`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
