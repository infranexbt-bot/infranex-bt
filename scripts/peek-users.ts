import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const rows = await db.appUser.findMany({ orderBy: { userId: "asc" } });
for (const r of rows)
  console.log(
    r.userId, "| role:", r.role, "| active:", r.active,
    "| created:", String(r.createdAt), "| lastLogin:", String(r.lastLoginAt),
    "| codeEncLen:", r.codeEnc?.length ?? 0
  );
await db.$disconnect();
