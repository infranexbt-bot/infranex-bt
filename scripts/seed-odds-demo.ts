// Verify winner-stability trends end-to-end by seeding a SHORT burst of
// synthetic ChainSnapshot rows (~1.6h of 1-min scans), checking the batch
// odds endpoint, then deleting exactly what was inserted.
//
// Pattern: SN36 frozen @2, SN2 widening 28→31, SN1 frozen @4, SN3 thin.
// Everything else gets a constant 10 so unrelated rows look stable.
//
// Run:  bun scripts/seed-odds-demo.ts seed|purge

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const MARKER = "odds-demo";
const COUNT = 40; // 40 synthetic scans
const STEP_MS = 2.4 * 60 * 1000; // 2.4 min apart → ~1.6h span

const live = { blockNumber: 9_100_000, totalSubnets: 129, scannedSubnets: 129, neuronCount: 29_718, taoPriceUsd: 231.22, taoMarketCapUsd: 4_800_000_000, taoChange24h: 1.2, source: MARKER };

function subnetsJson(scan: number): string {
  const rewarded = (n: number, base: number, slope: number) =>
    Math.max(1, Math.round(base + slope * (scan / (COUNT - 1))));
  const mk = (netuid: number, rewardedMiners: number, minersCount: number) => ({
    netuid, rewardedMiners, minersCount,
    emissionEnabled: true,
  });
  return JSON.stringify([
    mk(0, 24, 256), mk(1, 4, 200), mk(2, rewarded(2, 28, 3), 240),
    mk(3, 5, 128), mk(4, 6, 190), mk(36, rewarded(36, 2, 0), 19),
    ...Array.from({ length: 20 }, (_, i) => mk(100 + i, 10, 100)),
  ]);
}

async function seed() {
  const ids: number[] = [];
  for (let i = 0; i < COUNT; i++) {
    const row = await db.chainSnapshot.create({
      data: {
        ...live,
        subnetsJson: subnetsJson(i),
        createdAt: new Date(Date.now() - (COUNT - 1 - i) * STEP_MS),
      },
      select: { id: true },
    });
    ids.push(row.id);
  }
  console.log(`seeded ${ids.length} rows: ${ids[0]}..${ids[ids.length - 1]}`);
}

async function purge() {
  const del = await db.chainSnapshot.deleteMany({ where: { source: MARKER } });
  console.log(`purged ${del.count} synthetic rows`);
}

const cmd = process.argv[2] ?? "seed";
if (cmd === "seed") await seed();
else if (cmd === "purge") await purge();
else { console.error("usage: seed|purge"); process.exit(1); }
await db.$disconnect();
