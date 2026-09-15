// Seed one mock Targon (SN4) deployment so Judge Lab fix-apply has a target.
// Idempotent: reuses the existing "targon-demo-01" if present.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const ROOT = "/home/z/my-project";

const config = {
  subnet: { netuid: 4, name: "Targon", symbol: "SN4", category: "GPU inference", minVramGb: 24, recommendedGpu: "RTX 4090" },
  gpu: { model: "RTX 4090", vramGb: 24, provider: "mock", hourlyPrice: 0.35, monthlyPrice: 252, region: "us-east" },
  docker: {
    imageName: "infranex/targon-miner:latest",
    runtime: "nvidia" as const,
    ports: ["8091:8091"],
    volumes: [{ path: "/data", sizeGb: 20 }],
    envVars: [
      { name: "INFANEX_QUANT", value: "int4", secret: false },
      { name: "INFANEX_ASK_PRICE_USD", value: "0.62", secret: false },
    ],
    command: "python -m targon_miner --netuid 4",
  },
};

async function main() {
  const existing = await db.deployment.findFirst({ where: { minerName: "targon-demo-01" } });
  if (existing) {
    console.log("deployment exists:", existing.id);
    return;
  }
  const d = await db.deployment.create({
    data: {
      minerName: "targon-demo-01",
      netuid: 4,
      subnetName: "Targon",
      gpuModel: "RTX 4090",
      provider: "mock",
      status: "running",
      progress: 100,
      mode: "mock",
      hourlyCost: 0.35,
      monthlyCost: 252,
      estimatedRevenue: 380,
      config: JSON.stringify(config),
    },
  });
  console.log("created:", d.id, d.minerName, "netuid", d.netuid);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
