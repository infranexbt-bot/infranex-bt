"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Laptop,
  Plus,
  Copy,
  Check,
  RefreshCw,
  CircleDot,
  Play,
  Rocket,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useLocalHosts, type LocalHostDTO } from "@/lib/infranex/use-local-hosts";
import { setDeployPreselect } from "@/components/deployments/deploy-preselect";
import type { ViewKey } from "@/lib/infranex/types";

/**
 * CPUCAT-LOCAL-1 — the CPU Catalog's "local machine" branch, the $0/mo
 * alternative to renting a Hetzner/DO box:
 *   1. Connect the laptop (same enrollment flow as DevOps → Local machines:
 *      one-time token → paste command in WSL2/Ubuntu → agent dials out).
 *   2. "Start CPU miner" on an online machine → jumps into the Deploy stepper
 *      with the subnet (SN67 Harnyx, the best CPU pick) AND this machine
 *      preselected, landing on the Compute step with "Local machine" picked.
 */

// Best CPU subnet per the fresh chain verdict (block 9,101,516): SN67 Harnyx —
// 117 rewarded miners, ~$11.62 burn, py3.11, no Docker/CUDA needed.
const BEST_CPU_NETUID = 67;

function enrollCommand(origin: string, token: string): string {
  return (
    `curl -fsSL ${origin}/api/agent/agent.py -o /tmp/infranex-agent.py && ` +
    `python3 /tmp/infranex-agent.py enroll --server ${origin} --token ${token}`
  );
}

function statusChip(host: LocalHostDTO): { label: string; cls: string; dot: string } {
  if (host.status === "online")
    return {
      label: "online",
      cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
      dot: "bg-success pulse-dot",
    };
  if (host.status === "pending")
    return {
      label: "awaiting enroll",
      cls: "border-amber-500/40 bg-amber-500/10 text-amber-300",
      dot: "bg-amber-400",
    };
  return {
    label: host.lastSeenAt ? `offline · seen ${formatRelativeTime(host.lastSeenAt)}` : "offline",
    cls: "border-border/60 bg-muted/40 text-muted-foreground",
    dot: "bg-muted-foreground/40",
  };
}

