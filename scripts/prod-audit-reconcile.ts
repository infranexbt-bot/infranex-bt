// PROD-AUDIT FIX: reconcile SubnetOverride.githubUrl + name with the LIVE
// chain identity registry (SubnetIdentitiesV3.githubRepo) — the chain is
// authoritative per DATA-AUDIT-1. After URL corrections, re-scrape ONLY the
// corrected/created rows from their real GitHub repos (same pipeline as
// sync-all) so descriptions / GPU classification / requirements are rebuilt
// from the right README.
import { PrismaClient } from "@prisma/client";
import { fetchLiveSnapshot } from "../src/lib/infranex/chain";
import { scrapeGithubMetadata } from "../src/lib/infranex/github-scraper";

const db = new PrismaClient();

function plausibleRepo(u: string): string | null {
  if (!u) return null;
  let url = u.trim().replace(/\/+$/, "");
  const m = url.match(/^https?:\/\/(www\.)?github\.com\/([^/]+)\/([^/#?]+)/i);
  if (!m) return null;
  const owner = m[2];
  const repo = m[3];
  if (!owner || !repo || /^click here$/i.test(repo)) return null;
  return `https://github.com/${owner}/${repo}`;
}

async function main() {
  const snap = await fetchLiveSnapshot();
  const rows: any[] = (snap as any).subnets ?? (snap as any).rows ?? [];
  console.log(`chain rows: ${rows.length}`);

  const corrections: Array<{ netuid: number; name: string; from: string | null; to: string }> = [];
  const creations: Array<{ netuid: number; name: string; to: string }> = [];
  const targets: Array<{ netuid: number; name: string; githubUrl: string }> = [];

  for (const r of rows) {
    const repo = plausibleRepo(r.identityGithub ?? "");
    if (!repo) continue;
    const existing = await db.subnetOverride.findUnique({ where: { netuid: r.netuid } });
    if (!existing) {
      await db.subnetOverride.create({
        data: { netuid: r.netuid, name: r.name ?? null, githubUrl: repo },
      });
      creations.push({ netuid: r.netuid, name: r.name ?? `sn${r.netuid}`, to: repo });
      targets.push({ netuid: r.netuid, name: r.name ?? `sn${r.netuid}`, githubUrl: repo });
    } else if ((existing as any).githubUrl !== repo) {
      corrections.push({ netuid: r.netuid, name: r.name ?? `sn${r.netuid}`, from: (existing as any).githubUrl, to: repo });
      await db.subnetOverride.update({
        where: { netuid: r.netuid },
        data: { githubUrl: repo, ...(existing.name ? {} : { name: r.name ?? null }) },
      });
      targets.push({ netuid: r.netuid, name: r.name ?? `sn${r.netuid}`, githubUrl: repo });
    }
  }

  console.log(`\n=== URL corrections (override <- chain identity) ===`);
  for (const c of corrections) console.log(`  sn${c.netuid} ${c.name}: ${c.from} -> ${c.to}`);
  console.log(`\n=== new rows created from chain identity ===`);
  for (const c of creations) console.log(`  sn${c.netuid} ${c.name}: ${c.to}`);

  console.log(`\n=== re-scraping ${targets.length} corrected rows from their real repos ===`);
  let scraped = 0, errored = 0;
  for (const t of targets) {
    try {
      const s = await scrapeGithubMetadata(t.githubUrl, { netuid: t.netuid, subnetName: t.name });
      if (s.source === "github") {
        await db.subnetOverride.update({
          where: { netuid: t.netuid },
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
            githubUrl: t.githubUrl,
          },
        });
        scraped++;
        console.log(`  OK  sn${t.netuid} ${t.name}: gpu=${s.recommendedGpu} vram=${s.minVramGb} desc="${(s.description ?? "").slice(0, 70)}"`);
      } else {
        errored++;
        console.log(`  ERR sn${t.netuid} ${t.name}: ${s.error ?? "no README"}`);
      }
    } catch (e: any) {
      errored++;
      console.log(`  EXC sn${t.netuid} ${t.name}: ${e.message?.slice(0, 80)}`);
    }
  }
  const total = await db.subnetOverride.count();
  console.log(`\nDONE: corrections=${corrections.length} creations=${creations.length} rescraped=${scraped} errors=${errored} totalOverrides=${total}`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
