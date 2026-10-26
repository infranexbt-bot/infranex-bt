"use client";

// ---------------------------------------------------------------------------
// RUN-PICK CARD — the Dashboard's ONE decision surface. (VERDICT-UNIFY-1)
//
// Replaces the old "Choose your subnet" picker. There is now exactly ONE
// ranking in the app — conviction (mine-pick.ts) — and ONE vocabulary
// (RUN / WATCH / AVOID). This card answers "what do I run?" with the top
// pick up front, the next four as compact rows, and hands off to the
// Opportunities page for filters and the full table (same ranking, no
// second scoring engine anywhere).
// ---------------------------------------------------------------------------

import { Cpu, Gpu, Hammer, CircleCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  VERDICT_STYLE,
  type MinePick,
} from "@/lib/infranex/mine-pick";
import { rentEarnLabels } from "@/lib/infranex/rent-earn";
import { useProfitabilityConfig } from "@/hooks/use-profitability";
import { cn } from "@/lib/utils";
import type { Opportunity, ViewKey } from "@/lib/infranex/types";

const TOP_N = 5;

export function RunPickCard({
  picks,
  onStartMining,
  onSelectOpportunity,
  onNavigate,
  toolbar,
}: {
  picks: MinePick[];
  onStartMining?: (o: Opportunity) => void;
  onSelectOpportunity: (o: Opportunity) => void;
  onNavigate: (v: ViewKey) => void;
  /** Controls rendered beside the title — e.g. the CostBasisToggle. */
  toolbar?: React.ReactNode;
}) {
  const { data: profConfig } = useProfitabilityConfig();
  const L = rentEarnLabels(profConfig?.hardwareMode);
  const top = picks.slice(0, TOP_N);
  const [first, ...rest] = top;

  return (
    <Card className="glass">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <p className="text-eyebrow flex items-center gap-1.5 text-muted-foreground">
            <Hammer className="h-3.5 w-3.5" />
            Decision · one answer, one ranking
          </p>
          <CardTitle className="text-display mt-2 text-2xl font-bold">
            Start here — the best subnet to run
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            One conviction ranking powers this card and the Opportunities page — RUN / WATCH / AVOID is the only verdict.
          </p>
        </div>
        <div className="flex items-center gap-2">{toolbar}</div>
      </CardHeader>
      <CardContent className="space-y-2">
        {picks.length === 0 || !first ? (
          <div className="flex h-[110px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/50 text-center">
            <p className="text-sm font-medium">No net-positive subnet to run yet</p>
            <p className="max-w-[460px] text-xs text-muted-foreground">
              The ranking lists subnets whose profitability P&amp;L is net-positive
              under your current cost settings — it fills in once the chain scan
              and profitability engine have run.
            </p>
          </div>
        ) : (
          <>
            {/* THE pick — one hero row, one verdict */}
            <div
              onClick={() => onSelectOpportunity(first.o)}
              className="group cursor-pointer rounded-xl border border-primary/25 bg-primary/[0.04] px-4 py-3 transition-colors hover:border-primary/45 hover:bg-primary/[0.07]"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="mono flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
                  1
                </span>
                <span
                  className={cn(
                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                    first.hardware === "CPU" ? "bg-muted text-foreground/80" : "bg-primary/15 text-primary"
                  )}
                  title={first.hardware === "CPU" ? L.cpuTitle : "GPU work"}
                >
                  {first.hardware === "CPU" ? <Cpu className="h-4 w-4" /> : <Gpu className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-bold leading-tight">
                    SN{first.o.netuid} {first.o.subnetName}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {first.hardware === "CPU"
                      ? "CPU work"
                      : `${first.o.recommendedGpu}${first.o.minVramGb ? ` · ${first.o.minVramGb}GB+` : ""}`}
                  </p>
                </div>
                <VerdictBadge verdict={first.verdict} large />
                <div className="ml-auto flex items-center gap-5">
                  <div className="text-right">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Conviction</p>
                    <p className="mono tabular text-xl font-bold leading-tight">
                      {first.conviction}
                      <span className="text-[10px] font-normal text-muted-foreground">/100</span>
                    </p>
                  </div>
                  {first.rent.expectedNetMonthlyUsd != null && (
                    <div className="text-right">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">New-entrant EV</p>
                      <p className="mono tabular text-sm font-semibold leading-tight text-success">
                        ~${first.rent.expectedNetMonthlyUsd.toLocaleString()}/mo
                      </p>
                    </div>
                  )}
                  {onStartMining && (
                    <Button
                      size="sm"
                      className="h-8 shrink-0 gap-1.5 rounded-lg px-3 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartMining(first.o);
                      }}
                    >
                      Mine
                      <CircleCheck className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {first.reasons.length > 0 && (
                <p className="mt-2 truncate text-[11px] text-muted-foreground" title={first.reasons.join(". ")}>
                  {first.reasons.slice(0, 2).join(" · ")}
                </p>
              )}
            </div>

            {/* Runners-up — same ranking, compact */}
            {rest.length > 0 && (
              <div className="space-y-1">
                {rest.map((p, i) => (
                  <div
                    key={p.o.id}
                    onClick={() => onSelectOpportunity(p.o)}
                    className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/40 bg-card/30 px-3 py-2 transition-colors hover:border-border/70 hover:bg-card/50"
                  >
                    <span className="mono w-5 shrink-0 text-[11px] text-muted-foreground tabular">
                      {i + 2}
                    </span>
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                        p.hardware === "CPU" ? "bg-muted text-foreground/80" : "bg-primary/15 text-primary"
                      )}
                    >
                      {p.hardware === "CPU" ? <Cpu className="h-3.5 w-3.5" /> : <Gpu className="h-3.5 w-3.5" />}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      SN{p.o.netuid} {p.o.subnetName}
                      <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                        {p.hardware === "CPU" ? "CPU" : `${p.o.recommendedGpu.replace("NVIDIA ", "")}${p.o.minVramGb ? ` · ${p.o.minVramGb}GB+` : ""}`}
                      </span>
                    </p>
                    <VerdictBadge verdict={p.verdict} />
                    <span className="mono tabular w-10 text-right text-sm font-semibold">{p.conviction}</span>
                    {p.rent.expectedNetMonthlyUsd != null && (
                      <span className="mono tabular w-24 text-right text-xs text-muted-foreground">
                        EV ~${p.rent.expectedNetMonthlyUsd.toLocaleString()}
                      </span>
                    )}
                    {onStartMining && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 gap-1 rounded-lg border-border/60 px-2.5 text-[11px]"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartMining(p.o);
                        }}
                      >
                        Mine
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => onNavigate("opportunities")}
              className="group inline-flex items-center gap-1.5 pt-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              Full ranking — filters, search &amp; the why behind every row
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function VerdictBadge({ verdict, large = false }: { verdict: MinePick["verdict"]; large?: boolean }) {
  const st = VERDICT_STYLE[verdict];
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 font-semibold uppercase tracking-wide",
        st.bg,
        st.color,
        large ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10px]"
      )}
    >
      {st.label}
    </Badge>
  );
}
