import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const tables: any[] = await db.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%napshot%'`);
console.log("snapshot tables:", tables.map(t => t.name));
for (const t of tables) {
  const cols: any[] = await db.$queryRawUnsafe(`PRAGMA table_info("${t.name}")`);
  console.log(t.name, "->", cols.map(c => c.name).join(","));
}
await db.$disconnect();
