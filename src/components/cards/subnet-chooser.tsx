"use client";

// ---------------------------------------------------------------------------
// SUBNET CHOOSER — the Dashboard's "point a rig here" picker.
//
// Lives inside the TAO Opportunity Score card. The headline ring answers
// "mine vs stake"; this list answers the follow-up: WHICH subnet, CPU or
// GPU, with the receipts to trust it. Every row combines the three signals
// the platform computes independently (mine-pick.ts):
//   Rent earn (rentability × seat reality × new-entrant EV)
//   + Diligence pipeline (14-stage health + verdict gate)
//   + model confidence → one CONVICTION score, ranked.
//
// Row actions mirror the rest of the platform: click = detail dialog,
// "Mine" = the single deploy flow (Deployments stepper preseeded).
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import {
  Cpu,
  Gpu,
  Hammer,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MINE_PICK_BAND_STYLE,
  type MinePick,
} from "@/lib/infranex/mine-pick";
import { RENT_EARN_BAND_STYLE } from "@/lib/infranex/rent-earn";
import { cn } from "@/lib/utils";
import type { Opportunity } from "@/lib/infranex/types";

type HardwareFilter = "all" | "CPU" | "GPU";

const DILIGENCE_META: Record<
  MinePick["diligence"]["verdict"],
  { short: string; className: string; icon: typeof ShieldCheck }
> = {
  CLEAR: {
    short: "Clear",
    className: "bg-success/10 text-success border-success/30",
    icon: ShieldCheck,
  },
  CONDITIONAL: {
    short: "Conditional",
    className: "bg-warning/10 text-warning border-warning/30",
    icon: CircleAlert,
  },
  "DO NOT PROVISION": {
    short: "Do not provision",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    icon: ShieldAlert,
  },
};

function convictionColor(score: number): string {
  if (score >= 65) return "text-success";
  if (score >= 50) return "text-primary";
  if (score >= 35) return "text-warning";
  return "text-destructive";
}

function Stat({
  label,
  children,
  title,
}: {
  label: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="min-w-0" title={title}>
      <p className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mono tabular text-sm font-semibold leading-tight">{children}</div>
    </div>
  );
}

