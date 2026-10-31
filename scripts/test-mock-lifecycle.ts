/**
 * MOCK ENGINE TEST — drives one mock deployment through the FULL lifecycle
 * using the engine's own state machine (requested → approved → provisioning
 * → provisioned → setup → ready → deploying → started).
 *
 * mode:"mock" is the engine test harness: the pod is scripted
 * (MockDeploymentTransport — every output line labeled "(mock pod)"),
 * the install plan is REAL (staged from the subnet requirements profiler),
 * and every state write goes through the same code paths as production.
 *
 * Keeps the deployment in the DB at terminal state so the UI can be
 * inspected. Run with DELETE=1 to clean up afterwards.
 */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const SUBNET = { netuid: 4, name: "TaoStaking" } as const;
const OFFER = {
  id: "mock-lifecycle-offer",
  provider: "RunPod" as const,
  providerKey: "runpod",
  model: "RTX 3090",
  vramGb: 24,
  region: "us-east",
  hourlyPrice: 0.22,
  available: true,
} as never;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const engine = await import("../src/lib/infranex/deployment/engine");

  const rec = await engine.createDeployment({
    subnet: SUBNET as never,
    offer: OFFER,
    minerName: "MOCK-LIFECYCLE-01",
    mode: "mock",
    walletName: "demo-wallet",
    hotkey: "demo-hotkey",
  });
  console.log(`[create] ${rec.id} status=${rec.status} (mode=mock)`);

  const deadline = Date.now() + 150_000;
  let last = "";
  while (Date.now() < deadline) {
    await sleep(1500);
    const ticked = await engine.tickDeployment(rec.id);
    const row = await db.deployment.findUnique({ where: { id: rec.id } });
    if (!row) { console.log("row deleted — aborting"); return; }
    const steps = JSON.parse(row.steps as string) as { name: string; status: string }[];
    const sig = `${row.status}|${row.installStatus ?? "-"}|${steps.map((s) => s.status[0]).join("")}`;
    if (sig !== last) {
      last = sig;
      const t = Math.round((Date.now() - (deadline - 150_000)) / 1000);
      console.log(
        `t+${t}s  status=${row.status}  install=${row.installStatus ?? "-"}  ` +
        `steps: ${steps.map((s) => `${s.name}=${s.status}`).join(" ")}`
      );
    }
    if (row.status === "started") {
      const steps2 = JSON.parse(row.steps as string) as { name: string; status: string; output: string[] }[];
      console.log("\nPASS — mock deployment reached 'started'.");
      console.log(`View in UI: Deployments card "${row.minerName}" (α${row.netuid}, mode ${row.mode}).`);
      console.log("Step outputs (tail):");
      for (const s of steps2) {
        const tail = s.output.slice(-2).map((l) => `    ${l.slice(0, 100)}`);
        console.log(`  [${s.name}] ${s.status}`);
        for (const l of tail) console.log(l);
      }
      if (process.env.DELETE === "1") {
        await db.deployment.delete({ where: { id: rec.id } });
        console.log("cleanup: test deployment deleted.");
      } else {
        console.log("kept in DB for UI inspection — run with DELETE=1 to remove.");
      }
      return;
    }
    if (row.status === "failed") {
      const steps2 = JSON.parse(row.steps as string) as { name: string; status: string; output: string[] }[];
      console.log("FAIL — deployment went failed:");
      for (const s of steps2.filter((x) => x.status === "failed")) {
        console.log(`  [${s.name}] ${s.output.join(" | ").slice(0, 400)}`);
      }
      return;
    }
  }
  console.log("TIMEOUT — lifecycle did not reach 'started' in 150s.");
  console.log(`inspect manually: deployment id ${rec.id}`);
}

main().finally(() => db.$disconnect());