export function LocalMachineSection({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { hosts, isLoading, createEnrollment, invalidate } = useLocalHosts();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pendingEnroll, setPendingEnroll] = useState<{ name: string; cmd: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const connect = async () => {
    setCreating(true);
    setErr(null);
    try {
      const j = await createEnrollment(name.trim() || "my-laptop");
      setPendingEnroll({
        name: j.host.name,
        cmd: enrollCommand(origin, j.enrollToken),
      });
      setName("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setCreating(false);
    }
  };

  const copyEnroll = async () => {
    if (!pendingEnroll) return;
    try {
      await navigator.clipboard.writeText(pendingEnroll.cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — text stays selectable */
    }
  };

  const startMiner = (host: LocalHostDTO) => {
    setDeployPreselect({
      netuid: BEST_CPU_NETUID,
      computeKind: "local",
      localHostId: host.id,
    });
    onNavigate("deployments");
  };

  const online = hosts.filter((h) => h.status === "online").length;

  return (
    <div className="rounded-xl border border-border/60 bg-card/30">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Laptop className="h-4 w-4 text-primary" aria-hidden />
          Or skip the cloud — connect your local machine
          <Badge variant="outline" className="border-primary/40 px-1.5 py-0 text-[10px] text-primary">
            $0/mo
          </Badge>
        </p>
        <span className="mono text-[10px] text-muted-foreground/60">
          {hosts.length > 0
            ? `${online}/${hosts.length} online · agent pulls commands — no inbound ports`
            : "your laptop as the miner box — NAT-safe pull agent"}
        </span>
      </div>

      <div className="space-y-3 px-4 py-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Run the CPU miner on your <span className="font-medium text-foreground">own hardware</span>{" "}
          instead of a rented VPS. Connect the laptop once (Windows via WSL2, or Linux) — the agent
          dials out, signs every call (HMAC) and executes the setup + register commands you send
          from Deployments. Revoke anytime from DevOps → Local machines.
        </p>

        {/* Connect form */}
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !creating) void connect();
            }}
            placeholder="Machine name (e.g. hp-ultra5-laptop)"
            className="h-9 max-w-xs bg-background/60 text-sm"
            aria-label="Machine name"
          />
          <Button size="sm" className="h-9 gap-1.5" disabled={creating} onClick={() => void connect()}>
            {creating ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden />
            )}
            Connect my laptop
          </Button>
        </div>
        {err ? <p className="text-xs text-destructive">{err}</p> : null}

        {/* Enrollment one-liner (token shown once) */}
        {pendingEnroll ? (
          <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/[0.06] p-3">
            <p className="text-xs font-medium">
              On <span className="font-semibold">{pendingEnroll.name}</span> — open Ubuntu
              (WSL2) and paste this, then start the agent:
            </p>
            <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
              <code className="mono min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all text-xs">
                {pendingEnroll.cmd}
              </code>
              <button
                onClick={() => void copyEnroll()}
                aria-label="Copy enroll command"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-success" aria-hidden />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
              <code className="mono min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all text-xs">
                {`python3 /tmp/infranex-agent.py run`}
              </code>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Windows first? In PowerShell run <code className="mono">wsl --install -d Ubuntu</code>,
              reopen, then paste the commands. Keep the agent alive with{" "}
              <code className="mono">tmux</code> or{" "}
              <code className="mono">nohup python3 /tmp/infranex-agent.py run &amp;</code>. The token
              works once and expires in 30 minutes — the machine turns “online” automatically.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => {
                  setPendingEnroll(null);
                  void invalidate();
                }}
              >
                Done — I ran it
              </Button>
              <Button variant="ghost" size="sm" className="h-7" onClick={() => setPendingEnroll(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}

        {/* Connected machines */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Checking for connected machines…</p>
        ) : hosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No local machine connected yet — name it above and run the two commands on the laptop.
            It then appears here and in Deployments as a compute target.
          </p>
        ) : (
          <div className="space-y-2">
            {hosts.map((h) => {
              const chip = statusChip(h);
              const isOnline = h.status === "online";
              return (
                <div
                  key={h.id}
                  className={cn(
                    "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2.5",
                    isOnline
                      ? "border-border/60 bg-card/60"
                      : "border-border/40 bg-card/30 opacity-80"
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <CircleDot className={cn("h-3 w-3", chip.dot)} aria-hidden />
                    {h.name}
                  </span>
                  <Badge className={cn("h-5 border px-1.5 text-[10px]", chip.cls)}>
                    {chip.label}
                  </Badge>
                  <span className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    {h.specs?.cpuModel ? <span>{h.specs.cpuModel}</span> : null}
                    {h.specs?.cores ? (
                      <span className="mono">
                        {h.specs.cores}C{h.specs.threads ? `/${h.specs.threads}T` : ""}
                      </span>
                    ) : null}
                    {h.specs?.ramGb ? <span className="mono">{h.specs.ramGb} GB RAM</span> : null}
                    {h.specs?.os ? <span>{h.specs.os}</span> : null}
                    {h.specs?.python ? <span className="mono">py {h.specs.python}</span> : null}
                  </span>
                  <div className="ms-auto">
                    <Button
                      size="sm"
                      className={cn("h-8 gap-1.5", !isOnline && "pointer-events-none opacity-40")}
                      disabled={!isOnline}
                      onClick={() => startMiner(h)}
                      title={
                        isOnline
                          ? "Open Deployments with this machine preselected"
                          : "Machine must be online (agent running) to start a miner"
                      }
                    >
                      {isOnline ? (
                        <Rocket className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <Play className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Start CPU miner
                    </Button>
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-muted-foreground">
              “Start CPU miner” opens the Deploy stepper preloaded with SN67 Harnyx (the best CPU
              pick) and this machine — switch the subnet in step 1 if you want another one. Manage
              agents, quick commands and logs in DevOps → Local machines.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
