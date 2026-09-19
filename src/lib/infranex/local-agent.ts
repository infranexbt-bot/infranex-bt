import crypto from "crypto";
import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/devops/crypto";

/**
 * LOCALHOST-1 — control-plane side of the local-machine agent (laptop/PC).
 *
 * Why a separate model from GpuHost: GPU hosts are reached by SSH PUSH from
 * the platform — impossible for a laptop behind home NAT. The local agent
 * dials OUT from the laptop, signs every request (HMAC-SHA256 over
 * `timestamp.path.body`, ±5min skew, replay-cached — same scheme as the
 * node daemon) and PULLS its own command queue. No inbound port is ever
 * opened on the machine.
 *
 * Flow:
 *   1. Operator clicks "Add laptop" → createEnrollment() mints a one-time
 *      token (raw shown ONCE in the copy-paste command; only its sha256 is
 *      stored, 30-min TTL).
 *   2. On the laptop (WSL2/Ubuntu): `python3 agent.py enroll …` exchanges
 *      the token for a per-host agent secret (returned once, AES-256-GCM
 *      at rest) and reports static specs.
 *   3. `agent.py run` heartbeats specs+telemetry every LOCAL_POLL_SECONDS
 *      and receives queued commands; results are POSTed back per command.
 *
 * Trust boundary: commands are queued ONLY by authenticated app sessions
 * (the operator's own account). The agent executes the operator's own
 * queued commands on the operator's own machine — no third party can
 * enqueue (session-gated) and no one can read the queue without the
 * per-host secret (HMAC-gated).
 */

export const LOCAL_POLL_SECONDS = 15;
export const LOCAL_COMMAND_TIMEOUT_S = 30 * 60; // 30 min per command (evals/builds)
export const LOCAL_OUTPUT_CAP = 64 * 1024; // 64KB per command output
export const LOCAL_HOST_TELEMETRY_CAP = 8 * 1024; // 8KB telemetry JSON cap

export interface LocalHostSpecs {
  hostname?: string;
  os?: string;
  cpuModel?: string;
  cores?: number;
  threads?: number;
  ramGb?: number;
  diskFreeGb?: number;
  python?: string;
}

export interface LocalTelemetry {
  load1?: number;
  memUsedMb?: number;
  memTotalMb?: number;
  tempC?: number | null;
  uptimeS?: number;
}

export function generateLocalToken(): string {
  return crypto.randomBytes(24).toString("hex"); // 48 hex chars
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Create a pending LocalHost + one-time enrollment token. */
export async function createEnrollment(name: string) {
  const token = generateLocalToken();
  const host = await db.localHost.create({
    data: {
      name: name.slice(0, 64) || "my-laptop",
      status: "pending",
      enrollTokenHash: sha256Hex(token),
      enrollExpiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
  return { host, token };
}

/** Verify a one-time enrollment token → the pending host row, or null. */
export async function verifyEnrollmentToken(token: string) {
  if (!token || token.length > 128) return null;
  const row = await db.localHost.findFirst({
    where: { status: "pending", enrollTokenHash: { not: null } },
  });
  // Constant-ish sweep: compare hashes of ALL pending rows (no early leak).
  const pending = await db.localHost.findMany({
    where: { status: "pending", enrollTokenHash: { not: null } },
  });
  void row;
  const hash = sha256Hex(token);
  const match = pending.find(
    (p) =>
      p.enrollTokenHash === hash &&
      p.enrollExpiresAt &&
      p.enrollExpiresAt.getTime() > Date.now()
  );
  return match ?? null;
}

/** Complete enrollment: bind agent secret + specs, mark online. */
export async function completeEnrollment(
  hostId: string,
  specs: LocalHostSpecs,
  version: string
) {
  const secret = crypto.randomBytes(24).toString("hex");
  const host = await db.localHost.update({
    where: { id: hostId },
    data: {
      status: "online",
      enrollTokenHash: null,
      enrollExpiresAt: null,
      agentSecretEnc: encryptSecret(secret),
      specsJson: JSON.stringify(specs ?? {}),
      version,
      lastSeenAt: new Date(),
    },
  });
  return { host, secret };
}

/** Resolve a host by id + verify its HMAC signature. */
export async function authAgentRequest(
  hostId: string,
  timestamp: string,
  path: string,
  body: string,
  signature: string,
  verify: (
    secret: string,
    timestamp: string,
    path: string,
    body: string,
    signature: string
  ) => { ok: boolean; error?: string }
) {
  if (!hostId || typeof hostId !== "string" || hostId.length > 64) {
    return { ok: false as const, error: "bad host id" };
  }
  const host = await db.localHost.findUnique({ where: { id: hostId } });
  if (!host || host.status !== "online" || !host.agentSecretEnc) {
    return { ok: false as const, error: "host not enrolled" };
  }
  const { decryptSecret } = await import("@/lib/devops/crypto");
  const secret = decryptSecret(host.agentSecretEnc);
  if (!secret) return { ok: false as const, error: "secret unavailable" };
  const verdict = verify(secret, timestamp, path, body, signature);
  if (!verdict.ok) return { ok: false as const, error: verdict.error ?? "bad signature" };
  return { ok: true as const, host };
}
