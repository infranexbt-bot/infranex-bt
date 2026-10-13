import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const n: any[] = await db.$queryRawUnsafe(`SELECT COUNT(*) c FROM UidSnapshot WHERE netuid=32`);
console.log("uid snapshots:", n[0].c);
await db.$disconnect();
