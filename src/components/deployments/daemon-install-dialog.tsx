"use client";

// DAEMON-INSTALL — one-click bridge for "install the Node Daemon on my GPU pod".
//
// POST /api/daemon/install registers (or reuses) the deployment's daemon
// identity and returns the generated Python daemon with the one-shot HMAC
// secret embedded. This dialog surfaces that script with copy-paste setup
// commands, so the operator can go from "daemon missing" to heartbeating in
// about a minute: SSH as root → paste one command → wait ~60s → chip online.
//
// platformUrl defaults to the browser's own origin (what the operator is
// looking at) because that is the URL their pod must be able to reach. It is
// editable — localhost origins get an honest warning that a remote pod
// cannot call them back.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Copy, Loader2, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildDaemonSetupCommand, DAEMON_UNINSTALL_COMMAND } from "@/lib/infranex/daemon-setup";

interface InstallResponse {
  ok?: boolean;
  created?: boolean;
  script?: string;
  secretHint?: string;
  error?: string;
}

export function DaemonInstallDialog({
  deploymentId,
  minerName,
  open,
  onOpenChange,
}: {
  deploymentId: string;
  minerName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [platformUrl, setPlatformUrl] = useState("");
  const [data, setData] = useState<InstallResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<"setup" | "script" | "uninstall" | null>(null);

  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(platformUrl);

  const fetchScript = async (url: string) => {
    setLoading(true);
    setData(null);
    try {
      const res = await fetch("/api/daemon/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deploymentId, platformUrl: url }),
      });
      setData(await res.json().catch(() => ({ error: `HTTP ${res.status}` })));
    } catch {
      setData({ error: "Network error — is the server reachable?" });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    if (!platformUrl) setPlatformUrl(window.location.origin);
  }, [open, platformUrl]);

  // Generate as soon as we have a usable URL.
  useEffect(() => {
    if (!open || !platformUrl || data || loading) return;
    void fetchScript(platformUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, platformUrl]);

  const copy = async (kind: "setup" | "script" | "uninstall") => {
    if (kind === "uninstall") {
      try {
        await navigator.clipboard.writeText(DAEMON_UNINSTALL_COMMAND);
      } catch {
        /* best-effort */
      }
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
      return;
    }
    if (!data?.script) return;
    const text = kind === "setup" ? buildDaemonSetupCommand(data.script) : data.script;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API can be denied on http — fall back to a textarea hack
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Install Node Daemon — <span className="text-primary">{minerName}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            The daemon is a zero-dependency Python 3.8+ script (stdlib only, HMAC-SHA256 signed).
            It reports GPU/telemetry every 60s and executes platform-approved commands — including
            the Judge Lab apply_config pushes. Run it on the GPU pod, as root.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Platform URL — must be reachable FROM the pod */}
          <div className="flex items-center gap-2">
            <label className="shrink-0 text-[11px] font-medium text-muted-foreground">
              Platform URL the pod will call:
            </label>
            <input
              value={platformUrl}
              onChange={(e) => {
                setPlatformUrl(e.target.value);
                setData(null); // regenerate with the new URL
              }}
              spellCheck={false}
              className="mono h-7 min-w-0 flex-1 rounded-md border border-border/60 bg-background/40 px-2 text-[11px] outline-none focus:border-primary/50"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1 text-[11px]"
              disabled={loading || !platformUrl}
              onClick={() => void fetchScript(platformUrl)}
            >
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
              Regenerate
            </Button>
          </div>
          {isLocalhost && (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-500">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              localhost will only work if the daemon runs on this same machine. For a remote GPU
              pod (RunPod / Vast / your VPS), use the public URL of this platform.
            </p>
          )}

          {loading && (
            <p className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating daemon script…
            </p>
          )}

          {data?.error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {data.error}
            </p>
          )}

          {data?.script && (
            <>
              <ol className="space-y-1 text-[11px] text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">1.</span> SSH into the GPU pod as
                  root (the daemon writes /root/.infranex_miner_env and tails the miner log).
                </li>
                <li>
                  <span className="font-medium text-foreground">2.</span> Paste the{" "}
                  <span className="font-medium text-foreground">full setup command</span> into the
                  shell — it writes the daemon AND an auto-start service: systemd unit when
                  available (survives pod reboots), bash watchdog fallback in containers
                  (RunPod/Vast).
                </li>
                <li>
                  <span className="font-medium text-foreground">3.</span> Within ~60s the first
                  telemetry lands — the daemon chip on this deployment turns{" "}
                  <span className="font-medium text-success">online</span>.
                </li>
                <li>
                  <span className="font-medium text-foreground">4.</span> From then on, Judge Lab
                  &quot;Apply&quot; fixes and DevOps actions reach the real miner on-host.
                </li>
              </ol>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => void copy("setup")}>
                  {copied === "setup" ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copied === "setup" ? "Copied" : "Copy setup command (auto-start service)"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-[11px]"
                  onClick={() => void copy("script")}
                >
                  {copied === "script" ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copied === "script" ? "Copied" : "Copy script only"}
                </Button>
                <Badge variant="outline" className="gap-1 border-success/30 text-[10px] text-success">
                  <ShieldCheck className="h-3 w-3" />
                  secret embedded once, signed transport
                </Badge>
              </div>

              <pre className="mono max-h-72 overflow-y-auto rounded-lg border border-border/50 bg-background/60 p-3 text-[10px] leading-relaxed text-muted-foreground">
                {buildDaemonSetupCommand(data.script)}
              </pre>

              <p className="text-[10px] text-muted-foreground/70">
                Re-paste any time to update the daemon — the command is idempotent (systemd
                restarts the service; the watchdog replaces the old process). The pod prints which
                launcher it chose: <span className="mono">launcher=systemd</span> or{" "}
                <span className="mono">launcher=watchdog</span>.{" "}
                {data.secretHint ? `Key: ${data.secretHint}. ` : ""}
                Remove later with the uninstall command:
                <button
                  type="button"
                  className="ml-1 text-primary underline underline-offset-2"
                  onClick={() => void copy("uninstall")}
                >
                  {copied === "uninstall" ? "copied ✓" : "copy uninstall command"}
                </button>
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