export function SubnetChooser({
  picks,
  onStartMining,
  onSelectOpportunity,
}: {
  picks: MinePick[];
  onStartMining?: (o: Opportunity) => void;
  onSelectOpportunity: (o: Opportunity) => void;
}) {
  const [hw, setHw] = useState<HardwareFilter>("all");
  const [showAll, setShowAll] = useState(false);

  const counts = useMemo(
    () => ({
      all: picks.length,
      CPU: picks.filter((p) => p.hardware === "CPU").length,
      GPU: picks.filter((p) => p.hardware === "GPU").length,
    }),
    [picks]
  );

  const filtered = useMemo(
    () => (hw === "all" ? picks : picks.filter((p) => p.hardware === hw)),
    [picks, hw]
  );
  const visible = showAll ? filtered : filtered.slice(0, 5);

  if (picks.length === 0) {
    return (
      <div className="flex h-[110px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/50 text-center">
        <p className="text-sm font-medium">No net-positive subnet to point a rig at yet</p>
        <p className="max-w-[460px] text-xs text-muted-foreground">
          The picker lists subnets whose profitability P&amp;L is net-positive under your
          current cost settings — it fills in once the chain scan and profitability engine
          have run.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/50 bg-background/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-eyebrow flex items-center gap-1.5 text-muted-foreground">
          <Hammer className="h-3.5 w-3.5" />
          Choose your subnet · CPU or GPU, with conviction
        </p>
        <div className="flex items-center gap-1">
          {(["all", "CPU", "GPU"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setHw(k)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                hw === k
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 bg-card/30 text-muted-foreground hover:text-foreground"
              )}
            >
              {k === "all" ? (
                <>All</>
              ) : k === "CPU" ? (
                <><Cpu className="h-3 w-3" />CPU</>
              ) : (
                <><Gpu className="h-3 w-3" />GPU</>
              )}
              <span className="mono tabular text-[10px] opacity-70">{counts[k]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        {visible.map((p, i) => {
          const bs = MINE_PICK_BAND_STYLE[p.band];
          const rs = RENT_EARN_BAND_STYLE[p.rent.band];
          const dil = DILIGENCE_META[p.diligence.verdict];
          const DilIcon = dil.icon;
          const HwIcon = p.hardware === "CPU" ? Cpu : Gpu;
          const net = p.o.netMonthlyUsd ?? 0;
          return (
            <div
              key={p.o.id}
              onClick={() => onSelectOpportunity(p.o)}
              className="group cursor-pointer rounded-lg border border-border/40 bg-card/30 px-3 py-2.5 transition-colors hover:border-border/70 hover:bg-card/50"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="mono w-5 shrink-0 text-[11px] text-muted-foreground tabular">
                  {i + 1}
                </span>
                <span
                  className={cn(
                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                    p.hardware === "CPU" ? "bg-muted text-foreground/80" : "bg-primary/15 text-primary"
                  )}
                  title={p.hardware === "CPU" ? "CPU-only work — a rented vCPU box qualifies" : "GPU work"}
                >
                  <HwIcon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight">
                    SN{p.o.netuid} {p.o.subnetName}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {p.hardware === "CPU"
                      ? "CPU work"
                      : `${p.o.recommendedGpu}${p.o.minVramGb ? ` · ${p.o.minVramGb}GB+` : ""}`}
                    {p.rent.entry === "free-slot" && p.rent.entry != null
                      ? ` · ${p.o.freeSlots} free seats`
                      : p.rent.entry === "displace"
                        ? " · full — burn entry"
                        : ""}
                  </p>
                </div>
                <span
                  className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", bs.bg, bs.color)}
                  title={`Conviction ${p.conviction}/100 = 40% Rent earn + 35% Diligence pipeline + 25% confidence. ${p.reasons.join(". ")}.`}
                >
                  {bs.label}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Stat label="Conviction" title="40% Rent earn + 35% Diligence pipeline + 25% model confidence, gated by rentability, diligence fails and the minimum-profit rule">
                    <span className={cn("text-base", convictionColor(p.conviction))}>{p.conviction}</span>
                    <span className="text-[10px] font-normal text-muted-foreground">/100</span>
                  </Stat>
                  <Stat label="Rent earn" title={`Rentability × seat reality × new-entrant EV. ${p.rent.notes.join(". ") || "—"}`}>
                    <span className={rs.color}>{p.rent.band}</span>{" "}
                    <span className="text-muted-foreground">{p.rent.score}</span>
                  </Stat>
                  <Stat
                    label="Diligence"
                    title={`14-stage pipeline: ${p.diligence.passCount} pass · ${p.diligence.warnCount} warn · ${p.diligence.failCount} fail — ${p.diligence.verdictReason}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      <DilIcon className={cn("h-3 w-3", dil.className.split(" ")[1])} />
                      {p.diligenceHealth}
                      <span className="text-[10px] font-normal text-muted-foreground">{dil.short}</span>
                    </span>
                  </Stat>
                  <Stat label="Confidence" title="Model confidence — the Miner's Ledger data backing this projection">
                    {p.confidencePct}%
                  </Stat>
                  <Stat label="Earn chance" title="Modeled chance a newcomer earns any reward in month 1">
                    {p.o.earnChance?.pct != null ? `${p.o.earnChance.pct}%` : "—"}
                  </Stat>
                  <Stat label="Net / EV" title="Ledger net per miner slot · new-entrant expected value">
                    ${Math.round(net).toLocaleString()}
                    {p.rent.expectedNetMonthlyUsd != null && (
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {" "}· EV ~${p.rent.expectedNetMonthlyUsd.toLocaleString()}
                      </span>
                    )}
                  </Stat>
                  {onStartMining && (
                    <Button
                      size="sm"
                      className="h-7 shrink-0 gap-1.5 rounded-lg px-2.5 text-[11px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartMining(p.o);
                      }}
                    >
                      Mine
                      <CircleCheck className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length > 5 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
        >
          {showAll ? (
            <>Show top 5 <ChevronUp className="h-3 w-3" /></>
          ) : (
            <>Show all {filtered.length} <ChevronDown className="h-3 w-3" /></>
          )}
        </button>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        Conviction = 40% Rent earn (rentability × seat reality × new-entrant EV) + 35% Diligence
        pipeline (14-stage health, hard-fail gated) + 25% model confidence — so a high number
        means a rented CPU/GPU rig can run the work, a new seat can realistically earn, and the
        pipeline found no deal-breaker. Click a row for the full breakdown; Mine opens the deploy flow.
      </p>
    </div>
  );
}
