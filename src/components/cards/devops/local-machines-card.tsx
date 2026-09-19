"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Laptop,
  Plus,
  Copy,
  Check,
  Trash2,
  Terminal,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CircleDot,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useLocalHosts, type LocalCommandDTO, type LocalHostDTO } from "@/lib/infranex/use-local-hosts";

/**
 * LOCALHOST-1 — Local machines card (DevOps Engine). The user's own
 * laptop/PC as a first-class miner target for the CPU path:
 *   1. "Add laptop" mints a one-time enrollment token → copy-paste command.
 *   2. The laptop (WSL2) runs the Python agent — outbound-only, HMAC-signed,
 *      pulls its own command queue (no inbound ports, NAT-friendly).
 *   3. Commands queued from the app (CPU Guide or the quick box here) run
 *      on the laptop; output streams back into this feed.
 */

function enrollCommand(origin: string, token: string): string {
  return (
    `curl -fsSL ${origin}/api/agent/agent.py -o /tmp/infranex-agent.py && ` +
    `python3 /tmp/infranex-agent.py enroll --server ${origin} --token ${token}`
  );
}

function statusChip(status: string, lastSeenAt: string | null): { label: string; dot: string } {
  if (status === "online") return { label: "online", dot: "bg-success pulse-dot" };
  if (status === "pending") return { label: "awaiting enroll", dot: "bg-amber-400" };
  if (status === "revoked") return { label: "revoked", dot: "bg-red-400" };
  // offline — was online but heartbeat stopped
  return {
    label: lastSeenAt ? `offline · last seen ${formatRelativeTime(lastSeenAt)}` : "offline",
    dot: "bg-muted-foreground/40",
  };
}

const CMD_CHIP: Record<string, string> = {
  queued: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  delivered: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  running: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  done: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  failed: "border-red-500/40 bg-red-500/10 text-red-300",
  timeout: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  canceled: "border-border/60 bg-muted/40 text-muted-foreground",
};

function CommandRow({ c }: { c: LocalCommandDTO }) {
  const [open, setOpen] = useState(false);
  const terminal = c.status === "done" || c.status === "failed" || c.status === "timeout";
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={open ? "Collapse output" : "Expand output"}
          disabled={!terminal}
        >
          {open && terminal ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
        <Badge className={cn("h-5 border px-1.5 text-[10px]", CMD_CHIP[c.status] ?? CMD_CHIP.canceled)}>
          {c.status}
        </Badge>
        <code className="mono min-w-0 flex-1 truncate text-xs text-foreground/90">{c.command}</code>
        {c.phase ? (
          <span className="mono shrink-0 text-[10px] text-muted-foreground/70">{c.phase}</span>
        ) : null}
        {c.durationMs != null ? (
          <span className="mono shrink-0 text-[10px] tabular text-muted-foreground/70">
            {(c.durationMs / 1000).toFixed(1)}s
          </span>
        ) : null}
      </div>
      {open && terminal && c.output ? (
        <pre className="mono max-h-64 overflow-auto whitespace-pre-wrap border-t border-border/50 px-3 py-2 text-[11px] leading-relaxed text-foreground/80">
          {c.output}
        </pre>
      ) : null}
    </div>
  );
}

