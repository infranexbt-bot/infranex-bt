import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const t: Record<string, any> = {
  users: await db.appUser.count(),
  overrides: await db.subnetOverride.count(),
  requirements: await db.subnetRequirements.count(),
  providerKeys: await db.providerKey.count(),
  judgeProfiles: await db.judgeProfile.count(),
  judgeRuns: await db.judgeRun.count(),
  gpuHosts: await db.gpuHost.count(),
  wallets: await db.walletProfile.count(),
  deployments: await db.deployment.count(),
};
console.log(JSON.stringify(t));
await db.$disconnect();
