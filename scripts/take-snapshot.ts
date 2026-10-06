/**
 * take-snapshot.ts — one-off: run fetchLiveSnapshot() and persist one
 * ChainSnapshot row (same payload shape as the chain-scanner worker).
 *
 * Run: bun --smol scripts/take-snapshot.ts
 */
import { PrismaClient } from "@prisma/client";
import { fetchLiveSnapshot } from "../src/lib/infranex/chain";

const db = new PrismaClient();

async function main() {
  const snap = await fetchLiveSnapshot();
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
  console.log(
    `snapshot saved: block=${snap.blockNumber} subnets=${snap.subnets.length} tao=$${snap.taoPriceUsd} source=${snap.source}`
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
