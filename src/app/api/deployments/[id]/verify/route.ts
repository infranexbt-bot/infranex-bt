import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkRegistration, isDecodableSs58 } from "@/lib/infranex/deployment/registration";
import { transportFor } from "@/lib/infranex/deployment/real-setup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// GO-LIVE VERIFY — Phase 1 of the post-deployment operations loop.
//
// "First 1–6 hours: make sure you're actually working."
//
// One GET returns the full verification checklist for a started deployment,
// grouped the way the operator thinks about it:
//
//   identity   — registered correctly? correct UID? hotkey/coldkey config?
//   runtime    — GPU/CPU detected? container healthy? model/files present?
//   taskflow   — receiving requests? responses successful? crashes/restarts?
//   telemetry  — utilization, VRAM/RAM, temperature, disk, error logs
//
// Every item cites its source (chain / daemon / probe / traffic / record /
// ssh) and — when it is not green — carries a concrete `fix` hint.
//
// Deep mode (`?deep=1`): additionally opens the deployment's transport
// (SSH for real pods, simulated for mock) and runs live probes: container
// status, GPU detect, disk free, miner-log error scan. One failing probe
// never fails the payload.
//
// Honest-aggregation rules (mirroring registration.ts):
//   • missing data is `unknown`, never silently "pass";
//   • infra errors degrade to `unknown` with a note;
//   • mock-mode results are labeled "(mock)".
// ---------------------------------------------------------------------------

export type VerifyStatus = "pass" | "warn" | "fail" | "unknown";

export interface VerifyItem {
  id: string;
  label: string;
  status: VerifyStatus;
  detail: string;
  source: "chain" | "daemon" | "probe" | "traffic" | "record" | "ssh" | "install";
  checkedAt: string;
  fix?: string;
}

export interface VerifyGroup {
  id: "identity" | "runtime" | "taskflow" | "telemetry";
  title: string;
  description: string;
  items: VerifyItem[];
}

export interface GoLiveVerifyPayload {
  deployment: {
    id: string;
    minerName: string;
    netuid: number;
    subnetName: string;
    status: string;
    mode: string;
    provider: string;
    gpuModel: string;
    hotkeyMasked: string | null;
    createdAt: string;
    goLiveAt: string | null;
  };
  hoursSinceGoLive: number | null;
  verdict: "working" | "partial" | "issues" | "not-started";
  groups: VerifyGroup[];
  deep: { ran: boolean; note: string | null; lines: string[] };
  checkedAt: string;
}

const now = () => new Date();
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : now().toISOString());

function item(
  id: string,
  label: string,
  status: VerifyStatus,
  detail: string,
  source: VerifyItem["source"],
  fix?: string
): VerifyItem {
  return { id, label, status, detail, source, checkedAt: iso(now()), ...(fix ? { fix } : {}) };
}

