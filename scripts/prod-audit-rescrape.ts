// PROD-AUDIT FIX phase 2 (resumable): re-scrape override rows whose URL was
// corrected/created but whose requirements were not yet re-derived from the
// new repo. Condition: requirementsScrapedAt IS NULL OR < updatedAt.
// Processes up to N rows per run so each run fits a tool timeout; re-run
// until "remaining: 0".
import { PrismaClient } from "@prisma/client";
import { scrapeGithubMetadata } from "../src/lib/infranex/github-scraper";

const db = new PrismaClient();
const BATCH = Number(process.argv[2] ?? 999);
const CONC = 8;

async function scrapeOne(o: any): Promise<"ok" | "err"> {
  const anyO = o;
  try {
    const s = await scrapeGithubMetadata(anyO.githubUrl, { netuid: o.netuid, subnetName: o.name ?? `sn${o.netuid}` });
    if (s.source === "github") {
      await db.subnetOverride.update({
        where: { netuid: o.netuid },
        data: {
          description: s.description,
          minVramGb: s.minVramGb,
          recommendedGpu: s.recommendedGpu,
          gpuCount: s.gpuCount,
          hostingRequirements: s.hosting ? JSON.stringify(s.hosting) : null,
          mechanicsJson: s.mechanics ? JSON.stringify(s.mechanics) : null,
          infraJson: s.infra ? JSON.stringify(s.infra) : null,
          requirementsSource: s.requirementsSource,
          requirementsScrapedAt: new Date(),
        },
      });
      console.log(`OK  sn${o.netuid} ${o.name ?? ""}: gpu=${s.recommendedGpu} vram=${s.minVramGb} desc="${(s.description ?? "").slice(0, 70)}"`);
      return "ok";
    }
    await db.subnetOverride.update({
      where: { netuid: o.netuid },
      data: { requirementsScrapedAt: new Date(), requirementsSource: `error:${(s.error ?? "no readme").slice(0, 120)}` },
    });
    console.log(`ERR sn${o.netuid} ${o.name ?? ""}: ${s.error ?? "no readme"}`);
    return "err";
  } catch (e: any) {
    await db.subnetOverride.update({
      where: { netuid: o.netuid },
      data: { requirementsScrapedAt: new Date(), requirementsSource: `error:${String(e.message).slice(0, 120)}` },
    });
    console.log(`EXC sn${o.netuid} ${o.name ?? ""}: ${e.message?.slice(0, 90)}`);
    return "err";
  }
}

async function main() {
  const all = await db.subnetOverride.findMany();
  const todo = all.filter((o: any) => o.githubUrl && (!o.requirementsScrapedAt || o.requirementsScrapedAt < o.updatedAt));
  console.log(`remaining to re-scrape: ${todo.length}`);
  const batch = todo.slice(0, BATCH);
  let scraped = 0, errored = 0, idx = 0;
  async function worker() {
    while (idx < batch.length) {
      const o = batch[idx++];
      const r = await scrapeOne(o);
      r === "ok" ? scraped++ : errored++;
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  const left = (await db.subnetOverride.findMany()).filter((o: any) => o.githubUrl && (!o.requirementsScrapedAt || o.requirementsScrapedAt < o.updatedAt)).length;
  console.log(`run done: scraped=${scraped} errors=${errored} remaining=${left}`);
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
