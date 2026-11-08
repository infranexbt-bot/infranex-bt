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
  /** EMISSION-SPLIT (eTAO) — owner slot as a fraction of the WHOLE subnet
   *  emission, read live from the chain's emission-weight vector. Null →
   *  protocol default 18% (docs: "Subnets that have never changed it keep
   *  the historical split: 18% owner / 41% validator / 41% miner"). The
   *  owner cut is taken BEFORE the per-uid distribution, so the neuron-side
   *  emissionTaoPerDay covers only the (1 − cut) remainder — the owner lane
   *  is derived as emissionTaoPerDay × cut/(1−cut). */
  ownerCutPct: number | null;
  minersCount: number | null;
  /** "GPU" | "CPU" | "unknown" — derived from the repo-scraped requirements. */
  hwClass: "GPU" | "CPU" | "unknown";
  /** e.g. "8× H200/B200-class node" — null when unknown. */
  gpuReq: string | null;
  minVramGb: number | null;
}

const TOP_N_COLLAPSED = 20;
/** Protocol-default owner cut (bittensor.com/docs/concepts/emissions — the
 *  default emission weight vector). Used when the chain's weight vector is
 *  unreadable for a subnet. */
const DEFAULT_OWNER_CUT = 0.18;
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

function hwBadgeClass(hw: EmissionRow["hwClass"]) {
  switch (hw) {
    case "GPU":
      return "border-violet-500/40 bg-violet-500/10 text-violet-300";
    case "CPU":
      return "border-cyan-500/40 bg-cyan-500/10 text-cyan-300";
    default:
      return "border-border/60 text-muted-foreground";
  }
}

/** EMISSION-SPLIT — derive the Owner / Validator / Miner lanes (TAO/day) for
 *  a row, so O + V + M = the whole-subnet emission. The measured per-uid
 *  value (emissionTaoPerDay) is the NEURON side: it already contains the
 *  realized validator+miner split but NOT the owner cut, which the chain
 *  pays out before the per-uid distribution — hence owner = E × cut/(1−cut)
 *  and whole = E / (1−cut). */
function laneSplit(r: EmissionRow): {
  oc: number;
  ownerTao: number;
  validatorTao: number;
  minerTao: number;
  wholeTao: number;
} {
  const oc = Math.min(Math.max(r.ownerCutPct ?? DEFAULT_OWNER_CUT, 0), 0.66);
  const wholeTao =
    oc < 1 && r.emissionTaoPerDay > 0 ? r.emissionTaoPerDay / (1 - oc) : 0;
  const ownerTao = wholeTao * oc;
  const minerTao = Math.min(
    Math.max(r.minerEmissionTaoPerDay, 0),
    r.emissionTaoPerDay
  );
  const validatorTao = Math.max(r.emissionTaoPerDay - minerTao, 0);
  return { oc, ownerTao, validatorTao, minerTao, wholeTao };
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
  // Lane sums for the collapsed "(N smaller subnets)" row.
  const restLanes = rest.reduce(
    (acc, r) => {
      const ls = laneSplit(r);
      acc.owner += ls.ownerTao;
      acc.validator += ls.validatorTao;
      acc.miner += ls.minerTao;
      return acc;
    },
    { owner: 0, validator: 0, miner: 0 }
  );
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
          <table className="w-full min-w-[1020px] text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-2 font-medium">#</th>
                <th className="py-1.5 pr-2 font-medium">Subnet</th>
                <th className="py-1.5 pr-2 font-medium">Hardware</th>
                <th className="py-1.5 pr-2 font-medium">Share</th>
                <th className="py-1.5 pr-2 text-right font-medium">TAO/day</th>
                <th className="py-1.5 pr-2 text-right font-medium">≈ $/day</th>
                <th className="py-1.5 pr-2 text-right font-medium" title="Owner lane — protocol cut taken before per-uid distribution (eTAO emission-weight vector; 18% default)">Owner τ/d</th>
                <th className="py-1.5 pr-2 text-right font-medium" title="Validator lane — measured from live per-uid emission (dividends side)">Validator τ/d</th>
                <th className="py-1.5 pr-2 text-right font-medium" title="Miner lane — measured from live per-uid emission (incentive uids); what miners compete for">Miner τ/d</th>
                <th className="py-1.5 text-right font-medium">Miners</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => {
                const share = (r.emissionTaoPerDay / total) * 100;
                const { ownerTao, validatorTao, minerTao, wholeTao } =
                  laneSplit(r);
                const pctOfWhole = (v: number) =>
                  wholeTao > 0 ? (v / wholeTao) * 100 : 0;
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
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={cn("shrink-0 px-1.5 py-0 text-[9px]", hwBadgeClass(r.hwClass))}
                        >
                          {r.hwClass === "unknown" ? "?" : r.hwClass}
                        </Badge>
                        {r.hwClass === "GPU" && r.gpuReq && (
                          <span
                            className="max-w-[220px] truncate text-[11px] text-muted-foreground"
                            title={`${r.gpuReq}${r.minVramGb ? ` · ≥${r.minVramGb}GB VRAM` : ""}`}
                          >
                            {r.gpuReq}
                            {r.minVramGb ? (
                              <span className="ml-1 font-mono text-[10px] text-muted-foreground/70">
                                ≥{r.minVramGb}GB
                              </span>
                            ) : null}
                          </span>
                        )}
                      </div>
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
                      {r.emissionTaoPerDay > 0 ? (
                        <span>
                          {fmt(ownerTao)}
                          <span className="ml-1 text-[10px] text-muted-foreground/70">
                            ({pctOfWhole(ownerTao).toFixed(0)}%)
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-muted-foreground">
                      {r.emissionTaoPerDay > 0 ? (
                        <span>
                          {fmt(validatorTao)}
                          <span className="ml-1 text-[10px] text-muted-foreground/70">
                            ({pctOfWhole(validatorTao).toFixed(0)}%)
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono">
                      {r.emissionTaoPerDay > 0 ? (
                        <span>
                          {fmt(minerTao)}
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            ({pctOfWhole(minerTao).toFixed(0)}%)
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
                  <td className="py-1.5 pr-2">—</td>
                  <td className="py-1.5 pr-2 font-mono">
                    {((restSum / total) * 100).toFixed(2)}%
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono">{fmt(restSum)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono">
                    {price > 0 ? `$${fmt(restSum * price, 0)}` : "—"}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-muted-foreground">
                    {fmt(restLanes.owner)}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-muted-foreground">
                    {fmt(restLanes.validator)}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-muted-foreground">
                    {fmt(restLanes.miner)}
                  </td>
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
            Split = Owner / Validator / Miner lanes of each subnet's daily
            emission · Owner = the owner's protocol cut from the on-chain
            emission-weight vector (eTAO — owner-configurable, 18% default,
            paid before the per-uid distribution) · Validator & Miner =
            measured live from per-uid emission (0 in Miner = all
            emission flows validator-side) · TAO/day is the neuron side, so
            Owner + Validator + Miner = the whole-subnet emission · Hardware =
            GPU/CPU class + required GPU scraped from each subnet's repo
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