function shortAddr(a: string | null | undefined): string {
  if (!a) return "—";
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Go-live ≈ when the last provisioning step completed (fallback: created). */
function goLiveOf(row: { createdAt: Date; steps: string }): Date {
  try {
    const steps = JSON.parse(row.steps) as Array<{
      status?: string;
      completedAt?: string | null;
    }>;
    const times = steps
      .filter((s) => s.status === "done" && s.completedAt)
      .map((s) => new Date(s.completedAt!).getTime())
      .filter((t) => !Number.isNaN(t));
    if (times.length > 0) return new Date(Math.max(...times));
  } catch {
    // fall through
  }
  return row.createdAt;
}

// ---------------------------------------------------------------------------
// Deep probes (live, via the deployment transport)
// ---------------------------------------------------------------------------

interface DeepProbes {
  ran: boolean;
  note: string | null;
  lines: string[];
  containerStatus: "running" | "down" | "unknown";
  diskUsedPct: number | null;
  errorLines: { count: number; samples: string[] } | null;
}

async function runDeepProbes(
  id: string,
  mode: string,
  netuid: number,
  unit: string,
  dockerPath: boolean
): Promise<DeepProbes> {
  const out: DeepProbes = {
    ran: false,
    note: mode === "mock" ? "simulated pod (mock mode) — probe output is not from a real host" : null,
    lines: [],
    containerStatus: "unknown",
    diskUsedPct: null,
    errorLines: null,
  };

  let transport: Awaited<ReturnType<typeof transportFor>> | null = null;
  try {
    transport = await transportFor(id);
  } catch (e) {
    out.lines.push(`[deep] transport unavailable: ${e instanceof Error ? e.message : e}`);
    return out;
  }

  try {
    out.ran = true;
    const cmd = dockerPath
      ? `docker ps --filter name=${unit} --format '{{.Names}} | {{.Status}}'`
      : `systemctl is-active ${unit}`;
    out.lines.push(`[deep] $ ${cmd}`);
    const r = await transport.exec(cmd, 20_000);
    const text = (r.stdout || r.stderr).trim();
    out.lines.push(...(text ? text.split("\n").slice(0, 4) : [`(exit ${r.code})`]));
    // Mock transport echoes the command back — never derive live verdicts
    // from simulated output (a fake "down"/"0 errors" would mislead).
    const simulated = mode === "mock";
    if (dockerPath) {
      out.containerStatus = !simulated && text.includes(unit) && /up|running/i.test(text) ? "running" : simulated ? "unknown" : "down";
    } else {
      out.containerStatus = !simulated && text.trim() === "active" ? "running" : simulated ? "unknown" : "down";
    }

    if (dockerPath) {
      const gpuCmd = `nvidia-smi --query-gpu=name,driver_version,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader 2>/dev/null || echo NO_GPU`;
      out.lines.push(`[deep] $ nvidia-smi …`);
      const g = await transport.exec(gpuCmd, 20_000);
      const gt = (g.stdout || "").trim();
      out.lines.push(...(gt ? gt.split("\n").slice(0, 3) : ["(no output)"]));

      const diskCmd = `df -P / | tail -1 | awk '{print $5}'`;
      out.lines.push(`[deep] $ df -P /`);
      const d = await transport.exec(diskCmd, 15_000);
      const pct = parseInt((d.stdout || "").trim().replace("%", ""), 10);
      out.diskUsedPct = Number.isFinite(pct) ? pct : null;
      if (out.diskUsedPct !== null) out.lines.push(`[deep] disk used: ${out.diskUsedPct}%`);

      const logCmd = `docker logs --tail 300 ${unit} 2>&1 | grep -iE "error|traceback|exception" | tail -3; docker logs --tail 300 ${unit} 2>&1 | grep -ciE "error|traceback|exception"`;
      out.lines.push(`[deep] $ docker logs --tail 300 ${unit} | grep -iE "error|traceback|exception"`);
      const l = await transport.exec(logCmd, 25_000);
      const lines = (l.stdout || "").trim().split("\n").filter(Boolean);
      const count = Number.parseInt(lines[lines.length - 1] ?? "0", 10);
      out.errorLines = simulated
        ? null
        : {
            count: Number.isFinite(count) ? count : 0,
            samples: lines.slice(0, Math.max(0, lines.length - 1)).slice(-3),
          };
      out.lines.push(
        `[deep] error/exception lines in last 300: ${simulated ? "(simulated — not evaluated)" : out.errorLines?.count ?? 0}`
      );
      if (!simulated) {
        for (const s of out.errorLines?.samples ?? []) {
          out.lines.push(`[deep]   · ${s.slice(0, 160)}`);
        }
      }
    }
  } catch (e) {
    out.lines.push(`[deep] probe error: ${e instanceof Error ? e.message : e}`);
  } finally {
    try {
      transport?.close();
    } catch {
      // ignore
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// GET — the verification payload
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deep = new URL(req.url).searchParams.get("deep") === "1";

    const row = await db.deployment.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const checkedAt = iso(now());
    const goLiveAt = goLiveOf(row);
    const hoursSinceGoLive = Math.max(0, (Date.now() - goLiveAt.getTime()) / 3_600_000);

    const profile = row.requirementsJsonSnapshot
      ? (JSON.parse(row.requirementsJsonSnapshot) as {
          dockerfileFound?: boolean;
          dockerImage?: string | null;
        })
      : null;
    const dockerPath = !!profile?.dockerfileFound && !!profile?.dockerImage;
    const unit = `infranex-miner-sn${row.netuid}`;

    // -- Parallel data gathering (all independent) ---------------------------
    const [reg, wallet, gpuLatest, gpuHistory, probeLatest, trafficLatest] = await Promise.all([
      checkRegistration(id, { force: deep }).catch(() => null),
      row.walletProfileId
        ? db.walletProfile.findUnique({ where: { id: row.walletProfileId } }).catch(() => null)
        : Promise.resolve(null),
      db.gpuSample.findFirst({ where: { deploymentId: id }, orderBy: { createdAt: "desc" } }),
      db.gpuSample.findMany({
        where: { deploymentId: id },
        orderBy: { createdAt: "desc" },
        take: 24,
      }),
      db.probeSample.findFirst({ where: { deploymentId: id }, orderBy: { createdAt: "desc" } }),
      db.trafficSample.findFirst({ where: { deploymentId: id }, orderBy: { createdAt: "desc" } }),
    ]);

    const deepProbes = deep
      ? await runDeepProbes(id, row.mode, row.netuid, unit, dockerPath)
      : {
          ran: false,
          note: null as string | null,
          lines: [] as string[],
          containerStatus: "unknown" as const,
          diskUsedPct: null as number | null,
          errorLines: null as { count: number; samples: string[] } | null,
        };

    // -- Group A: identity & registration -----------------------------------
    const identity: VerifyItem[] = [];

    if (isDecodableSs58(row.hotkey)) {
      identity.push(
        item("a1", "Hotkey attached & valid", "pass", `hotkey ${shortAddr(row.hotkey)} (SS58, checksum OK)`, "record")
      );
    } else {
      identity.push(
        item(
          "a1",
          "Hotkey attached & valid",
          "fail",
          row.hotkey
            ? `attached value ${shortAddr(row.hotkey)} is not a decodable SS58 address`
            : "no hotkey attached to this deployment",
          "record",
          "Open the deployment's Connect & register wizard and attach a valid hotkey (step 6 registers it on-chain)."
        )
      );
    }

    if (!reg) {
      identity.push(
        item(
          "a2",
          "Miner registered on-chain",
          "unknown",
          "chain check could not run right now (infra error) — registration state unchanged",
          "chain",
          "Press Re-run checks; if it persists, check the Finney RPC health on the dashboard."
        )
      );
    } else if (reg.state === "registered") {
      identity.push(
        item(
          "a2",
          "Miner registered on-chain",
          "pass",
          `hotkey IS registered on α${row.netuid}${reg.registrationBlock !== null ? ` at block #${reg.registrationBlock.toLocaleString()}` : ""}`,
          "chain"
        )
      );
    } else if (reg.state === "unregistered") {
      identity.push(
        item(
          "a2",
          "Miner registered on-chain",
          "fail",
          reg.note ?? "hotkey not found in the subnet metagraph — no UID, no income",
          "chain",
          "Run the Connect & register wizard (registration = the burn step), then Verify again."
        )
      );
    } else {
      identity.push(
        item(
          "a2",
          "Miner registered on-chain",
          "unknown",
          reg.note ?? "registration not checked yet",
          "chain",
          "Press Re-run checks once the miner is started."
        )
      );
    }

    if (row.registeredUid !== null && row.registeredUid !== undefined) {
      identity.push(
        item("a3", "Correct UID assigned", "pass", `UID ${row.registeredUid} on α${row.netuid}`, "chain")
      );
    } else if (reg?.state === "registered" && reg.uid !== null) {
      identity.push(item("a3", "Correct UID assigned", "pass", `UID ${reg.uid} on α${row.netuid}`, "chain"));
    } else {
      identity.push(
        item(
          "a3",
          "Correct UID assigned",
          "unknown",
          "no UID yet — a UID only exists once the hotkey is registered",
          "chain",
          "Register the hotkey first; the UID appears at the next metagraph scan."
        )
      );
    }

    if (wallet) {
      const cfg = row.config
        ? (JSON.parse(row.config) as { miner?: { walletName?: string; hotkeyName?: string } })
        : null;
      identity.push(
        item(
          "a4",
          "Coldkey / hotkey configuration",
          "pass",
          `wallet profile "${wallet.name}" bound — cold ${cfg?.miner?.walletName ?? wallet.walletName ?? "?"} / hot ${cfg?.miner?.hotkeyName ?? wallet.hotkeyName ?? "?"}`,
          "record"
        )
      );
    } else {
      identity.push(
        item(
          "a4",
          "Coldkey / hotkey configuration",
          "warn",
          "no wallet profile is bound to this deployment — the miner may be running on keys the platform cannot account for",
          "record",
          "Create or link a wallet profile (Wallets page), then attach its hotkey here."
        )
      );
    }

    const blocksSinceReg =
      reg &&
      reg.registrationBlock !== null &&
      reg.blockNumber !== null
        ? reg.blockNumber! - reg.registrationBlock!
        : null;
    if (
      blocksSinceReg !== null &&
      reg?.immunityWindowBlocks &&
      blocksSinceReg > reg.immunityWindowBlocks
    ) {
      // Established miner — registered long before this window. Immunity
      // lapsing is NORMAL here, not an alarm (it only matters around a
      // fresh registration / re-registration).
      identity.push(
        item(
          "a5",
          "Immunity window",
          "pass",
          `registered ${blocksSinceReg.toLocaleString()} blocks ago (~${Math.round((blocksSinceReg * 12) / 360) * 10 / 10}h) — immunity long lapsed, normal for an established miner`,
          "chain"
        )
      );
    } else if (blocksSinceReg !== null && reg?.immunityWindowBlocks) {
      const remaining = reg.immunityWindowBlocks! - blocksSinceReg;
      const frac = remaining / reg.immunityWindowBlocks!;
      identity.push(
        item(
          "a5",
          "Immunity window",
          frac <= 0 ? "fail" : frac < 0.2 ? "warn" : "pass",
          `${remaining.toLocaleString()} of ${reg.immunityWindowBlocks!.toLocaleString()} immunity blocks left — deregistered UIDs can be replaced after it ends`,
          "chain",
          frac <= 0
            ? "Immunity has lapsed right after registration — keep the miner responsive or re-register before deregistration risk."
            : undefined
        )
      );
    }

    // -- Group B: runtime & container ----------------------------------------
    const runtime: VerifyItem[] = [];

    const daemonAgeMin = gpuLatest ? (Date.now() - gpuLatest.createdAt.getTime()) / 60_000 : null;

    if (deepProbes.containerStatus === "running") {
      runtime.push(
        item(
          "b1",
          "Container / service healthy",
          "pass",
          dockerPath ? `${unit} is up (live check)` : `${unit} is active (live check)`,
          "ssh"
        )
      );
    } else if (deepProbes.containerStatus === "down") {
      runtime.push(
        item(
          "b1",
          "Container / service healthy",
          "fail",
          `${unit} is NOT running on the host (live check)`,
          "ssh",
          "Inspect the install logs (Step logs tab), fix the cause, then use Restart after registration."
        )
      );
    } else if (gpuLatest?.processAlive === true) {
      runtime.push(
        item(
          "b1",
          "Container / service healthy",
          "pass",
          `daemon reports the miner process alive${daemonAgeMin !== null ? ` (sampled ${Math.round(daemonAgeMin)}m ago)` : ""}`,
          "daemon"
        )
      );
    } else if (gpuLatest?.processAlive === false) {
      runtime.push(
        item(
          "b1",
          "Container / service healthy",
          "fail",
          `daemon reports the miner process DOWN${daemonAgeMin !== null ? ` (sampled ${Math.round(daemonAgeMin)}m ago)` : ""}`,
          "daemon",
          "Check Step logs for the crash cause; restart the miner and watch for immediate repeat crashes."
        )
      );
    } else {
      runtime.push(
        item(
          "b1",
          "Container / service healthy",
          "unknown",
          "no daemon telemetry yet — install the Node Daemon on the host or run a Deep probe",
          "daemon",
          "Run Deep probe (SSH) for a live container status, or install the daemon for continuous telemetry."
        )
      );
    }

    if (row.installStatus === "installed") {
      runtime.push(item("b2", "Install plan completed", "pass", "real-setup install finished — all steps done", "install"));
    } else if (row.installStatus === "failed") {
      runtime.push(
        item(
          "b2",
          "Install plan completed",
          "fail",
          "install runner reported a failure — see the install steps in the Step logs tab",
          "install",
          "Fix the failing step (deps, model download, disk), then re-run the install from the deployment."
        )
      );
    } else if (row.installStatus === "awaiting_wallet") {
      runtime.push(
        item(
          "b2",
          "Install plan completed",
          "warn",
          "install paused — waiting for the wallet to be copied onto the host",
          "install",
          "Copy the wallet (scp command in the registration wizard) and resume the install."
        )
      );
    } else if (row.installStatus === "running") {
      runtime.push(
        item("b2", "Install plan completed", "warn", "install still running — verification is premature until it finishes", "install")
      );
    } else {
      runtime.push(
        item(
          "b2",
          "Install plan completed",
          "unknown",
          "install was never started on this deployment (or predates the install runner)",
          "install",
          "Start the real-setup install so required files/models land on the host."
        )
      );
    }

    if (dockerPath && profile?.dockerImage) {
      runtime.push(item("b3", "Miner image / files present", "pass", `image ${profile.dockerImage}`, "record"));
    } else if (profile) {
      runtime.push(
        item("b3", "Miner image / files present", "pass", "venv install path — no container image required", "record")
      );
    } else {
      runtime.push(
        item(
          "b3",
          "Miner image / files present",
          "unknown",
          "no requirements snapshot — the platform cannot confirm what should be on the host",
          "record"
        )
      );
    }

    if (daemonAgeMin !== null) {
      if (daemonAgeMin <= 10) {
        runtime.push(
          item("b4", "Agent / daemon reporting", "pass", `last sample ${Math.round(daemonAgeMin)}m ago (fresh)`, "daemon")
        );
      } else if (daemonAgeMin <= 30) {
        runtime.push(
          item(
            "b4",
            "Agent / daemon reporting",
            "warn",
            `last sample ${Math.round(daemonAgeMin)}m ago — telemetry is stale`,
            "daemon",
            "Check the daemon on the host is running and can dial out."
          )
        );
      } else {
        runtime.push(
          item(
            "b4",
            "Agent / daemon reporting",
            "fail",
            `last sample ${Math.round(daemonAgeMin / 60)}h ago — telemetry is effectively dead`,
            "daemon",
            "The daemon is offline: you are flying blind. Restart it on the host."
          )
        );
      }
    } else {
      runtime.push(
        item(
          "b4",
          "Agent / daemon reporting",
          "unknown",
          "no telemetry samples recorded yet",
          "daemon",
          "Install the Node Daemon so the platform can watch the miner continuously."
        )
      );
    }

    // -- Group C: task flow ---------------------------------------------------
    const taskflow: VerifyItem[] = [];

    if (probeLatest) {
      const age = Math.round((Date.now() - probeLatest.createdAt.getTime()) / 60_000);
      if (probeLatest.ok) {
        taskflow.push(
          item(
            "c1",
            "Axon endpoint responding",
            "pass",
            `probe OK — HTTP ${probeLatest.httpStatus ?? "?"}, TTFB ${Math.round(probeLatest.ttfbMs ?? 0)}ms, total ${Math.round(probeLatest.totalMs ?? 0)}ms (${age}m ago)`,
            "probe"
          )
        );
      } else {
        taskflow.push(
          item(
            "c1",
            "Axon endpoint responding",
            "fail",
            `probe FAILED — ${probeLatest.errorKind ?? "error"}${probeLatest.errorDetail ? `: ${probeLatest.errorDetail}` : ""} (${age}m ago)`,
            "probe",
            "Validators cannot reach the axon — verify the port is open, the process is up, and the axon advertised the right IP."
          )
        );
      }
    } else {
      taskflow.push(
        item(
          "c1",
          "Axon endpoint responding",
          "unknown",
          "no synthetic probe has run against this miner yet — the DevOps pass probes every started miner",
          "probe",
          "Wait for the next DevOps pass (or enable the service probe worker) and re-run checks."
        )
      );
    }

    if (trafficLatest) {
      const age = Math.round((Date.now() - trafficLatest.createdAt.getTime()) / 60_000);
      if (trafficLatest.requests === null || trafficLatest.requests === undefined) {
        taskflow.push(
          item(
            "c2",
            "Receiving validator requests",
            "unknown",
            "daemon could not parse the miner log — request counts unknown",
            "traffic",
            "Check the miner's log format on the host; the daemon parses query stats from it."
          )
        );
      } else if (trafficLatest.requests > 0) {
        taskflow.push(
          item(
            "c2",
            "Receiving validator requests",
            "pass",
            `${trafficLatest.requests} requests in the last ${trafficLatest.windowMinutes ?? "?"}min from ${trafficLatest.distinctValidators ?? "?"} validator(s)${trafficLatest.topValidatorHotkey ? ` — top ${shortAddr(trafficLatest.topValidatorHotkey)} ×${trafficLatest.topValidatorCount ?? "?"}` : ""} (${age}m ago)`,
            "traffic"
          )
        );
      } else {
        taskflow.push(
          item(
            "c2",
            "Receiving validator requests",
            "warn",
            `0 requests in the last ${trafficLatest.windowMinutes ?? "?"}min — the miner is up but nobody is querying it (${age}m ago)`,
            "traffic",
            "Normal right after registration (validators discover slowly); if it persists past the first hour, check axon reachability and UID."
          )
        );
      }
    } else {
      taskflow.push(
        item(
          "c2",
          "Receiving validator requests",
          "unknown",
          "no traffic samples yet — the daemon records query stats from the miner log",
          "traffic",
          "Install the daemon so validator traffic becomes visible."
        )
      );
    }

    const alive = gpuHistory.filter((s) => s.processAlive === true).length;
    const dead = gpuHistory.filter((s) => s.processAlive === false).length;
    const spanMin =
      gpuHistory.length >= 2
        ? Math.round(
            (gpuHistory[0].createdAt.getTime() - gpuHistory[gpuHistory.length - 1].createdAt.getTime()) / 60_000
          )
        : null;
    if (gpuHistory.length >= 3 && alive + dead > 0) {
      const deadFrac = dead / (alive + dead);
      taskflow.push(
        item(
          "c3",
          "No crashes / restarts",
          dead === 0 ? "pass" : deadFrac > 0.4 ? "fail" : "warn",
          dead === 0
            ? `process alive across the last ${alive + dead} samples${spanMin !== null ? ` (~${spanMin}min span)` : ""} — no observed downtime`
            : `${dead} of ${alive + dead} recent samples show the process down${spanMin !== null ? ` (~${spanMin}min span)` : ""} — possible crash-loop`,
          "daemon",
          dead === 0
            ? undefined
            : "A flapping miner loses validator trust — find the crash cause in Step logs before anything else."
        )
      );
    } else {
      taskflow.push(
        item(
          "c3",
          "No crashes / restarts",
          "unknown",
          "not enough telemetry history to judge stability (need ≥3 samples)",
          "daemon",
          "Keep the daemon running; stability is judged over the first hour of samples."
        )
      );
    }

    // -- Group D: telemetry & health ------------------------------------------
    const telemetry: VerifyItem[] = [];

    if (gpuLatest && gpuLatest.gpuUtilPct !== null && gpuLatest.gpuUtilPct !== undefined) {
      telemetry.push(
        item(
          "d1",
          "GPU utilization",
          gpuLatest.gpuUtilPct > 0 ? "pass" : "warn",
          `${Math.round(gpuLatest.gpuUtilPct)}% GPU utilization${gpuLatest.gpuUtilPct === 0 ? " while the process is alive — the miner may be idle or stuck" : ""}`,
          "daemon",
          gpuLatest.gpuUtilPct > 0
            ? undefined
            : "0% util on a live miner usually means it never received a task or crashed into a sleep loop — watch traffic (c2)."
        )
      );
    } else if (gpuLatest) {
      telemetry.push(
        item("d1", "GPU utilization", "unknown", "daemon sample carries no GPU utilization (CPU miner or partial telemetry)", "daemon")
      );
    } else {
      telemetry.push(
        item("d1", "GPU utilization", "unknown", "no telemetry — install the daemon or run a Deep probe", "daemon")
      );
    }

    if (gpuLatest?.memUsedMb != null && gpuLatest?.memTotalMb != null && gpuLatest.memTotalMb > 0) {
      const pct = (gpuLatest.memUsedMb / gpuLatest.memTotalMb) * 100;
      telemetry.push(
        item(
          "d2",
          "VRAM / memory headroom",
          pct > 92 ? "warn" : "pass",
          `${Math.round(gpuLatest.memUsedMb)} / ${Math.round(gpuLatest.memTotalMb)} MB (${Math.round(pct)}%)${pct > 92 ? " — close to OOM" : ""}`,
          "daemon",
          pct > 92
            ? "Reduce batch size / concurrency or upgrade the instance before the OOM killer does it for you."
            : undefined
        )
      );
    } else {
      telemetry.push(item("d2", "VRAM / memory headroom", "unknown", "no memory telemetry in the latest sample", "daemon"));
    }

    if (gpuLatest?.tempC != null) {
      telemetry.push(
        item(
          "d3",
          "Temperature",
          gpuLatest.tempC >= 92 ? "fail" : gpuLatest.tempC >= 80 ? "warn" : "pass",
          `${Math.round(gpuLatest.tempC)}°C${gpuLatest.tempC >= 92 ? " — thermal throttling / shutdown risk" : gpuLatest.tempC >= 80 ? " — running hot" : ""}`,
          "daemon",
          gpuLatest.tempC >= 80 ? "Check cooling; sustained >85°C throttles and eventually kills the run." : undefined
        )
      );
    } else {
      telemetry.push(item("d3", "Temperature", "unknown", "no temperature telemetry in the latest sample", "daemon"));
    }

    if (deepProbes.diskUsedPct !== null) {
      const pct = deepProbes.diskUsedPct;
      telemetry.push(
        item(
          "d4",
          "Disk space",
          pct >= 90 ? "fail" : pct >= 80 ? "warn" : "pass",
          `${pct}% of root volume used (live check)`,
          "ssh",
          pct >= 80 ? "Old images/logs eat disk — prune (`docker system prune`) or expand the volume." : undefined
        )
      );
    } else {
      telemetry.push(
        item(
          "d4",
          "Disk space",
          "unknown",
          "disk usage needs a live host probe",
          "ssh",
          "Run Deep probe (SSH) to measure disk on the host."
        )
      );
    }

    if (deepProbes.errorLines) {
      const c = deepProbes.errorLines.count;
      telemetry.push(
        item(
          "d5",
          "Error log scan",
          c === 0 ? "pass" : c > 20 ? "fail" : "warn",
          c === 0
            ? "no error/traceback/exception lines in the last 300 log lines"
            : `${c} error-ish lines in the last 300 log lines${deepProbes.errorLines.samples.length > 0 ? ` — e.g. "${deepProbes.errorLines.samples[deepProbes.errorLines.samples.length - 1].slice(0, 120)}"` : ""}`,
          "ssh",
          c > 0 ? "A few transient errors are normal; a wall of them means the miner is failing its subnet tasks." : undefined
        )
      );
    } else if (deepProbes.ran) {
      telemetry.push(item("d5", "Error log scan", "unknown", "log scan could not run on this transport", "ssh"));
    } else {
      telemetry.push(
        item(
          "d5",
          "Error log scan",
          "unknown",
          "error-log scan needs a live host probe",
          "ssh",
          "Run Deep probe (SSH) to scan the miner log for errors/tracebacks."
        )
      );
    }

    // -- Verdict --------------------------------------------------------------
    const all = [...identity, ...runtime, ...taskflow, ...telemetry];
    const anyFail = all.some((i) => i.status === "fail");
    const anyWarnUnknown = all.some((i) => i.status === "warn" || i.status === "unknown");
    const verdict: GoLiveVerifyPayload["verdict"] =
      row.status !== "started" ? "not-started" : anyFail ? "issues" : anyWarnUnknown ? "partial" : "working";

    const payload: GoLiveVerifyPayload = {
      deployment: {
        id: row.id,
        minerName: row.minerName,
        netuid: row.netuid,
        subnetName: row.subnetName,
        status: row.status,
        mode: row.mode,
        provider: row.provider,
        gpuModel: row.gpuModel,
        hotkeyMasked: row.hotkey ? shortAddr(row.hotkey) : null,
        createdAt: row.createdAt.toISOString(),
        goLiveAt: goLiveAt.toISOString(),
      },
      hoursSinceGoLive: Math.round(hoursSinceGoLive * 10) / 10,
      verdict,
      groups: [
        {
          id: "identity",
          title: "Registration & identity",
          description: "Registered correctly, correct UID, hotkey/coldkey configuration",
          items: identity,
        },
        {
          id: "runtime",
          title: "Runtime & container",
          description: "Hardware detected, container healthy, required files present",
          items: runtime,
        },
        {
          id: "taskflow",
          title: "Task flow",
          description: "Receiving requests, responses succeed, no crash-looping",
          items: taskflow,
        },
        {
          id: "telemetry",
          title: "Telemetry & health",
          description: "Utilization, memory, temperature, disk, error logs",
          items: telemetry,
        },
      ],
      deep: { ran: deepProbes.ran, note: deepProbes.note, lines: deepProbes.lines },
      checkedAt,
    };

    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