function HostRow({
  host,
  origin,
  onRevoked,
}: {
  host: LocalHostDTO;
  origin: string;
  onRevoked: (msg: string) => void;
}) {
  const chip = statusChip(host.status, host.lastSeenAt);
  const specs = host.specs;
  const tel = host.telemetry;
  const [quick, setQuick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const queue = async (cmd: string) => {
    setBusy(true);
    setErr(null);
    try {
      await fetch(`/api/devops/local-hosts/${host.id}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      }).then(async (res) => {
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error ?? `queue failed (${res.status})`);
      });
      setQuick("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Queue failed");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/devops/local-hosts/${host.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`revoke failed (${res.status})`);
      onRevoked(`${host.name} revoked — its agent can no longer authenticate.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <CircleDot className={cn("h-3 w-3", chip.dot)} aria-hidden />
          {host.name}
        </span>
        <Badge
          className={cn(
            "h-5 border px-1.5 text-[10px]",
            host.status === "online"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : host.status === "pending"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-border/60 bg-muted/40 text-muted-foreground"
          )}
        >
          {chip.label}
        </Badge>
        {host.version ? (
          <span className="mono text-[10px] text-muted-foreground/60">agent v{host.version}</span>
        ) : null}
        <div className="ms-auto">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
            disabled={busy}
            onClick={revoke}
          >
            <Trash2 className="h-3 w-3" aria-hidden />
            Revoke
          </Button>
        </div>
      </div>

      {/* Specs + telemetry chips */}
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        {specs?.cpuModel ? (
          <span className="rounded border border-border/50 bg-muted/30 px-1.5 py-0.5">
            {specs.cpuModel}
          </span>
        ) : null}
        {specs?.cores ? (
          <span className="mono rounded border border-border/50 bg-muted/30 px-1.5 py-0.5">
            {specs.cores}C/{specs.threads ?? "?"}T
          </span>
        ) : null}
        {specs?.ramGb ? (
          <span className="mono rounded border border-border/50 bg-muted/30 px-1.5 py-0.5">
            {specs.ramGb} GB RAM
          </span>
        ) : null}
        {specs?.diskFreeGb ? (
          <span className="mono rounded border border-border/50 bg-muted/30 px-1.5 py-0.5">
            {specs.diskFreeGb} GB free
          </span>
        ) : null}
        {specs?.os ? (
          <span className="rounded border border-border/50 bg-muted/30 px-1.5 py-0.5">{specs.os}</span>
        ) : null}
        {tel?.load1 != null ? (
          <span className="mono rounded border border-border/50 bg-muted/30 px-1.5 py-0.5">
            load {tel.load1}
          </span>
        ) : null}
        {tel?.memUsedMb != null && tel?.memTotalMb ? (
          <span className="mono rounded border border-border/50 bg-muted/30 px-1.5 py-0.5">
            mem {tel.memUsedMb}/{tel.memTotalMb} MB
          </span>
        ) : null}
        {tel?.tempC != null ? (
          <span
            className={cn(
              "mono rounded border px-1.5 py-0.5",
              tel.tempC >= 85
                ? "border-red-500/40 bg-red-500/10 text-red-300"
                : tel.tempC >= 78
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : "border-border/50 bg-muted/30"
            )}
          >
            {tel.tempC}°C
          </span>
        ) : null}
      </div>

      {/* Quick command box (only useful once online) */}
      {host.status === "online" ? (
        <div className="mt-2.5 flex gap-2">
          <Input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && quick.trim() && !busy) void queue(quick.trim());
            }}
            placeholder="Run a quick command on this machine (e.g. uname -a)"
            className="h-8 bg-background/60 text-xs"
            aria-label={`Quick command for ${host.name}`}
          />
          <Button size="sm" className="h-8 gap-1" disabled={busy || !quick.trim()} onClick={() => void queue(quick.trim())}>
            <Terminal className="h-3.5 w-3.5" aria-hidden />
            Run
          </Button>
        </div>
      ) : null}
      {err ? <p className="mt-1.5 text-xs text-destructive">{err}</p> : null}

      {/* Recent commands feed */}
      {host.commands.length > 0 ? (
        <div className="mt-2.5 space-y-1.5">
          {host.commands.map((c) => (
            <CommandRow key={c.id} c={c} />
          ))}
        </div>
      ) : host.status === "online" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No commands yet — queue one above, or use “Run on laptop” from the CPU Guide.
        </p>
      ) : null}
    </div>
  );
}

export function LocalMachinesCard() {
  const { hosts, isLoading, createEnrollment, invalidate } = useLocalHosts();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pendingEnroll, setPendingEnroll] = useState<{ name: string; cmd: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const add = async () => {
    setCreating(true);
    setErr(null);
    setNote(null);
    try {
      const j = await createEnrollment(name.trim() || "my-laptop");
      setPendingEnroll({
        name: j.host.name,
        cmd: enrollCommand(origin, j.enrollToken),
      });
      setName("");
      setNote(
        `${j.host.name} created — run the command below on the laptop (WSL2/Ubuntu) within 30 minutes.`
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
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

  const online = hosts.filter((h) => h.status === "online").length;

  return (
    <Card className="border-border/60 bg-card/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Laptop className="h-4 w-4 text-primary" aria-hidden />
            Local machines
          </span>
          <span className="mono text-[10px] font-normal text-muted-foreground/60">
            {hosts.length > 0
              ? `${online}/${hosts.length} online · agent pulls commands — no inbound ports`
              : "your laptop as a miner target — NAT-safe pull agent"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Connect your own laptop/PC (Windows via WSL2, or Linux) and drive the CPU-mining
          workflow from this app: the agent dials out, signs every call (HMAC) and executes
          the commands you queue — repo clones, builds, evals, submissions. Commands run
          only from your signed-in session; revoke anytime to cut access.
        </p>

        {/* Add form */}
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !creating) void add();
            }}
            placeholder="Machine name (e.g. hp-ultra5-laptop)"
            className="h-9 bg-background/60 text-sm"
            aria-label="Machine name"
          />
          <Button size="sm" className="h-9 gap-1.5" disabled={creating} onClick={() => void add()}>
            {creating ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden />
            )}
            Add laptop
          </Button>
        </div>

        {note ? (
          <p role="status" className="rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-sm">
            {note}
          </p>
        ) : null}
        {err ? <p className="text-sm text-destructive">{err}</p> : null}

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
              works once and expires in 30 minutes — the card refreshes to “online” automatically.
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

        {/* Host list */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading local machines…</p>
        ) : hosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No local machines yet — add your laptop above to test the CPU workflow on your own
            hardware before renting from a provider.
          </p>
        ) : (
          <div className="space-y-2.5">
            {hosts.map((h) => (
              <HostRow key={h.id} host={h} origin={origin} onRevoked={setNote} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
