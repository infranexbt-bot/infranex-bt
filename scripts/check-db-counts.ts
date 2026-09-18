// Row counts for key tables after environment restore
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const counts: Record<string, number> = {};
  counts.appUser = await db.appUser.count();
  counts.subnetOverride = await db.subnetOverride.count();
  counts.gpuHost = await db.gpuHost.count();
  counts.hostInstall = await db.hostInstall.count();
  counts.deployment = await db.deployment.count();
  counts.daemonState = await db.daemonState.count();
  counts.triggerEvent = await db.triggerEvent.count();
  counts.auditLog = await db.auditLog.count();
  counts.platformSettings = await db.platformSettings.count();
  counts.walletProfile = await db.walletProfile.count();
  counts.judgeRun = await db.judgeRun?.count?.() ?? -1;
  console.log(JSON.stringify(counts, null, 2));
}
main().finally(() => db.$disconnect());
