// E2E test helper — build the FULL setup command (daemon + auto-start installer)
// exactly as an operator would paste it, using the real secret from the DB.
import { buildDaemonScript } from "../src/lib/infranex/daemon-bridge";
import { buildDaemonSetupCommand } from "../src/lib/infranex/daemon-setup";
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

const setup = buildDaemonSetupCommand(script);
await Bun.write("/home/z/my-project/tool-results/setup_command.sh", setup);
console.log("setup command written:", setup.length, "chars,", setup.split("\n").length, "lines");
await db.$disconnect();
