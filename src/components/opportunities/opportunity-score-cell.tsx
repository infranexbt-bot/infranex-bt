"use client";

import { AlertTriangle, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  OPPORTUNITY_BAND_STYLE,
  OPPORTUNITY_WEIGHTS,
  type SubnetOpportunityScore,
  type OpportunityScoreComponent,
} from "@/lib/infranex/subnet-opportunity";

// OPPORTUNITY-SCORE-1 UI — the score chip + its evidence dialog.
// The chip shows the effective score (gated rows carry a warning triangle);
// the dialog shows ALL five weighted components with their evidence bullets,
// because the rule is: the score is never shown without the evidence that
// produced it.

function pointsBarClass(points: number): string {
  if (points >= 80) return "bg-success";
  if (points >= 60) return "bg-primary";
  if (points >= 40) return "bg-warning";
  return "bg-destructive";
}

function ComponentRow({ c }: { c: OpportunityScoreComponent }) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/30 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">
          {c.label}
          <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
            weight {Math.round(c.weight * 100)}%
          </span>
        </span>
        <span className={cn("mono tabular text-xs font-semibold", c.missing && "text-muted-foreground")}>
          {Math.round(c.points)}
          {c.missing && <span className="ml-1 text-[10px] font-normal">(no data)</span>}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/40">
          <div
            className={cn("h-full rounded-full transition-all", pointsBarClass(c.points))}
            style={{ width: `${Math.min(100, Math.max(2, c.points))}%` }}
          />
        </div>
        <span className="mono tabular w-12 text-right text-[10px] text-muted-foreground">
          +{c.weighted.toFixed(1)}
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {c.evidence.map((e, i) => (
          <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-border" aria-hidden />
            <span>{e}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OpportunityScoreCell({ score }: { score?: SubnetOpportunityScore }) {
  if (!score) {
    return <span className="text-xs text-muted-foreground" title="Not scored yet">—</span>;
  }
  const band = OPPORTUNITY_BAND_STYLE[score.band];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-accent/40 transition-colors"
          title={`${score.effectiveScore} / 100 — ${band.label}. Click for the evidence breakdown.`}
          aria-label={`Opportunity score ${score.effectiveScore}, ${band.label}. Open evidence.`}
        >
          <span className="mono tabular text-sm font-bold">{score.effectiveScore}</span>
          <span
            className={cn(
              "rounded border px-1 py-px text-[9px] font-semibold uppercase tracking-wide",
              band.className
            )}
          >
            {band.label}
          </span>
          {score.gated && (
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label="Gated" />
          )}
        </button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[85vh] max-w-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
            SN{score.netuid} · {score.subnetName}
            <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase", band.className)}>
              {score.effectiveScore} · {band.label}
            </span>
            {score.gated && (
              <span className="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-destructive">
                <Lock className="h-3 w-3" /> Gated
              </span>
            )}
          </DialogTitle>
          <DialogDescription>{score.oneLine}</DialogDescription>
        </DialogHeader>

        {score.gated && (
          <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/[0.06] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
              Hard gates — a high score never overrides these
            </p>
            {score.gates.map((g, i) => (
              <div key={i}>
                <p className="text-xs font-semibold text-foreground">
                  <AlertTriangle className="mr-1 inline h-3 w-3 text-destructive" />
                  {g.label}
                </p>
                <p className="ml-4 text-[11px] leading-snug text-muted-foreground">{g.detail}</p>
              </div>
            ))}
            {score.effectiveScore < score.rawScore && (
              <p className="mono tabular text-[11px] text-muted-foreground">
                Raw score {score.rawScore} → capped to {score.effectiveScore} while gated.
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          {score.components.map((c) => (
            <ComponentRow key={c.key} c={c} />
          ))}
        </div>

        <p className="text-[11px] leading-snug text-muted-foreground">
          Weights: {Object.entries(OPPORTUNITY_WEIGHTS)
            .map(([k, w]) => `${Math.round(w * 100)}% ${OPPORTUNITY_WEIGHTS_LABELS[k] ?? k}`)
            .join(" · ")}
          . A starting point, not a proven reward predictor — read the evidence, not just the number.
        </p>
      </DialogContent>
    </Dialog>
  );
}

const OPPORTUNITY_WEIGHTS_LABELS: Record<string, string> = {
  netContribution: "net contribution",
  minerPerformance: "miner performance",
  hardwareFit: "hardware fit",
  entryRisk: "entry risk",
  dataQuality: "data quality",
};
