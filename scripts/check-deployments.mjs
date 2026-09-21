import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const rows = await db.deployment.findMany({
  select: { id: true, minerName: true, netuid: true, status: true, mode: true, provider: true, installStatus: true, registrationState: true, registeredUid: true, hotkey: true, walletProfileId: true },
  take: 10,
  orderBy: { createdAt: "desc" },
});
console.log(JSON.stringify(rows, null, 1));
const gpu = await db.gpuSample.count();
const probe = await db.probeSample.count();
const traffic = await db.trafficSample.count();
console.log("samples:", { gpu, probe, traffic });
await db.$disconnect();
