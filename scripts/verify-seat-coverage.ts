/**
 * Verify Seat Chance + Seat Safety coverage for EVERY subnet in the live snapshot.
 * Run: bun scripts/verify-seat-coverage.ts
 */
import { PrismaClient } from "@prisma/client";
import { assessSeatChance } from "../src/lib/infranex/miner-score";

const db = new PrismaClient();

const snap = await db.chainSnapshot.findFirst({ orderBy: { id: "desc" } });
const live = JSON.parse(snap.subnetsJson) as Array<{
  netuid: number; name?: string | null; maxUids?: number | null; minersCount?: number | null;
  burnCostTao?: number | null; immunityBlocks?: number | null; rewardedMiners?: number | null;
}>;

const verdicts = { open: 0, "burn-entry": 0, waitlist: 0, unknown: 0 } as Record<string, number>;
const unknownList: string[] = [];

for (const s of live) {
  const seat = assessSeatChance({
    minersCount: s.minersCount ?? null,
    maxUids: s.maxUids ?? null,
    burnCostTao: s.burnCostTao ?? null,
    immunityBlocks: s.immunityBlocks ?? null,
    rewardedMiners: s.rewardedMiners ?? null,
  });
  verdicts[seat.verdict]++;
  if (seat.verdict === "unknown") unknownList.push(`SN${s.netuid}`);
}

console.log(`subnets assessed: ${live.length}`);
for (const [v, n] of Object.entries(verdicts)) console.log(`  ${v.padEnd(11)} ${n}`);
if (unknownList.length) console.log("unknown:", unknownList.join(", "));

// Sample output for a few subnets across verdicts
const samples = [64, 1, 97, 120];
for (const netuid of samples) {
  const s = live.find((x) => x.netuid === netuid);
  if (!s) continue;
  const seat = assessSeatChance({
    minersCount: s.minersCount ?? null,
    maxUids: s.maxUids ?? null,
    burnCostTao: s.burnCostTao ?? null,
    immunityBlocks: s.immunityBlocks ?? null,
    rewardedMiners: s.rewardedMiners ?? null,
  });
  console.log(`\nSN${netuid} ${s.name ?? ""}: ${seat.headline}`);
  console.log(`  verdict=${seat.verdict} immunity=${seat.immunityHours ?? "-"}h replaceable=${seat.replaceableShare != null ? Math.round(seat.replaceableShare * 100) + "%" : "-"}`);
}

await db.$disconnect();
