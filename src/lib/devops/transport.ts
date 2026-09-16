// ---------------------------------------------------------------------------
// DevOps Engine — command transport.
//
// The control plane (this Next.js server) reaches GPU machines through a
// Transport. One implementation:
//
//   SshTransport — real machines (BYO box, colo rig, RunPod pod, Vast…)
//                  via the ssh2 library. Every command has a timeout.
//
// DATA-AUDIT-1 (M3) — the scripted MockTransport (fabricated nvidia-smi,
// docker logs, chain heads) was REMOVED: a fake host that "looks" real has
// no place in production code. `openTransport` now fails loudly for mock
// host rows instead of simulating them.
// ---------------------------------------------------------------------------

import type { Client } from "ssh2";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface Transport {
  readonly kind: "ssh" | "mock";
  connect(): Promise<void>;
  exec(command: string, timeoutMs?: number): Promise<ExecResult>;
  close(): void;
}

// ---------------------------------------------------------------------------
// SSH transport
// ---------------------------------------------------------------------------

interface SshCreds {
  host: string;
  port: number;
  user: string;
  authMethod: "password" | "key";
  secret: string; // decrypted password or PEM key
}

export class SshTransport implements Transport {
  readonly kind = "ssh" as const;
  private client: Client | null = null;

  constructor(private creds: SshCreds) {}

  async connect(): Promise<void> {
    const { Client: SshClient } = await import("ssh2");
    const creds = this.creds;
    return new Promise((resolve, reject) => {
      const c = new SshClient();
      this.client = c;
      const timer = setTimeout(
        () => {
          c.end();
          reject(new Error(`SSH connect timeout to ${creds.host}:${creds.port}`));
        },
        15_000
      );
      c.on("ready", () => {
        clearTimeout(timer);
        resolve();
      })
        .on("error", (err: Error) => {
          clearTimeout(timer);
          reject(new Error(`SSH ${creds.host}:${creds.port} — ${err.message}`));
        })
        .connect({
          host: creds.host,
          port: creds.port,
          username: creds.user,
          readyTimeout: 15_000,
          ...(creds.authMethod === "password"
            ? { password: creds.secret }
            : { privateKey: creds.secret }),
        });
    });
  }

  async exec(command: string, timeoutMs = 30_000): Promise<ExecResult> {
    if (!this.client) throw new Error("SSH not connected");
    const c = this.client;
    const started = Date.now();
    return new Promise<ExecResult>((resolve, reject) => {
      c.exec(command, (err, stream) => {
        if (err) return reject(err);
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          stream.close();
          resolve({
            code: -1,
            stdout,
            stderr: `${stderr}\n[timeout after ${timeoutMs}ms]`.trim(),
            durationMs: Date.now() - started,
          });
        }, timeoutMs);
        stream
          .on("close", (code: number) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr, durationMs: Date.now() - started });
          })
          .on("data", (d: Buffer) => {
            stdout += d.toString();
          })
          .stderr.on("data", (d: Buffer) => {
            stderr += d.toString();
          });
      });
    });
  }

  close(): void {
    this.client?.end();
    this.client = null;
  }
}

/** Open the right transport for a host record. */
export function openTransport(opts: {
  kind: "ssh" | "mock";
  hostId: string;
  host?: string;
  port?: number;
  user?: string;
  authMethod?: "password" | "key";
  secret?: string; // already decrypted
}): Transport {
  // DATA-AUDIT-1 (M3) — mock hosts are no longer simulated. Legacy rows with
  // transport:"mock" must be re-registered as real SSH hosts.
  if (opts.kind === "mock") {
    throw new Error(
      "Mock transport removed — this host record uses transport:'mock'. Delete it and register the real host over SSH."
    );
  }
  return new SshTransport({
    host: opts.host ?? "",
    port: opts.port ?? 22,
    user: opts.user ?? "root",
    authMethod: opts.authMethod ?? "password",
    secret: opts.secret ?? "",
  });
}
