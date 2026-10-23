import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const main = async () => {
  const rows = await db.profitabilitySettings.findMany();
  console.log(JSON.stringify(rows, null, 2));
};
main().finally(() => db.$disconnect());
