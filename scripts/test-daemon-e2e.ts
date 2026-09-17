// E2E: daemon protocol round-trip + approval-gated trigger action (mock host).
// Run: DATABASE_URL="file:/home/z/my-project/infranex-bt/db/custom.db" bun test-daemon-e2e.tmp.ts
import { PrismaClient } from "@prisma/client";
import { createHmac } from "node:crypto";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const db = new PrismaClient();

// --- replicate daemon token derivation (same as lib/devops/daemon.ts) -------
function devopsKey(): Buffer {
  const env = process.env.DEVOPS_SECRET;
  if (env && env.length >= 16) return createHash("sha256").update(env).digest();
  const file = fs.readFileSync("/home/z/my-project/infranex-bt/.devops-secret", "utf8").trim();
  return createHash("sha256").update(file).digest();
}
function daemonToken(hostId: string): string {
  return createHmac("sha256", devopsKey()).update(`daemon:${hostId}`).digest("hex").slice(0, 32);
}

const host = await db.gpuHost.findFirst({ orderBy: { createdAt: "desc" } });
if (!host) throw new Error("no hosts");
console.log("host:", host.name, `(${host.id.slice(-6)})`, "transport:", host.transport);
const token = daemonToken(host.id);
console.log("token derived:", token.slice(0, 8) + "…");

// --- 1. telemetry ingest returns queued commands ----------------------------
await db.daemonCommand.create({ data: { hostId: host.id, command: "ping" } });
const res = await fetch(`${BASE}/api/devops/daemon/ingest`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Infranex-Token": token },
  body: JSON.stringify({
    samples: [
      { hostId: host.id, gpuUtilPct: 87, vramUsedMb: 19456, vramTotalMb: 24564, gpuTempC: 71, procOk: true, latencyMs: 12.4 },
    ],
  }),
});
const ingested = (await res.json()) as { ok?: boolean; commands?: Array<{ id: string; command: string }>; error?: string };
console.log("ingest:", res.status, "ok:", ingested.ok, "commands:", ingested.commands?.map((c) => c.command).join(",") ?? ingested.error);

// --- 2. wrong token rejected -------------------------------------------------
const bad = await fetch(`${BASE}/api/devops/daemon/ingest`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Infranex-Token": "0".repeat(32) },
  body: JSON.stringify({ samples: [{ hostId: host.id }] }),
});
console.log("bad-token ingest rejected:", bad.status === 401 ? "PASS" : `FAIL (${bad.status})`);

// --- 3. ack the ping command --------------------------------------------------
const cmdId = ingested.commands?.[0]?.id;
if (cmdId) {
  const ack = await fetch(`${BASE}/api/devops/daemon/ack`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Infranex-Token": token },
    body: JSON.stringify({ commandId: cmdId, result: "pong @ e2e-test", ok: true }),
  });
  const done = await db.daemonCommand.findUnique({ where: { id: cmdId } });
  console.log("ack:", ack.status, "command status:", done?.status, "result:", done?.result);
}

// --- 4. approval-gated RE-SYNC on mock host -----------------------------------
const install = await db.hostInstall.findFirst({ where: { hostId: host.id }, orderBy: { updatedAt: "desc" } });
if (install) {
  const ev = await db.triggerEvent.create({
    data: {
      kind: "RE_SYNC",
      severity: "info",
      status: "open",
      hostId: host.id,
      installId: install.id,
      netuid: install.netuid,
      subnetName: install.subnetName,
      title: "E2E test: repo moved ahead",
      detail: "test event",
      dataJson: "{}",
      auto: false,
    },
  });
  const action = await fetch(`${BASE}/api/triggers/${ev.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve" }),
  });
  const out = (await action.json()) as { ok: boolean; message: string };
  const after = await db.triggerEvent.findUnique({ where: { id: ev.id } });
  console.log("RE-SYNC approve:", action.status, "ok:", out.ok, "→ event status:", after?.status);
  console.log("resync output snippet:", out.message.split("\n").slice(0, 4).join(" | "));
  // cleanup test artifacts
  await db.triggerEvent.delete({ where: { id: ev.id } });
  console.log("test event cleaned up");
} else {
  console.log("(no install on this host — skipped resync test)");
}

// --- 5. latest telemetry persisted --------------------------------------------
const sample = await db.daemonSample.findFirst({ where: { hostId: host.id }, orderBy: { createdAt: "desc" } });
console.log("stored sample:", sample ? `gpu ${sample.gpuUtilPct}% vram ${sample.vramUsedMb}/${sample.vramTotalMb}MB temp ${sample.gpuTempC}C proc ${sample.procOk}` : "MISSING");

await db.$disconnect();
