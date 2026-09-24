"use client";

// PROFIT RANK PANEL — "emission vs. rental cost" ranking for the Subnets view.
//
// One honest table that answers: "which subnet pays its miners the most
// AFTER the rig is paid for?" Rows are per-earning-miner P&Ls from the live
// Profitability Engine (shared config with the Opportunities Ledger), ranked
// by net USD/month. Compat-aware: bare-metal subnets are priced at the
// dedicated-server rate and flagged, since hourly clouds are rejected there.
//
// Honesty: whale-mean / knife-fight rows are flagged inline, estimated
// per-miner figures carry an "est." marker, and zero-emission subnets rank
// last by construction instead of being hidden.

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { COMPAT_TIER_META } from "@/lib/infranex/compat";
import {
  PROFIT_VERDICT_STYLE,
  type ProfitRankRow,
} from "@/lib/infranex/profit-rank";
import { cn } from "@/lib/utils";
import {
  Trophy,
  AlertTriangle,
  Swords,
  Timer,
  Server,
  ChevronDown,
  ChevronUp,
  TrendingUp,
} from "lucide-react";

const usd = (n: number) =>
  `${n < 0 ? "-" : "+"}$${Math.round(Math.abs(n)).toLocaleString()}`;

const usdFlat = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString()}`;

type SortKey = "net" | "emission" | "rent" | "margin";

const SORTS: Array<[SortKey, string]> = [
  ["net", "Net profit"],
  ["emission", "Emission /miner"],
  ["rent", "Rig rent"],
  ["margin", "Margin %"],
];

function sortVal(r: ProfitRankRow, k: SortKey): number {
  switch (k) {
    case "emission":
      return r.emissionPerMinerTaoPerDay;
    case "rent":
      return r.rentalMonthlyUsd;
    case "margin":
      return r.marginPct ?? -999;
    default:
      return r.netMonthlyUsd;
  }
}

export function ProfitRankPanel({
  rows,
  taoPriceUsd,
  onViewRequirements,
}: {
  rows: ProfitRankRow[];
  taoPriceUsd: number;
  onViewRequirements?: (netuid: number) => void;
}) {
  const [gpuOnly, setGpuOnly] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("net");

  const gpuRows = useMemo(
    () => (gpuOnly ? rows.filter((r) => r.isGpu) : rows),
    [rows, gpuOnly]
  );

  const sorted = useMemo(() => {
    const r = [...gpuRows];
    r.sort((a, b) => sortVal(b, sortKey) - sortVal(a, sortKey));
    return r;
  }, [gpuRows, sortKey]);

  const shown = expanded ? sorted : sorted.slice(0, 10);

  const profitable = gpuRows.filter((r) => r.verdict === "PROFITABLE").length;
  const best = sorted[0];

  if (rows.length === 0) {
    return (
      <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Profit rank fills in once the live chain scan has run — emission and
          rental costs are computed from the snapshot, not stored.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
      <CardContent className="py-4">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Trophy className="h-4 w-4 text-primary" />
          <p className="text-eyebrow text-muted-foreground">Profit rank</p>
          <p className="text-sm font-semibold">Emission vs. rental cost</p>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {/* Sort selector */}
            {SORTS.map(([k, label]) => (
              <Button
                key={k}
                variant={sortKey === k ? "default" : "outline"}
                size="sm"
                className="h-7 px-2.5 text-[11px]"
                onClick={() => setSortKey(k)}
              >
                {label}
              </Button>
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            <Button
              variant={gpuOnly ? "default" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              onClick={() => setGpuOnly(true)}
            >
              GPU subnets
            </Button>
            <Button
              variant={!gpuOnly ? "default" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-[11px]"
              onClick={() => setGpuOnly(false)}
            >
              All {rows.length}
            </Button>
          </div>
        </div>

        {/* Summary line */}
        <p className="mt-2 text-[11px] text-muted-foreground">
          {gpuRows.length} GPU-relevant subnets ·{" "}
          <span className="text-success">{profitable} profitable</span> after
          rent + opex · TAO ${taoPriceUsd ? taoPriceUsd.toFixed(2) : "—"}
          {best && sortKey === "net" && (
            <>
              {" "}
              · best net: <span className="text-foreground">{best.name}</span>{" "}
              {usd(best.netMonthlyUsd)}/mo
            </>
          )}
        </p>

        {/* Table */}
        <TooltipProvider delayDuration={150}>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead>
                <tr className="border-b border-border/60 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">#</th>
                  <th className="py-1.5 pr-2 font-medium">Subnet</th>
                  <th className="py-1.5 pr-2 font-medium" title="GPU hosting compatibility tier">
                    Compat
                  </th>
                  <th className="py-1.5 pr-2 text-right font-medium">
                    Emission /miner
                  </th>
                  <th className="py-1.5 pr-2 text-right font-medium">Revenue</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Rig rent</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Net /mo</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Margin</th>
                  <th className="py-1.5 pr-2 text-right font-medium" title="Revenue ÷ GPU rent">
                    Rent ×
                  </th>
                  <th className="py-1.5 pr-2 font-medium">Flags</th>
                  <th className="py-1.5 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => {
                  const meta = r.compat
                    ? COMPAT_TIER_META[r.compat.tier]
                    : null;
                  const vs = PROFIT_VERDICT_STYLE[r.verdict ?? "NONE"];
                  const netCls =
                    r.netMonthlyUsd > 0
                      ? "text-success"
                      : r.netMonthlyUsd < 0
                        ? "text-destructive"
                        : "text-muted-foreground";
                  return (
                    <tr
                      key={r.netuid}
                      className="border-b border-border/30 transition-colors hover:bg-muted/20"
                    >
                      <td className="py-1.5 pr-2 text-muted-foreground">
                        {i + 1}
                      </td>
                      <td className="py-1.5 pr-2">
                        <button
                          type="button"
                          className="group flex flex-col items-start text-left"
                          onClick={() => onViewRequirements?.(r.netuid)}
                        >
                          <span className="font-medium text-foreground group-hover:text-primary group-hover:underline">
                            {r.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {r.symbol} · {r.minersCount} miners
                          </span>
                        </button>
                      </td>
                      <td className="py-1.5 pr-2">
                        {meta && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={cn(
                                  "inline-block h-2 w-2 cursor-help rounded-full",
                                  meta.dotClass
                                )}
                                title={meta.label}
                              />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              {meta.label}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {r.emissionPerMinerTaoPerDay > 0 ? (
                          <>
                            {r.emissionPerMinerTaoPerDay.toFixed(2)} TAO/d
                            {r.estimatedPerMiner && (
                              <span
                                className="ml-1 cursor-help text-[9px] text-muted-foreground"
                                title="No reward vector yet — conservative estimate (0.6 × mean over registered miners)"
                              >
                                est.
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {usdFlat(r.revenueMonthlyUsd)}
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        <span className="tabular-nums">
                          {r.rentalMonthlyUsd > 0
                            ? usdFlat(r.rentalMonthlyUsd)
                            : "—"}
                        </span>
                        <span className="block text-[9px] text-muted-foreground">
                          {r.gpuCount > 1 ? `${r.gpuCount}× ` : ""}
                          {r.gpuClass}
                          {r.costClass === "bare-metal" && " · dedicated"}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "py-1.5 pr-2 text-right font-semibold tabular-nums",
                          netCls
                        )}
                      >
                        {usd(r.netMonthlyUsd)}
                        <span className="block text-[9px] font-normal text-muted-foreground">
                          {usd(r.netDailyUsd)}/d
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {r.marginPct != null ? `${r.marginPct}%` : "—"}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {r.rentCoverageX != null ? `${r.rentCoverageX}x` : "—"}
                      </td>
                      <td className="py-1.5 pr-2">
                        <span className="flex items-center gap-1.5">
                          {r.knifeFight && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Swords className="h-3.5 w-3.5 cursor-help text-destructive" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="w-56 text-xs">
                                Knife fight — only {r.rewardedRatioPct}% of
                                slots earned last epoch; a new seat must beat
                                an incumbent whale.
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {!r.knifeFight && r.whaleMean && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangle className="h-3.5 w-3.5 cursor-help text-warning" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="w-56 text-xs">
                                Whale-mean — just {r.rewardedRatioPct}% of
                                slots earned; the headline is a mean over few
                                earners.
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {r.estimatedPerMiner && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Timer className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="w-56 text-xs">
                                Per-miner revenue is estimated — the chain
                                reward vector was not available this epoch.
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {r.costClass === "bare-metal" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Server className="h-3.5 w-3.5 cursor-help text-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="w-56 text-xs">
                                Priced at the dedicated bare-metal rate — the
                                subnet rejects hourly container clouds.
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </span>
                      </td>
                      <td className="py-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                            vs.cls
                          )}
                        >
                          {vs.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TooltipProvider>

        {/* Expand / collapse */}
        {sorted.length > 10 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 gap-1 text-[11px] text-muted-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" /> Show top 10 only
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" /> Show all {sorted.length}
              </>
            )}
          </Button>
        )}

        {/* Assumptions footnote */}
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          Revenue = subnet miner emission ÷ rewarded UIDs (per-earning miner) ×
          live TAO price. Rig rent = hosting-aware GPU-class rate × fleet count
          (Vast/RunPod-class container rate, or the dedicated bare-metal rate
          where hourly clouds are rejected) — then storage, infra and opex from
          Profitability settings. Ranked by net; flags surface whale-means,
          knife fights and estimated revenue before you spend.
        </p>
      </CardContent>
    </Card>
  );
}
