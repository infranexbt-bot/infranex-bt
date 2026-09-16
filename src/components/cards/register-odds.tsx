"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  winnerTrendChipClass,
  winnerTrendChipLabel,
  winnerTrendSentence,
  winnerTrendShortLabel,
  type WinnerTrend,
} from "@/lib/infranex/registration-odds";

/**
 * Minimal shape both `Opportunity` (detail dialog) and `LiveOpportunity`
 * (dashboard ledger row) satisfy — the odds readout only needs these.
 */
export interface RegisterOddsRow {
  netuid: number;
  earnChance?: { level: "high" | "medium" | "low" | "none"; pct: number; note: string } | null;
  rampWeeks?: number | null;
}

/**
 * "If you register today" — the newcomer's odds readout for ONE subnet:
 *   1. First-month odds — modeled chance of earning anything in month 1.
 *   2. Bond ramp — weeks until a performing newcomer reaches full weight.
 *   3. Winner stability — paid-seat count trend across recent chain scans
 *      (fetched lazily per netuid from /api/subnets/odds-history; hidden
 *      gracefully when history is unavailable).
 *
 * Mount per inspected subnet (dashboard seat panel, Opportunities detail
 * dialog) — NOT per table row: the trend query parses stored snapshots and
 * one row each would fan out badly.
 */
export function RegisterOddsBlock({
  row,
  className,
}: {
  row: RegisterOddsRow;
  className?: string;
}) {
  const oddsHistory = useQuery<{ trend: WinnerTrend }>({
    queryKey: ["odds-history", row.netuid],
    queryFn: async () => {
      const res = await fetch(`/api/subnets/odds-history?netuid=${row.netuid}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("odds history unavailable");
      return res.json();
    },
    enabled: row?.netuid != null,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const oddsTrend = oddsHistory.data?.trend ?? null;

  return (
    <div
      className={cn(
        "rounded-lg border border-border/40 bg-background/50 px-2.5 py-2",
        className
      )}
    >
      <p className="text-eyebrow mb-1.5 text-muted-foreground">
        If you register today
      </p>
      <div className="flex flex-wrap gap-1.5">
        {row.earnChance && (
          <span
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/60 px-2.5 py-1 text-[11px]"
            title={row.earnChance.note}
          >
            <span className="font-semibold">First-month odds</span>
            <span
              className={cn(
                "mono tabular",
                row.earnChance.level === "high"
                  ? "text-success"
                  : row.earnChance.level === "none"
                    ? "text-destructive"
                    : "text-warning"
              )}
            >
              ~{row.earnChance.pct}%
            </span>
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
              {row.earnChance.level}
            </span>
          </span>
        )}
        {row.rampWeeks != null && (
          <span
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/60 px-2.5 py-1 text-[11px]"
            title="Bond-EMA ramp: weeks until a performing newcomer reaches full reward weight — expect little to nothing before this"
          >
            <span className="font-semibold">Bond ramp</span>
            <span className="mono tabular text-muted-foreground">
              ~{row.rampWeeks.toFixed(1)} wk
            </span>
          </span>
        )}
        {oddsTrend && (
          <span
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/60 px-2.5 py-1 text-[11px]"
            title={winnerTrendSentence(oddsTrend)}
          >
            <span className={cn("font-semibold", winnerTrendChipClass(oddsTrend.label))}>
              {winnerTrendChipLabel(oddsTrend)}
            </span>
          </span>
        )}
      </div>
      {oddsTrend && (
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          {winnerTrendSentence(oddsTrend)}
        </p>
      )}
    </div>
  );
}

/**
 * Compact per-row odds readout for table rows and grid cards — the same
 * three signals as RegisterOddsBlock ("If you register today") squeezed
 * into one line: first-month odds · bond ramp · winner stability.
 *
 * Fetches NOTHING: the parent passes the trend from the batch useOddsTrends()
 * query, so 129 rows cost one request, not one per row. Renders nothing when
 * the row has no odds data at all.
 */
export function RegisterOddsInline({
  row,
  trend,
  className,
}: {
  row: RegisterOddsRow;
  trend?: WinnerTrend | null;
  className?: string;
}) {
  if (row.earnChance == null && row.rampWeeks == null && trend == null) {
    return null;
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5", className)}>
      {row.earnChance && (
        <span
          className="inline-flex items-center gap-1 text-[10px]"
          title={`If you register today — first-month odds: ${row.earnChance.note}`}
        >
          <span className="text-muted-foreground">mo-1</span>
          <span
            className={cn(
              "mono tabular font-semibold",
              row.earnChance.level === "high"
                ? "text-success"
                : row.earnChance.level === "none"
                  ? "text-destructive"
                  : "text-warning"
            )}
          >
            ~{row.earnChance.pct}%
          </span>
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
            {row.earnChance.level}
          </span>
        </span>
      )}
      {row.rampWeeks != null && (
        <span
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
          title="Bond-EMA ramp: weeks until a performing newcomer reaches full reward weight — expect little to nothing before this"
        >
          <span className="text-muted-foreground">ramp</span>
          <span className="mono tabular">~{row.rampWeeks.toFixed(1)}wk</span>
        </span>
      )}
      {trend && (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[10px] font-semibold",
            winnerTrendChipClass(trend.label)
          )}
          title={winnerTrendSentence(trend)}
        >
          {winnerTrendShortLabel(trend)}
        </span>
      )}
    </div>
  );
}
