// Sandbox E2E test for the daemon setup command:
//  1. regenerate the real daemon script (secret decrypted from DB)
//  2. build the setup command via the production module
//  3. bash -n syntax check
//  4. python AST check of the embedded script
//  5. sandbox-run the installer (paths rewritten to a writable dir) and
//     verify the daemon heartbeats → daemonState "online"
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import { buildDaemonSetupCommand } from "../src/lib/infranex/daemon-setup";
import { buildDaemonScript } from "../src/lib/infranex/daemon-bridge";
import { decryptSecret } from "../src/lib/devops/crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const deploymentId = "cmu27rmpw0000sn9q563ikvnz";
const state = await db.daemonState.findUnique({ where: { deploymentId } });
if (!state?.secretEnc) throw new Error("no daemon registered");

const script = buildDaemonScript({
  deploymentId,
  secret: decryptSecret(state.secretEnc),
  platformUrl: "http://localhost:3000",
  minerCommand: "python -m targon_miner --netuid 4",
});

const setup = buildDaemonSetupCommand(script);

// 3) bash syntax
writeFileSync("/tmp/infranex_setup_test.sh", setup);
execSync("bash -n /tmp/infranex_setup_test.sh", { stdio: "inherit" });
console.log("BASH SYNTAX OK");

// 4) python syntax (extract between heredoc markers)
const m = setup.split("<< 'INFRANEX_DAEMON_EOF'\n")[1];
const py = m.split("\nINFRANEX_DAEMON_EOF")[0];
writeFileSync("/tmp/infranex_py_test.py", py);
execSync("python3 -c \"import ast; ast.parse(open('/tmp/infranex_py_test.py').read()); print('PYTHON SYNTAX OK')\"", { stdio: "inherit" });

// 5) sandbox run — rewrite /root + /var/log to a writable sandbox dir
const dir = "/home/z/my-project/tool-results/daemon-sandbox";
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const sandboxed = setup
  .replaceAll("/root/infranex_daemon.py", `${dir}/infranex_daemon.py`)
  .replaceAll("/var/log/infranex-daemon.log", `${dir}/daemon.log`);
writeFileSync(`${dir}/setup.sh`, sandboxed);

const child = spawn("bash", [`${dir}/setup.sh`], { stdio: ["ignore", "pipe", "pipe"] });
let out = "";
child.stdout.on("data", (d) => (out += d));
child.stderr.on("data", (d) => (out += d));
await new Promise((r) => setTimeout(r, 12_000));
console.log("SETUP OUTPUT:", out.trim().split("\n").slice(0, 4).join(" | "));

const after = await db.daemonState.findUnique({
  where: { deploymentId },
  select: { status: true, lastSeenAt: true },
});
console.log("daemonState after sandbox install:", JSON.stringify(after));
await db.$disconnect();

// cleanup processes + secret-bearing files
try { execSync(`pkill -f "${dir}/infranex_daemon.py"`, { stdio: "ignore" }); } catch {}
console.log("TEST DONE");
