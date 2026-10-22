import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const main = async () => {
  const snaps = await db.chainSnapshot.findMany({ orderBy: { createdAt: "asc" } });
  console.log(`snapshots: ${snaps.length}`);
  for (const s of snaps) console.log(`  id=${s.id} block=${s.blockNumber} at=${s.createdAt.toISOString()} source=${s.source}`);
  if (snaps.length > 1) {
    const keep = snaps[snaps.length - 1];
    const del = await db.chainSnapshot.deleteMany({ where: { id: { not: keep.id } } });
    console.log(`deleted ${del.count} older snapshot(s), kept id=${keep.id} block=${keep.blockNumber}`);
  }
};
main().finally(() => db.$disconnect());
