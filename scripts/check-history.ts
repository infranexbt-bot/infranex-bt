import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const count = await db.chainSnapshot.count();
const first = await db.chainSnapshot.findFirst({ orderBy: { id: "asc" }, select: { createdAt: true } });
const last = await db.chainSnapshot.findFirst({ orderBy: { id: "desc" }, select: { createdAt: true } });
console.log("snapshots:", count, "| first:", first?.createdAt, "| last:", last?.createdAt);
const recent = await db.chainSnapshot.findMany({ orderBy: { id: "desc" }, take: 3, select: { id: true, blockNumber: true, createdAt: true, subnetsJson: true } });
for (const s of recent) {
  const subs = JSON.parse(s.subnetsJson);
  const sn36 = subs.find((x: { netuid: number }) => x.netuid === 36);
  console.log(`#${s.id} block ${s.blockNumber} ${s.createdAt.toISOString()} | SN36 rewarded:`, sn36?.rewardedMiners, "| miners:", sn36?.minersCount);
}
await db.$disconnect();
