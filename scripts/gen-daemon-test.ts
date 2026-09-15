// Generate the real daemon script via the platform's own generator (bun runs TS natively),
// reading the daemon secret straight from the DB — no hardcoded secrets on disk.
import { buildDaemonScript } from "../src/lib/infranex/daemon-bridge";
import { decryptSecret } from "../src/lib/devops/crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const deploymentId = "cmu27rmpw0000sn9q563ikvnz";

const state = await db.daemonState.findUnique({ where: { deploymentId } });
if (!state?.secretEnc) {
  console.error("no daemon registered for", deploymentId);
  process.exit(1);
}

const script = buildDaemonScript({
  deploymentId,
  secret: decryptSecret(state.secretEnc),
  platformUrl: "http://localhost:3000",
  minerCommand: "python -m targon_miner --netuid 4",
});

await Bun.write("/home/z/my-project/tool-results/infranex_daemon.py", script);
console.log("written", script.length, "chars");
await db.$disconnect();
