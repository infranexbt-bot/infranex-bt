// Check which tables exist in the app's database + verify DATABASE_URL resolution.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const tables = await db.$queryRawUnsafe<{ name: string }[]>(
  `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
);
console.log("tables:", tables.map((t) => t.name).join(", "));
const hasTrigger = tables.some((t) => t.name === "TriggerEvent");
console.log("TriggerEvent exists:", hasTrigger);
console.log("DATABASE_URL:", process.env.DATABASE_URL ?? "(unset)");
await db.$disconnect();
