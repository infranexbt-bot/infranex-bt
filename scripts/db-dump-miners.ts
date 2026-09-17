import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const deployments = await db.deployment.findMany({ include: { daemonState: true } });
  console.log("DEPLOYMENTS:", deployments.length);
  for (const d of deployments) {
    console.log(`- ${d.id} | ${d.minerName} | status=${d.status} | mode=${d.mode} | offer=${d.offerId} | createdAt=${d.createdAt.toISOString()}`);
  }
  const daemons = await db.daemonState.findMany();
  console.log("DAEMON_STATES:", daemons.length);
  const samples = await db.gpuSample.findMany();
  console.log("GPU_SAMPLES:", samples.length);
  const triggers = await db.triggerEvent.findMany();
  console.log("TRIGGER_EVENTS:", triggers.length);
  const channels = await db.alertChannel.findMany();
  console.log("ALERT_CHANNELS:", channels.length);
  for (const c of channels) console.log(`- channel: ${c.name} kind=${c.kind} url=${c.url}`);
  const hosts = await db.gpuHost.findMany();
  console.log("GPU_HOSTS:", hosts.length);
  const uids = await (db as any).uidSnapshot?.findMany?.() ?? [];
  console.log("UID_SNAPSHOTS:", uids.length);
}
main().finally(() => db.$disconnect());
