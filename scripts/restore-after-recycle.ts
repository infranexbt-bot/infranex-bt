/**
 * restore-after-recycle.ts — one-off restore after a sandbox DB wipe.
 *
 * Order matters (merge-playbook validates playbook netuids against
 * SubnetOverride, so overrides must exist first):
 *   1. fetchLiveSnapshot() → persist to ChainSnapshot (same shape as runChainWorker)
 *   2. Upsert base SubnetOverride rows for curated ∪ chain-identity repos
 *      (fast, no GitHub scraping — enrichment can follow via
 *      sync-overrides-standalone.ts)
 *
 * Run: DATABASE_URL=file:... bun --smol scripts/restore-after-recycle.ts
 */
import { PrismaClient } from "@prisma/client";
import { fetchLiveSnapshot } from "../src/lib/infranex/chain";
import { curatedSubnetSeeds } from "../src/lib/infranex/data";

const db = new PrismaClient();

async function main() {
  // 1) Live chain snapshot → ChainSnapshot
  console.log("fetching live chain snapshot ...");
  const snap = await fetchLiveSnapshot();
  console.log(
    `block=${snap.blockNumber} subnets=${snap.subnets.length} neurons=${snap.neurons.length} source=${snap.source}`
  );
  await db.chainSnapshot.create({
    data: {
      blockNumber: snap.blockNumber,
      totalSubnets: snap.totalSubnets,
      scannedSubnets: snap.subnets.length,
      neuronCount: snap.neurons.length,
      taoPriceUsd: snap.taoPriceUsd,
      taoMarketCapUsd: snap.taoMarketCapUsd,
      taoChange24h: snap.taoChange24h,
      subnetsJson: JSON.stringify(snap.subnets),
      neuronsJson: JSON.stringify(snap.neurons),
      source: snap.source,
    },
  });
  console.log("ChainSnapshot persisted.");

  // 2) Universe: curated ∪ chain identity githubs
  const seen = new Map<number, { url: string; name: string | null }>();
  for (const seed of curatedSubnetSeeds) {
    seen.set(seed.netuid, { url: seed.githubUrl, name: seed.name ?? null });
  }
  for (const s of snap.subnets) {
    if (s.identityGithub && !seen.has(s.netuid)) {
      seen.set(s.netuid, { url: s.identityGithub, name: s.name ?? null });
    } else if (s.identityGithub && s.name && seen.get(s.netuid) && !seen.get(s.netuid)!.name) {
      seen.get(s.netuid)!.name = s.name;
    }
  }
  console.log(`override universe: ${seen.size} subnets`);

  let upserted = 0;
  for (const [netuid, { url, name }] of seen) {
    await db.subnetOverride.upsert({
      where: { netuid },
      create: { netuid, githubUrl: url, name },
      update: { githubUrl: url, ...(name ? { name } : {}) },
    });
    upserted++;
  }
  console.log(`SubnetOverride base rows upserted: ${upserted}`);
}

main()
  .catch((e) => {
    console.error("RESTORE FAILED:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
