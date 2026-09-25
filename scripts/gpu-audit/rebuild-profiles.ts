/**
 * rebuild-profiles.ts — GPU-TAXONOMY: rebuild + recache SubnetRequirements
 * profiles for every subnet with repo-verified GPU data (plus the ones whose
 * stale GPU values were cleared), so the requirements dialog / deploy wizard
 * serves the corrected spec immediately instead of building on first open.
 *
 * Sequential on purpose: fetchLiveSnapshot caches for 60s, so only the first
 * call pays the chain fetch.
 *
 * Run: npx tsx scripts/gpu-audit/rebuild-profiles.ts
 */

import { PrismaClient } from "@prisma/client";
import { pullSubnetRequirements } from "../../src/lib/devops/subnet-requirements";

const db = new PrismaClient();

const NETUIDS = [
  7, 9, 10, 12, 14, 17, 18, 21, 22, 29, 32, 33, 34, 43, 45, 48, 49, 50, 54,
  60, 63, 64, 69, 72, 74, 79, 83, 88, 90, 96, 101, 103, 104, 107, 123, 124,
];

async function main() {
  for (const netuid of NETUIDS) {
    try {
      const { profile, cached } = await pullSubnetRequirements(netuid, { refresh: true });
      console.log(
        `SN${String(netuid).padStart(3)} | ${String(profile.recommendedGpu ?? "-").padEnd(24)} vram=${String(profile.minVramGb ?? "-").padEnd(4)} src=${profile.gpuSource.padEnd(11)} conf=${profile.confidence.padEnd(6)} ${cached ? "(cached)" : "(rebuilt)"} | ${profile.subnetName}`
      );
    } catch (e) {
      console.log(`SN${String(netuid).padStart(3)} | ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await db.$disconnect();
}

main().catch(async (e) => { console.error(e); process.exit(1); });
