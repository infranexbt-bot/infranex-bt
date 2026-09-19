// VALIDATOR-LAB E2E — prove the verdict-fix → live-miner push path end to end:
//   POST /api/judge/apply  →  apply_config queued on the daemon bridge
//   → HMAC-signed daemon pull (exactly what the Node Daemon does every 60s)
//   → result posted back and recorded
//   → deployment config env updated platform-side + revision snapshot taken
// Runs against the real server on :3000 using the real HMAC protocol.
// Cleans up after itself (deletes the test deployment + daemon state).

import { db } from "../src/lib/db"; // resolved via tsconfig paths by bun
import crypto from "crypto";

const BASE = "http://localhost:3000";
const TEST_ID = "vl-audit-e2e-test";
const step = (n: string, ok: boolean, detail: string) =>
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}  ${detail}`);

async function main() {
  // 0. Clean slate for the test id.
  await db.daemonState.deleteMany({ where: { deploymentId: TEST_ID } });
  await db.deploymentRevision.deleteMany({ where: { deploymentId: TEST_ID } });
  await db.deployment.deleteMany({ where: { id: TEST_ID } });

  // 1. Seed a non-mock deployment (mode=runpod avoids the mock-tick path).
  await db.deployment.create({
    data: {
      id: TEST_ID,
      minerName: "vl-audit-miner",
      netuid: 1,
      subnetName: "Apex",
      gpuModel: "H200",
      provider: "runpod",
      status: "running",
      progress: 100,
      mode: "runpod", // real path — daemon transport, not the mock tick
      ownerUserId: "admin",
      createdByLabel: "vl-audit",
      hourlyCost: 0.5,
      monthlyCost: 360,
      estimatedRevenue: 0,
      config: JSON.stringify({
        minerCommand: "python neurons/miner.py",
        docker: { image: "infranex/miner:latest", envVars: [{ name: "EXISTING", value: "1", secret: false }] },
      }),
    },
  });
  step("1 seed deployment", true, TEST_ID);

  // 2. Register a daemon and get its secret (same call the install route uses).
  const { ensureDaemon } = await import("../src/lib/infranex/daemon-bridge");
  const { secret } = await ensureDaemon(TEST_ID);
  step("2 daemon registered", !!secret, `secret len=${secret.length}`);

  const sign = (ts: string, path: string, body: string) =>
    crypto.createHmac("sha256", secret).update(`${ts}.${path}.${body}`).digest("hex");

  const daemonPost = async (path: string, payload: unknown) => {
    const body = JSON.stringify(payload);
    const ts = String(Date.now());
    return fetch(BASE + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Infranex-Timestamp": ts,
        "X-Infranex-Signature": sign(ts, path, body),
        "X-Infranex-Deployment": TEST_ID,
      },
      body,
    });
  };

  // 3. Daemon telemetry → should flip status online.
  const tel = await daemonPost("/api/daemon/telemetry", {
    ts: Math.floor(Date.now() / 1000),
    hostname: "vl-audit-host",
    gpus: [{ utilPct: 91, memUsedMb: 60000, memTotalMb: 141000, tempC: 64 }],
    minerProcessAlive: true,
    loadavg: [0.5, 0.4, 0.3],
    traffic: { windowMinutes: 60, requests: null, distinctValidators: null, topValidatorHotkey: null, topValidatorCount: null, logFound: false },
    logs: [],
  });
  step("3 telemetry accepted", tel.status === 200, `HTTP ${tel.status}`);

  // 4. Admin applies the Validator Lab "throughput" fix via the real API.
  const cookie = await adminCookie();
  const apply = await fetch(`${BASE}/api/judge/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ deploymentId: TEST_ID, dimensionKey: "throughput" }),
  });
  const applyBody = (await apply.json()) as { transport?: string; note?: string; envDelta?: Record<string, string> };
  step(
    "4 apply → daemon transport",
    apply.status === 200 && applyBody.transport === "daemon",
    `HTTP ${apply.status} transport=${applyBody.transport} env=${Object.keys(applyBody.envDelta ?? {}).join(",")}`
  );

  // 5. Daemon pulls its queue — expect the apply_config command.
  const pull = await daemonPost("/api/daemon/commands", { pull: true });
  const pullBody = (await pull.json()) as { commands?: Array<{ command: string; args?: { env?: Record<string, string> } }> };
  const cmd = pullBody.commands?.[0];
  const envOk = !!cmd?.args?.env && "INFANEX_RUNTIME" in (cmd.args.env ?? {});
  step("5 daemon pulls apply_config", cmd?.command === "apply_config" && envOk, `cmd=${cmd?.command} env=${JSON.stringify(cmd?.args?.env ?? {})}`);

  // 6. Daemon executes + posts the result back.
  const res = await daemonPost("/api/daemon/commands", {
    result: { id: cmd!.command ? (pullBody.commands![0] as unknown as { id: string }).id : "", result: "config applied (2 env vars) and miner restarted" },
  });
  step("6 result posted", res.status === 200, `HTTP ${res.status}`);

  // 7. Platform side: config env persisted + revision snapshot taken.
  const row = await db.deployment.findUnique({ where: { id: TEST_ID } });
  const cfg = JSON.parse(row!.config) as { docker: { envVars: Array<{ name: string; value: string }> } };
  const hasVllm = cfg.docker.envVars.some((e) => e.name === "INFANEX_RUNTIME" && e.value === "vllm");
  const revs = await db.deploymentRevision.count({ where: { deploymentId: TEST_ID, cause: "validator-fix" } });
  step("7a config env persisted", hasVllm, "INFANEX_RUNTIME=vllm in deployment.config");
  step("7b revision snapshot", revs >= 1, `${revs} validator-fix revision(s)`);

  const view = await (await import("../src/lib/infranex/daemon-bridge")).getDaemonView(TEST_ID);
  step("7c daemon online + queue drained", view?.status === "online" && view.pendingCommands === 0, `status=${view?.status} pending=${view?.pendingCommands}`);
  const recorded = JSON.parse((await db.daemonState.findUnique({ where: { deploymentId: TEST_ID } }))!.commandsJson)
    .find((c: { command: string }) => c.command === "apply_config")?.result;
  step("7d command result recorded", typeof recorded === "string" && recorded.includes("config applied"), String(recorded));

  // 8. Cleanup — leave the DB exactly as we found it.
  await db.daemonState.deleteMany({ where: { deploymentId: TEST_ID } });
  await db.deploymentRevision.deleteMany({ where: { deploymentId: TEST_ID } });
  await db.deployment.deleteMany({ where: { id: TEST_ID } });
  const left = await db.deployment.count({ where: { id: TEST_ID } });
  step("8 cleanup", left === 0, "test rows removed");
}

async function adminCookie(): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
  });
  const setCookie = r.headers.get("set-cookie") ?? "";
  const c = setCookie.split(";")[0];
  if (r.status !== 200 || !c) throw new Error(`admin login failed: HTTP ${r.status}`);
  return c;
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("E2E failed:", e);
    process.exit(1);
  });
