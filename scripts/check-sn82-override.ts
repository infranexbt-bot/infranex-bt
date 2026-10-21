import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const main = async () => {
  const o = await db.subnetOverride.findUnique({ where: { netuid: 82 } });
  console.log(JSON.stringify(o, null, 2));
};
main().finally(() => db.$disconnect());
