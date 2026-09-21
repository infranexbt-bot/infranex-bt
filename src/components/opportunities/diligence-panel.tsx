"use client";

// ---------------------------------------------------------------------------
// DILIGENCE-1 — the 14-stage subnet due-diligence scorecard (UI).
//
// Renders inside the Opportunity detail dialog, below the profitability
// engine. Flow mirrors the operator's printed pipeline:
//   stages 1–14 → OPPORTUNITY verdict gate → YOU APPROVE → provision.
// Provision hands off to the Deployments stepper via the same preselect
// path the "Start mining" button uses (deploy-preselect singleton).
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  computeDiligence,
  type DiligenceReport,
  type DiligenceStage,
  type DiligenceStatus,
  type DiligenceTrend,
} from "@/lib/infranex/diligence";
import type { Opportunity } from "@/lib/infranex/types";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  CircleAlert,
  Info,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

const STAGE_META: Record<DiligenceStatus, { chip: string; icon: typeof CheckCircle2 }> = {
  pass: { chip: "bg-success/10 text-success border-success/30", icon: CheckCircle2 },
  warn: { chip: "bg-warning/10 text-warning border-warning/30", icon: TriangleAlert },
  fail: { chip: "bg-destructive/10 text-destructive border-destructive/30", icon: CircleAlert },
  info: { chip: "bg-muted text-muted-foreground border-border", icon: Info },
};

const VERDICT_META: Record<
  DiligenceReport["verdict"],
  { ring: string; badge: string }
> = {
  CLEAR: {
    ring: "border-success/40 bg-success/5",
    badge: "bg-success/10 text-success border-success/30",
  },
  CONDITIONAL: {
    ring: "border-warning/40 bg-warning/5",
    badge: "bg-warning/10 text-warning border-warning/30",
  },
  "DO NOT PROVISION": {
    ring: "border-destructive/40 bg-destructive/5",
    badge: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

function StageRow({ stage }: { stage: DiligenceStage }) {
  const meta = STAGE_META[stage.status];
  const Icon = meta.icon;
  return (
    <div className="flex gap-3 rounded-lg border border-border/40 bg-card/20 px-3 py-2.5">
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <span className="mono text-[10px] text-muted-foreground">
          {String(stage.n).padStart(2, "0")}
        </span>
        <Icon
          className={cn(
            "h-4 w-4",
            stage.status === "pass" && "text-success",
            stage.status === "warn" && "text-warning",
            stage.status === "fail" && "text-destructive",
            stage.status === "info" && "text-muted-foreground"
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{stage.label}</span>
          <Badge variant="outline" className={cn("mono px-1.5 py-0 text-[9px]", meta.chip)}>
            {stage.status.toUpperCase()}
          </Badge>
        </div>
        <p className="mt-0.5 text-sm font-medium text-foreground/90">{stage.value}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{stage.detail}</p>
        <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
          source · {stage.source}
        </p>
      </div>
    </div>
  );
}

export function DiligencePanel({
  o,
  onProvision,
}: {
  o: Opportunity;
  onProvision: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [trend, setTrend] = useState<DiligenceTrend | null>(null);
  const [approval, setApproval] = useState<{
    id: string;
    verdict: string;
    createdAt: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);

  const report = useMemo(() => computeDiligence(o, trend), [o, trend]);
  const verdictMeta = VERDICT_META[report.verdict];

  // Fetch history-derived context + existing approval when expanded.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    fetch(`/api/diligence/${o.netuid}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (!alive) return;
        setTrend(data.trend ?? null);
        setApproval(data.approval ?? null);
      })
      .catch(() => {
        // Trend stays null → stage 9 shows its data-pending state.
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, o.netuid]);

  const approve = async () => {
    setApproving(true);
    try {
      const res = await fetch("/api/diligence/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          netuid: o.netuid,
          subnetName: o.subnetName,
          verdict: report.verdict,
          score: o.score,
          stages: report.stages,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setApproval({ id: data.id, verdict: report.verdict, createdAt: data.createdAt });
      toast({
        title: `α${o.netuid} approved — ${report.verdict}`,
        description: "Gate recorded. Provisioning is unlocked below.",
      });
    } catch (e) {
      toast({
        title: "Approval failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setApproving(false);
    }
  };

  const approved = approval != null;
  const provisionUnlocked = report.verdict !== "DO NOT PROVISION";

  return (
    <div className={cn("rounded-lg border p-4", verdictMeta.ring)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <h3 className="text-display flex items-center gap-2 text-base font-semibold">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Diligence pipeline — 14 stages before the burn
        </h3>
        <span className="flex items-center gap-2">
          <Badge variant="outline" className={cn("mono text-[10px]", verdictMeta.badge)}>
            {report.verdict}
          </Badge>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
      </button>
      <p className="mt-1 text-xs text-muted-foreground">
        {report.passCount} pass · {report.warnCount} warn · {report.failCount} fail —
        discover → active → registration → miner role → hardware → complexity →
        competition → validator → trend → liquidity → governance → cost → net →
        downside. Every stage cites its source.
      </p>

      {open && (
        <div className="mt-3 space-y-2">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Sampling emission history…
            </div>
          )}
          {report.stages.map((s) => (
            <StageRow key={s.key} stage={s} />
          ))}

          {/* --- GATE: OPPORTUNITY verdict --- */}
          <div className={cn("mt-3 rounded-lg border p-3", verdictMeta.ring)}>
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="text-display text-sm font-bold uppercase tracking-wide">
                Opportunity verdict — {report.verdict}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{report.verdictReason}</p>
          </div>

          {/* --- YOU APPROVE --- */}
          <div className="rounded-lg border border-border/60 bg-card/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Human gate — you approve</p>
                <p className="text-xs text-muted-foreground">
                  {provisionUnlocked
                    ? "Your decision is recorded with the full stage snapshot for audit."
                    : "Hard fails present — approval is locked until they are resolved."}
                </p>
              </div>
              {approved ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-success/30 bg-success/10 text-success"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approved {new Date(approval.createdAt).toLocaleString()} · {approval.verdict}
                </Badge>
              ) : (
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={!provisionUnlocked || approving}
                  onClick={approve}
                >
                  {approving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ClipboardCheck className="h-3.5 w-3.5" />
                  )}
                  Approve α{o.netuid}
                </Button>
              )}
            </div>

            {/* --- PROVISION INFRASTRUCTURE --- */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
              <p className="text-xs text-muted-foreground">
                Next: provision infrastructure — the Deployments stepper
                (subnet preselected, your machine or a rented VPS).
              </p>
              <Button
                size="sm"
                variant={approved ? "default" : "outline"}
                className="gap-1.5"
                disabled={!provisionUnlocked || !approved}
                title={
                  approved
                    ? "Open the Deployments stepper with this subnet preselected"
                    : "Approve first — the gate exists so provisioning is a decision, not a reflex"
                }
                onClick={onProvision}
              >
                Provision infrastructure →
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
