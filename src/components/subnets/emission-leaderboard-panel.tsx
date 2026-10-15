"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EMISSION-LEADERBOARD — "Top Subnets by Current Emission Share".
 *
 * Live from the chain snapshot (/api/network, polled every 30s): ranks every
 * earning subnet by its whole-subnet emission value in TAO/day, shows its
 * share of the network's total daily emission, USD estimate at the live TAO
 * price, and the miner-side split (incentive uids) — the part a miner can
 * actually compete for.
 */

export interface EmissionRow {
  netuid: number;
  displayName: string;
  emissionTaoPerDay: number;
  minerEmissionTaoPerDay: number;
  minersCount: number | null;
}

const TOP_N_COLLAPSED = 20;
const BAR_COLORS = [
  "bg-emerald-500", "bg-cyan-500", "bg-violet-500", "bg-amber-500",
  "bg-sky-500", "bg-rose-500", "bg-lime-500", "bg-orange-500",
];

function fmt(n: number, digits = 1) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function EmissionLeaderboardPanel({
  rows,
  taoPriceUsd,
  isLoading,
}: {
  rows: EmissionRow[];
  taoPriceUsd: number | null | undefined;
  isLoading?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const model = useMemo(() => {
    const active = rows
      .filter((r) => r.emissionTaoPerDay > 0)
      .sort((a, b) => b.emissionTaoPerDay - a.emissionTaoPerDay);
    const total = active.reduce((acc, r) => acc + r.emissionTaoPerDay, 0);
    return { active, total };
  }, [rows]);

  if (isLoading || model.total <= 0) {
    return (
      <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
        <CardContent className="py-4 text-xs text-muted-foreground">
          Waiting for the first live chain scan — the emission leaderboard appears after /api/network returns a snapshot.
        </CardContent>
      </Card>
    );
  }

  const { active, total } = model;
  const visible = expanded ? active : active.slice(0, TOP_N_COLLAPSED);
  const rest = active.slice(TOP_N_COLLAPSED);
  const restSum = rest.reduce((acc, r) => acc + r.emissionTaoPerDay, 0);
  const price = taoPriceUsd ?? 0;

  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold tracking-tight">
            Top Subnets by Current Emission Share
          </h2>
          <Badge variant="outline" className="border-success/30 text-[10px] text-success">
            <span className="mr-1 h-1.5 w-1.5 rounded-full bg-success" />
            live chain
          </Badge>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {active.length} earning subnets · total{" "}
            <span className="font-mono text-foreground">{fmt(total)}</span> TAO/day
            {price > 0 && (
              <>
                {" "}≈ <span className="font-mono text-foreground">${fmt(total * price, 0)}</span>/day
              </>
            )}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">#</th>
                <th className="py-1.5 pr-2 font-medium">Subnet</th>
                <th className="py-1.5 pr-2 font-medium">Share</th>
                <th className="py-1.5 pr-2 text-right font-medium">TAO/day</th>
                <th className="py-1.5 pr-2 text-right font-medium">≈ $/day</th>
                <th className="py-1.5 pr-2 text-right font-medium">Miner pool</th>
                <th className="py-1.5 text-right font-medium">Miners</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => {
                const share = (r.emissionTaoPerDay / total) * 100;
                const minerShare =
                  r.emissionTaoPerDay > 0
                    ? (r.minerEmissionTaoPerDay / r.emissionTaoPerDay) * 100
                    : 0;
                return (
                  <tr key={r.netuid} className="border-b border-border/30 last:border-0">
                    <td className="py-1.5 pr-2 font-mono text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 pr-2">
                      <span className="font-mono text-muted-foreground">SN{r.netuid}</span>
                      <span className="ml-1.5 font-medium text-foreground">
                        {r.displayName}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted/40">
                          <div
                            className={cn("h-full rounded-full", BAR_COLORS[i % BAR_COLORS.length])}
                            style={{ width: `${Math.min(100, share)}%` }}
                          />
                        </div>
                        <span className="font-mono">{share.toFixed(2)}%</span>
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono">{fmt(r.emissionTaoPerDay)}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-muted-foreground">
                      {price > 0 ? `$${fmt(r.emissionTaoPerDay * price, 0)}` : "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono">
                      {r.minerEmissionTaoPerDay > 0 ? (
                        <span>
                          {fmt(r.minerEmissionTaoPerDay)}
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({minerShare.toFixed(0)}%)
                          </span>
                        </span>
                      ) : (
                        <span className="text-warning">0</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right font-mono text-muted-foreground">
                      {r.minersCount ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {!expanded && rest.length > 0 && (
                <tr className="text-muted-foreground">
                  <td className="py-1.5 pr-2">—</td>
                  <td className="py-1.5 pr-2">({rest.length} smaller subnets)</td>
                  <td className="py-1.5 pr-2 font-mono">
                    {((restSum / total) * 100).toFixed(2)}%
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono">{fmt(restSum)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">
                    {price > 0 ? `$${fmt(restSum * price, 0)}` : "—"}
                  </td>
                  <td className="py-1.5 pr-2 text-right">—</td>
                  <td className="py-1.5 text-right">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Show top 20 only" : `Show all ${active.length} subnets`}
          </Button>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Info className="h-3 w-3" />
            Emission = whole-subnet value in TAO/day from live chain shares · Miner pool = the
            incentive-uid side miners actually compete for (0 = all emission flows validator-side)
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
