// DB integrity snapshot via Prisma (sqlite3 CLI not installed).
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const counts: Record<string, number> = {};
  counts.AppUsers = await db.appUser.count();
  counts.ProviderKeys = await db.providerKey.count();
  counts.ChainSnapshot = await db.chainSnapshot.count();
  counts.SubnetOverride = await db.subnetOverride.count();
  counts.WalletProfile = await db.walletProfile.count();
  counts.GpuHost = await db.gpuHost.count();
  counts.HostInstall = await db.hostInstall.count();
  counts.SubnetRequirements = await db.subnetRequirements.count();
  counts.Deployment = await db.deployment.count();
  counts.WorkerStatus = await db.workerStatus.count();
  counts.AuditLog = await db.auditLog.count();
  counts.JudgeProfile = await db.judgeProfile.count();
  counts.JudgeRun = await db.judgeRun.count();
  counts.PlatformSettings = await db.platformSettings.count().catch(() => -1);

  console.log("=== DB row counts ===");
  for (const [k, v] of Object.entries(counts)) console.log(`${k}: ${v}`);

  // Freshness of live-scraped overrides
  const recent = await db.subnetOverride.findMany({
    orderBy: { requirementsScrapedAt: "desc" },
    take: 5,
    select: { netuid: true, name: true, requirementsSource: true, requirementsScrapedAt: true, githubUrl: true },
  });
  console.log("\n=== freshest scraped overrides ===");
  for (const r of recent) console.log(JSON.stringify(r));

  const withScrape = await db.subnetOverride.count({ where: { requirementsScrapedAt: { not: null } } });
  const withGithub = await db.subnetOverride.count({ where: { githubUrl: { not: null } } });
  console.log(`\noverrides with githubUrl: ${withGithub} | with scrape timestamp: ${withScrape}`);

  // Worker statuses
  const ws = await db.workerStatus.findMany({ take: 12, orderBy: { id: "asc" } });
  console.log("\n=== worker status sample ===");
  for (const w of ws) {
    const anyW = w as any;
    console.log(`${anyW.worker ?? anyW.name ?? anyW.kind ?? "?"} | ${anyW.status ?? "?"} | last=${anyW.lastRunAt?.toISOString?.() ?? anyW.lastRunAt ?? "?"}`);
  }

  // Audit log freshness
  const lastAudit = await db.auditLog.findMany({ take: 5, orderBy: { id: "desc" } });
  console.log("\n=== latest audit entries ===");
  for (const a of lastAudit) {
    const anyA = a as any;
    console.log(`${anyA.at?.toISOString?.() ?? anyA.at ?? "?"} | ${anyA.action ?? anyA.kind ?? "?"} | ${String(anyA.detail ?? anyA.meta ?? "").slice(0, 80)}`);
  }

  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
