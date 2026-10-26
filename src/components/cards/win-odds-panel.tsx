"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  rankWinOdds,
  winTierCounts,
  WIN_TIER_STYLES,
  type WinOdds,
  type WinOddsInput,
  type WinTier,
} from "@/lib/infranex/win-odds";

const TIER_ORDER: WinTier[] = [
  "OPEN_FIELD",
  "FIGHTABLE",
  "KNIFE_FIGHT",
  "DONT_ENTER",
  "UNKNOWN",
];

function top10BarClass(top10Pct: number): string {
  if (top10Pct >= 85) return "bg-destructive";
  if (top10Pct >= 50) return "bg-warning";
  return "bg-success";
}

function WinRow({
  w,
  verdict,
}: {
  w: WinOdds;
  verdict?: string;
}) {
  const style = WIN_TIER_STYLES[w.tier];
  return (
    <div className="rounded-lg border border-border/40 bg-background/40 px-3 py-2 transition-colors hover:bg-background/70">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="mono text-[11px] font-semibold text-foreground/80">
          SN{String(w.netuid).padStart(2, "0")}
        </span>
        <span className="text-xs font-semibold">{w.subnetName}</span>
        {(w.workType === "CPU" || w.minVramGb === 0) && (
          <Badge variant="outline" className="mono h-4 px-1 text-[9px]">
            CPU
          </Badge>
        )}
        {w.minVramGb > 0 && (
          <Badge variant="outline" className="mono h-4 px-1 text-[9px]">
            GPU ≥{w.minVramGb}GB
          </Badge>
        )}
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
            style.chipClass
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", style.dotClass)} />
          {style.label}
        </span>
        {w.oddsPct != null && (
          <span
            className={cn(
              "mono tabular text-[11px] font-semibold",
              w.tier === "OPEN_FIELD"
                ? "text-success"
                : w.tier === "DONT_ENTER"
                  ? "text-destructive"
                  : w.tier === "UNKNOWN"
                    ? "text-muted-foreground"
                    : "text-warning"
            )}
            title="Modeled chance a brand-new seat earns anything in month 1"
          >
            ~{w.oddsPct}% mo-1
          </span>
        )}
        {w.rewardedPct != null && (
          <span className="mono tabular text-[10px] text-muted-foreground">
            {w.rewardedPct > 0 && w.rewardedPct < 1
              ? w.rewardedPct.toFixed(1)
              : Math.round(w.rewardedPct)}
            % slots earn
          </span>
        )}
        {w.top10Pct != null && (
          <span className="inline-flex items-center gap-1" title="Share of the epoch's incentive captured by the 10 best-paid UIDs">
            <span className="text-[10px] text-muted-foreground">top-10%</span>
            <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-border/60">
              <span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full",
                  top10BarClass(w.top10Pct)
                )}
                style={{ width: `${Math.min(100, w.top10Pct)}%` }}
              />
            </span>
            <span className="mono tabular text-[10px]">{Math.round(w.top10Pct)}%</span>
          </span>
        )}
        {verdict && (
          <Badge
            variant="outline"
            className={cn(
              "mono ml-auto h-4 px-1.5 text-[9px]",
              verdict === "RUN"
                ? "border-success/40 text-success"
                : verdict === "WATCH"
                  ? "border-warning/40 text-warning"
                  : "border-destructive/30 text-destructive/80"
            )}
          >
            {verdict}
          </Badge>
        )}
      </div>
      {w.why.length > 0 && (
        <p className="mt-1 truncate text-[10px] leading-relaxed text-muted-foreground" title={w.why.join(" · ")}>
          {w.why.join(" · ")}
        </p>
      )}
    </div>
  );
}

/**
 * WIN-ODDS-1 — "Can I win here?" panel.
 *
 * Answers the question the conviction score deliberately does NOT lead with:
 * how concentrated is the reward distribution, and what are the odds for a
 * NEW seat? Ranked best-odds-first across all subnets; the tier vocabulary
 * (Open field / Fightable / Knife fight / Don't enter) is deliberately blunter
 * than RUN/WATCH/AVOID because this is the pre-money question: where would my
 * registration burn + GPU hours actually have a chance to pay.
 */
export function WinOddsPanel({
  rows,
  verdictFor,
}: {
  rows: WinOddsInput[];
  verdictFor?: (row: WinOddsInput) => string | undefined;
}) {
  const [tierFilter, setTierFilter] = useState<WinTier | "all">("all");

  const ranked = useMemo(() => rankWinOdds(rows), [rows]);
  const counts = useMemo(() => winTierCounts(ranked), [ranked]);
  // netuid → verdict chip (RUN/WATCH/AVOID) — re-computed per render, cheap.
  const verdictMap = new Map<number, string>();
  if (verdictFor) {
    for (const r of rows) {
      const v = verdictFor(r);
      if (v) verdictMap.set(r.netuid, v);
    }
  }
  const visible = useMemo(
    () => (tierFilter === "all" ? ranked : ranked.filter((r) => r.tier === tierFilter)),
    [ranked, tierFilter]
  );
  const total = ranked.length;
  const openCount = counts.OPEN_FIELD;

  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-display flex items-center gap-2 text-xl">
          <Crosshair className="h-4 w-4 text-primary" />
          Can I win here? — competition reality
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Ranked by a{" "}
          <span className="font-medium text-foreground/80">new seat&apos;s</span>{" "}
          odds — not by payout size.{" "}
          <span className="font-medium text-success">{openCount} of {total}</span>{" "}
          subnets are genuinely open to a newcomer; the rest are graded
          honestly below. Many GPU subnets are winner-take-all: the top-10 run
          datacenter farms with dedicated code teams, and stake-weighted
          validator trust keeps them on top. This panel tells you where that
          fight is unwinnable BEFORE you pay the registration burn.
        </p>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setTierFilter("all")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              tierFilter === "all"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/60 bg-card/30 text-muted-foreground hover:text-foreground"
            )}
          >
            All <Badge variant="outline" className="mono h-4 px-1 text-[9px]">{total}</Badge>
          </button>
          {TIER_ORDER.map((t) => {
            const s = WIN_TIER_STYLES[t];
            return (
              <button
                key={t}
                onClick={() => setTierFilter(tierFilter === t ? "all" : t)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  s.chipClass,
                  tierFilter === t
                    ? "ring-1 ring-primary/50"
                    : "opacity-75 hover:opacity-100"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", s.dotClass)} />
                {s.label}
                <Badge variant="outline" className="mono h-4 border-transparent bg-transparent px-1 text-[9px] text-current">
                  {counts[t]}
                </Badge>
              </button>
            );
          })}
        </div>

        <div className="max-h-[430px] space-y-1.5 overflow-y-auto pr-1">
          {visible.map((w) => (
            <WinRow key={w.netuid} w={w} verdict={verdictMap.get(w.netuid)} />
          ))}
          {visible.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No subnets in this tier.
            </p>
          )}
        </div>

        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Odds = modeled chance a brand-new seat earns anything in month 1 —
          rewarded share, discounted for whale dominance, full subnets and the
          bond ramp. &quot;Top-10%&quot; = share of the epoch&apos;s incentive
          taken by the 10 best-paid UIDs — ≥85% means winner-take-all. Reward
          spread is chain-read and refreshes with every scan.
        </p>
      </CardContent>
    </Card>
  );
}
