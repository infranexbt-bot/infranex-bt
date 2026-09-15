import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const rows = await db.deployment.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      minerName: true,
      status: true,
      mode: true,
      provider: true,
      providerPodId: true,
      installStatus: true,
      progress: true,
      steps: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  for (const r of rows) {
    const steps = JSON.parse(r.steps as string) as { name: string; status: string }[];
    console.log("=== " + r.minerName + " (" + r.id + ") ===");
    console.log("  status:", r.status, "| mode:", r.mode, "| provider:", r.provider);
    console.log("  providerPodId:", r.providerPodId, "| installStatus:", r.installStatus, "| progress:", r.progress);
    console.log("  steps:", steps.map((s) => `${s.name}=${s.status}`).join(" "));
    console.log("  createdAt:", r.createdAt, "| updatedAt:", r.updatedAt);
  }
}

main().finally(() => db.$disconnect());
