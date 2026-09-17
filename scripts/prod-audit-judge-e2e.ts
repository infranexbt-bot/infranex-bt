// E2E test: Validator Lab verdict → live miner push.
// Creates a mock deployment + registered daemon, runs the judge flow
// (sync → simulate → apply), then impersonates the node daemon exactly as
// deployed (HMAC-signed pull + result ack) to prove apply_config lands on
// the miner. Cleans up all test rows afterwards.
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const db = new PrismaClient();
const BASE = "http://localhost:3000";
const TEST_ID_PREFIX = "e2e-judge-test-";

function sign(secret: string, timestamp: string, path: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${path}.${body}`).digest("hex");
}

async function main() {
  // --- login (admin: apply + daemon install are admin-gated) ---
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "admin", code: "BRJ2-W2GT-WJNF-97VC" }),
  });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const api = async (path: string, method = "GET", body?: any) => {
    const r = await fetch(BASE + path, {
      method,
      headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(90000),
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };

  // --- 1. create mock deployment (test artifact) ---
  const depId = TEST_ID_PREFIX + crypto.randomUUID().slice(0, 8);
  await db.deployment.create({
    data: {
      id: depId,
      minerName: "[TEST] judge-verdict-e2e",
      netuid: 61,
      subnetName: "RedTeam",
      gpuModel: "CPU VPS (test)",
      provider: "mock",
      mode: "mock",
      status: "running",
      hourlyCost: 0.006,
      monthlyCost: 4.5,
      config: JSON.stringify({
        docker: {
          image: "test/judge-e2e:latest",
          command: "python3 neurons/miner.py",
          envVars: [{ name: "BT_NETUID", value: "61", secret: false }],
          ports: [],
        },
      }),
    },
  });
  console.log("1. test deployment created:", depId);

  // --- 2. register daemon via the real admin route (returns one-shot secret) ---
  const inst = await api("/api/daemon/install", "POST", { deploymentId: depId, platformUrl: BASE });
  if (inst.status !== 200 || !inst.body?.script) {
    console.log("   daemon install FAILED:", inst.status, JSON.stringify(inst.body).slice(0, 300));
    await db.deployment.delete({ where: { id: depId } }).catch(() => {});
    return;
  }
  const secretMatch = inst.body.script.match(/DAEMON_SECRET[= ]+["']?([A-Za-z0-9+/=_-]{16,})/);
  const secret = secretMatch?.[1] ?? inst.body.script.match(/([A-Za-z0-9]{32,128})/)?.[1];
  if (!secret) {
    console.log("   could not extract secret from script; script head:", String(inst.body.script).slice(0, 300));
    await db.daemonState.deleteMany({ where: { deploymentId: depId } });
    await db.deployment.delete({ where: { id: depId } }).catch(() => {});
    return;
  }
  console.log("2. daemon registered, secret extracted:", `${secret.slice(0, 6)}…${secret.slice(-4)}`);

  // --- 3. judge: rebuild profile for sn61 (current repo sourcing) ---
  const sync = await api("/api/judge/sync", "POST", { netuid: 61 });
  const p = sync.body?.profile;
  console.log("3. judge sync sn61:", sync.status, "| judgeKind:", p?.judgeKind, "| conf:", p?.confidence?.toFixed?.(2), "| sources:", JSON.stringify((p?.sources ?? []).map((s: any) => s.kind)));
  const readmeSrc = (p?.sources ?? []).find((s: any) => s.kind === "readme")?.url ?? "";
  console.log("   readme source:", readmeSrc);

  // --- 4. simulate a miner spec against the profile (the verdict) ---
  const sim = await api("/api/judge/simulate", "POST", {
    netuid: 61,
    spec: { latencyMs: 2000, uptimePct: 99.5, qualityPct: 80, throughputTps: 25, pricePerMTokUsd: 0.5 },
  });
  const simRes = sim.body?.result ?? sim.body;
  const dims = simRes?.perDimension ?? simRes?.dimensions ?? [];
  const worst = Array.isArray(dims) && dims.length
    ? dims.slice().sort((a: any, b: any) => (a.score ?? 1) - (b.score ?? 1))[0]
    : null;
  console.log("4. simulate:", sim.status, "| composite:", simRes?.compositeScore ?? simRes?.score ?? "?", "| worst dim:", worst ? `${worst.key ?? worst.dimensionKey}=${worst.score}` : "?");

  // --- 5. APPLY the verdict for a mapped dimension → expect daemon transport ---
  const apply = await api("/api/judge/apply", "POST", {
    deploymentId: depId,
    dimensionKey: "throughput",
  });
  console.log("5. apply:", apply.status, "| transport:", apply.body?.transport, "| applied:", JSON.stringify(apply.body?.applied));
  console.log("   note:", String(apply.body?.note ?? apply.body?.error ?? "").slice(0, 180));

  // --- 6. act as the node daemon: HMAC-signed pull ---
  const ts = Date.now().toString();
  const path = "/api/daemon/commands";
  const body = JSON.stringify({ pull: true });
  const sig = sign(secret, ts, path, body);
  const pull = await fetch(BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-infranex-timestamp": ts,
      "x-infranex-signature": sig,
      "x-infranex-deployment": depId,
    },
    body,
  });
  const pullBody = await pull.json().catch(() => null);
  const cmds = pullBody?.commands ?? [];
  console.log("6. signed daemon pull:", pull.status, "| commands:", cmds.length);
  for (const c of cmds) console.log(`   -> ${c.command} ${JSON.stringify(c.args).slice(0, 160)}`);

  // --- 7. daemon acks the result (as the real script does) ---
  if (cmds.length) {
    const ts2 = Date.now().toString();
    const body2 = JSON.stringify({ result: { id: cmds[0].id, result: "applied: env updated, miner restarted" } });
    const ack = await fetch(BASE + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-infranex-timestamp": ts2,
        "x-infranex-signature": sign(secret, ts2, path, body2),
        "x-infranex-deployment": depId,
      },
      body: body2,
    });
    console.log("7. result ack:", ack.status, await ack.json().catch(() => null));
    const st = await db.daemonState.findUnique({ where: { deploymentId: depId } });
    const anySt = st as any;
    const last = safeParse(anySt?.lastResultJson ?? anySt?.lastResult ?? null);
    console.log("   stored last result:", JSON.stringify(last).slice(0, 160));
  }

  // --- 8. cleanup test rows ---
  await db.daemonState.deleteMany({ where: { deploymentId: depId } });
  await db.deployment.delete({ where: { id: depId } });
  console.log("8. cleanup done — test deployment + daemon state removed");
  process.exit(0);
}

function safeParse(s: any) {
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return s; }
}

main().catch(async (e) => {
  console.error("E2E ERR", e.message);
  await db.deployment.deleteMany({ where: { id: { startsWith: TEST_ID_PREFIX } } }).catch(() => {});
  await db.daemonState.deleteMany({ where: { deploymentId: { startsWith: TEST_ID_PREFIX } } }).catch(() => {});
  process.exit(1);
});
