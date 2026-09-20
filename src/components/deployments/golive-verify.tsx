"use client";

// ---------------------------------------------------------------------------
// GO-LIVE VERIFY — the "first 1–6 hours" checklist for a started deployment.
//
// Phase 1 of the operations loop: Deploy → VERIFY → Optimize → Monitor → …
//
// Renders the /api/deployments/[id]/verify payload as four group cards
// (Registration & identity · Runtime & container · Task flow · Telemetry &
// health) with an overall verdict banner and the elapsed go-live window.
// Non-deep checks auto-refresh every 60 s; the Deep probe button adds live
// SSH checks (container status, nvidia-smi, disk, miner-log error scan).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Wrench,
  XCircle,
} from "lucide-react";

type VerifyStatus = "pass" | "warn" | "fail" | "unknown";

interface VerifyItem {
  id: string;
  label: string;
  status: VerifyStatus;
  detail: string;
  source: string;
  checkedAt: string;
  fix?: string;
}

interface VerifyGroup {
  id: string;
  title: string;
  description: string;
  items: VerifyItem[];
}

interface VerifyPayload {
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
    goLiveAt: string | null;
  };
  hoursSinceGoLive: number | null;
  verdict: "working" | "partial" | "issues" | "not-started";
  groups: VerifyGroup[];
  deep: { ran: boolean; note: string | null; lines: string[] };
  checkedAt: string;
}

const VERDICT_META: Record<
  VerifyPayload["verdict"],
  { label: string; cls: string; icon: typeof CheckCircle2 }
> = {
  working: {
    label: "WORKING — all green",
    cls: "border-success/40 bg-success/[0.07] text-success",
    icon: CheckCircle2,
  },
  partial: {
    label: "PARTIALLY VERIFIED — no hard failures, gaps to close",
    cls: "border-amber-500/40 bg-amber-500/[0.07] text-amber-600",
    icon: AlertTriangle,
  },
  issues: {
    label: "ISSUES FOUND — fix the red items before expecting income",
    cls: "border-destructive/40 bg-destructive/[0.07] text-destructive",
    icon: XCircle,
  },
  "not-started": {
    label: "NOT STARTED — the go-live check runs once the miner is started",
    cls: "border-border/60 bg-background/60 text-muted-foreground",
    icon: Info,
  },
};

function StatusIcon({ status }: { status: VerifyStatus }) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />;
  if (status === "warn") return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />;
  if (status === "fail") return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
  return <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />;
}

const SOURCE_LABEL: Record<string, string> = {
  chain: "chain",
  daemon: "daemon",
  probe: "probe",
  traffic: "traffic",
  record: "record",
  ssh: "ssh",
  install: "install",
};

