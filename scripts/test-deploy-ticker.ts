/**
 * E2E for DEPLOY-2 (server-side deployment auto-ticker).
 * Creates a MOCK deployment, then ONLY watches — the advancing must be
 * done by the server's deploy-ticker worker, not by this script (no
 * tickDeployment calls here, no browser open).
 */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const SUBNET = { netuid: 4, name: "TaoStaking" } as const;

const OFFER = {
  id: "e2e-mock-offer",
  provider: "RunPod" as const,
  providerKey: "runpod",
  model: "RTX 3090",
  vramGb: 24,
  region: "us-east",
  hourlyPrice: 0.22,
  available: true,
} as never; // shape-compatible GPUOffer for config building

async function main() {
  const { createDeployment } = await import("../src/lib/infranex/deployment/engine");
  const rec = await createDeployment({
    subnet: SUBNET as never,
    offer: OFFER,
    minerName: "ticker-e2e-01",
    mode: "mock",
    walletName: "e2e-wallet",
    hotkey: "e2e-hotkey",
  });
  console.log(`created ${rec.id} status=${rec.status} — watching (server ticker must advance it)...`);

  const deadline = Date.now() + 180_000;
  let last = "";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const row = await db.deployment.findUnique({ where: { id: rec.id } });
    if (!row) { console.log("row deleted — aborting"); return; }
    const steps = JSON.parse(row.steps as string) as { name: string; status: string }[];
    const sig = `${row.status}|${steps.map((s) => s.status[0]).join("")}`;
    if (sig !== last) {
      last = sig;
      const elapsed = Math.round((Date.now() - (deadline - 180_000)) / 1000);
      console.log(`t+${elapsed}s  status=${row.status}  install=${row.installStatus ?? "-"}  steps: ${steps.map((s) => `${s.name}=${s.status}`).join(" ")}`);
    }
    if (row.status === "started") {
      console.log("PASS — deployment reached 'started' with NO browser and NO script-side ticks.");
      await db.deployment.delete({ where: { id: rec.id } });
      console.log("cleanup: test deployment deleted.");
      return;
    }
    if (row.status === "failed") {
      const steps2 = JSON.parse(row.steps as string) as { name: string; status: string; output: string[] }[];
      console.log("FAIL — deployment went failed:", steps2.find((s) => s.status === "failed")?.output.join(" | "));
      await db.deployment.delete({ where: { id: rec.id } });
      process.exit(1);
    }
  }
  console.log("TIMEOUT — deployment did not reach 'started' in 180s (ticker not advancing?).");
  await db.deployment.delete({ where: { id: rec.id } });
  process.exit(1);
}

main().finally(() => db.$disconnect());
