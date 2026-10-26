// WIN-ODDS-FLIP-TEST — end-to-end test of the seat-flip watcher:
//   1. insert two FAKE ChainSnapshot rows where netuid 999's reward spread
//      improves (DONT_ENTER → FIGHTABLE)
//   2. run runWinTierWatchPass() → expect a SEAT_FLIP finding
//   3. run again → dedupe (no duplicate)
//   4. insert a regression snapshot → open event auto-resolves
//   5. cleanup: delete fake snapshots + test events (real data untouched)
// Run: npx tsx scripts/win-odds-flip-test.ts

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const TEST_NETUID = 999;

function snapJson(netuid: number, name: string, miners: number, rewarded: number, top10: number): string {
  return JSON.stringify([
    { netuid, name, minersCount: miners, rewardedMiners: rewarded, top10IncentiveShare: top10, maxUids: 256 },
  ]);
}

async function insertSnapshot(block: number, subnetsJson: string): Promise<number> {
  const row = await db.chainSnapshot.create({
    data: {
      blockNumber: block,
      totalSubnets: 1,
      scannedSubnets: 1,
      neuronCount: minersOf(subnetsJson),
      taoPriceUsd: 250,
      taoMarketCapUsd: 1,
      taoChange24h: 0,
      subnetsJson,
      neuronsJson: "[]",
      source: "win-odds-flip-test",
    },
  });
  return row.id;
}
function minersOf(json: string): number {
  try { return (JSON.parse(json)[0]?.minersCount as number) ?? 0; } catch { return 0; }
}

async function main() {
  const { runWinTierWatchPass } = await import("../src/lib/infranex/win-odds-watch");

  // cleanup any leftovers from a previous run first
  await db.triggerEvent.deleteMany({ where: { kind: "SEAT_FLIP", netuid: TEST_NETUID } });
  await db.chainSnapshot.deleteMany({ where: { source: "win-odds-flip-test" } });

  // 1) prev = DONT_ENTER (3% rewarded, whales 90%) → cur = FIGHTABLE (40% rewarded, whales 70%)
  const prevId = await insertSnapshot(1, snapJson(TEST_NETUID, "FLIP-TEST", 100, 3, 0.9));
  const curId = await insertSnapshot(2, snapJson(TEST_NETUID, "FLIP-TEST", 100, 40, 0.7));

  // 2) first pass → should commit
  const r1 = await runWinTierWatchPass();
  console.log("pass#1:", r1);
  const ev = await db.triggerEvent.findFirst({
    where: { kind: "SEAT_FLIP", netuid: TEST_NETUID, dedupeKey: `seat-flip-${TEST_NETUID}-DONT_ENTER-to-FIGHTABLE` },
  });
  if (!ev) throw new Error("expected SEAT_FLIP event committed");
  console.log("event:", ev.title, "| severity:", ev.severity, "| status:", ev.status);
  console.log("detail:", ev.detail.slice(0, 160) + "…");

  // 3) second pass → dedupe, no duplicate
  const r2 = await runWinTierWatchPass();
  console.log("pass#2 (dedupe):", r2);
  const count = await db.triggerEvent.count({ where: { kind: "SEAT_FLIP", netuid: TEST_NETUID } });
  if (count !== 1) throw new Error(`dedupe failed — ${count} events`);

  // 4) regression: spread collapses again → open event must resolve
  await insertSnapshot(3, snapJson(TEST_NETUID, "FLIP-TEST", 100, 2, 0.97));
  const r3 = await runWinTierWatchPass();
  console.log("pass#3 (regression):", r3);
  const reopened = await db.triggerEvent.findFirst({ where: { id: ev.id } });
  if (!reopened || reopened.status !== "resolved") throw new Error("expected event auto-resolved on regression");

  // 5) cleanup fakes + test event
  const del = await db.chainSnapshot.deleteMany({ where: { source: "win-odds-flip-test" } });
  const delEv = await db.triggerEvent.deleteMany({ where: { kind: "SEAT_FLIP", netuid: TEST_NETUID } });
  console.log(`cleanup: ${del.count} fake snapshots, ${delEv.count} test events deleted`);

  const realCount = await db.chainSnapshot.count();
  console.log(`real snapshots intact: ${realCount}`);
  console.log("ALL FLIP-WATCHER CHECKS PASSED");
}

main()
  .catch((e) => {
    console.error("FLIP TEST FAILED:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