export function GoliveVerify({
  deploymentId,
  minerName,
  netuid,
  status,
}: {
  deploymentId: string;
  minerName: string;
  netuid: number;
  status: string;
}) {
  const [payload, setPayload] = useState<VerifyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [deepLoading, setDeepLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didInit = useRef(false);
  const payloadRef = useRef<VerifyPayload | null>(null);
  const deepLoadingRef = useRef(false);

  const load = useCallback(
    async (deep: boolean) => {
      if (deep) {
        setDeepLoading(true);
        deepLoadingRef.current = true;
      } else setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/deployments/${deploymentId}/verify${deep ? "?deep=1" : ""}`,
          { cache: "no-store" }
        );
        const j = (await res.json()) as VerifyPayload & { error?: string };
        if (!res.ok || j.error) {
          setError(j.error ?? `HTTP ${res.status}`);
        } else {
          // Deep-probe transcript survives the next auto-refresh: a plain
          // re-check must not wipe evidence the operator explicitly paid for.
          if (!deep && !j.deep.lines.length && payloadRef.current?.deep.lines.length) {
            j.deep = payloadRef.current.deep;
          }
          payloadRef.current = j;
          setPayload(j);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setDeepLoading(false);
        deepLoadingRef.current = false;
      }
    },
    [deploymentId]
  );

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void Promise.resolve().then(() => load(false));
    const interval = setInterval(() => {
      // Never stomp a deep probe in flight — the forced chain scan can take a minute.
      if (!deepLoadingRef.current) void load(false);
    }, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const verdict = payload?.verdict ?? "not-started";
  const V = VERDICT_META[verdict];
  const hours = payload?.hoursSinceGoLive ?? null;
  const inFirstWindow = hours !== null && hours <= 6;

  return (
    <div className="space-y-4">
      {/* Verdict banner */}
      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3", V.cls)}>
        <div className="flex items-center gap-2">
          <V.icon className="h-5 w-5" />
          <div>
            <p className="text-sm font-bold">{V.label}</p>
            <p className="text-[11px] opacity-80">
              {payload
                ? `${minerName} · α${payload.deployment.netuid} ${payload.deployment.subnetName} · checked ${new Date(payload.checkedAt).toLocaleTimeString()}`
                : "loading…"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hours !== null && (
            <Badge
              variant="outline"
              className={cn(
                "gap-1 text-[10px]",
                inFirstWindow ? "border-primary/40 text-primary" : "border-border/60 text-muted-foreground"
              )}
            >
              <Clock className="h-3 w-3" />
              {hours < 0.1 ? "just went live" : `${hours.toFixed(1)}h since go-live`}
              {inFirstWindow ? " · first-6h window" : ""}
            </Badge>
          )}
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => void load(false)} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Re-run
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void load(true)}
            disabled={deepLoading}
            title="Live SSH probes: container status, nvidia-smi, disk, miner-log error scan"
          >
            {deepLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Terminal className="h-3 w-3" />}
            Deep probe
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/[0.06] p-3 text-xs text-destructive">
          Verification failed: {error}
        </div>
      )}

      {!payload && loading && (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Running the go-live checklist…
        </div>
      )}

      {payload && (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {payload.groups.map((g) => {
              const fails = g.items.filter((i) => i.status === "fail").length;
              const warns = g.items.filter((i) => i.status === "warn").length;
              const unknowns = g.items.filter((i) => i.status === "unknown").length;
              const passes = g.items.filter((i) => i.status === "pass").length;
              return (
                <div key={g.id} className="rounded-lg border border-border/40 bg-background/60 p-3">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div>
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                        {g.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{g.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {passes > 0 && (
                        <span className="rounded border border-success/30 px-1.5 py-0.5 text-[10px] font-medium text-success">
                          {passes} ✓
                        </span>
                      )}
                      {warns > 0 && (
                        <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                          {warns} !
                        </span>
                      )}
                      {fails > 0 && (
                        <span className="rounded border border-destructive/40 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                          {fails} ✗
                        </span>
                      )}
                      {unknowns > 0 && (
                        <span className="rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {unknowns} ?
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="divide-y divide-border/30">
                    {g.items.map((i) => (
                      <div key={i.id} className="flex items-start gap-2 py-2">
                        <StatusIcon status={i.status} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-xs font-medium">{i.label}</p>
                            <span className="shrink-0 rounded bg-muted/60 px-1 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                              {SOURCE_LABEL[i.source] ?? i.source}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{i.detail}</p>
                          {i.fix && (i.status === "fail" || i.status === "warn" || i.status === "unknown") && (
                            <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-primary/90">
                              <Wrench className="mt-0.5 h-3 w-3 shrink-0" />
                              {i.fix}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Deep probe transcript */}
          {payload.deep.lines.length > 0 && (
            <div className="rounded-lg border border-border/40 bg-background/60 p-3">
              <p className="text-eyebrow mb-1.5 flex items-center gap-1.5 text-muted-foreground">
                <Terminal className="h-3 w-3" /> Deep probe transcript
                {payload.deep.note ? ` — ${payload.deep.note}` : ""}
              </p>
              <pre className="custom-scroll max-h-56 overflow-y-auto rounded bg-background/80 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                {payload.deep.lines.join("\n")}
              </pre>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            {deepLoading
              ? "Deep probe in flight — this forces a fresh chain scan plus live host checks and can take up to a minute…"
              : "Checks auto-refresh every 60 s. Deep probe opens a live session to the host (container status, nvidia-smi, disk, last-300-log-lines error scan). Missing data is shown as unknown — never assumed green."}
          </p>
        </>
      )}
    </div>
  );
}
