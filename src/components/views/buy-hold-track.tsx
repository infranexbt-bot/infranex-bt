"use client";

// ---------------------------------------------------------------------------
// BUY/HOLD TRACK — the Track-2 card of the merged TAO Engine (was the
// Investor Playbook's "Track 2 — BUY / HOLD · entries, DCA and sizing").
//
// MERGE (2026-11-06): the Investor Playbook view folded into TAO Engine —
// this card is the extracted, shared Track-2 piece. It supersedes the old
// standalone Market Route card (same signal badge + reasons, plus the
// reference-level ruler, the DCA ladder and volatility sizing).
//
// Content:
//   · mechanical trend overlay signal (SMA50/200, momentum, drawdown,
//     volatility, staking-yield edge) — every point auditable in reasons
//   · reference-level ruler (180d low/high, SMA200/50, spot)
//   · DCA ladder — deterministic limit rungs off spot + SMA50 trigger
//   · volatility sizing (monthly 1σ / 2σ stress band)
// Data: /api/tao-engine/market. Not financial advice.
// ---------------------------------------------------------------------------

import { useState } from "react";
import {
  Activity,
  Banknote,
  Gauge,
  Info,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { TaoMarketSignal, TaoMarketAction } from "@/lib/infranex/tao-market";

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const pct = (n: number, d = 2) => `${n.toFixed(d)}%`;

export interface MarketResponse {
  signal: TaoMarketSignal;
  dataSources: {
    klinesFetchedAt: string;
    klinesDays: number;
    klinesStale: boolean;
    spotSource: string | null;
    spotFetchedAt: string | null;
    baselineBlock: number;
  };
  disclaimer: string;
}

export const BUY_HOLD_ACTION_STYLE: Record<
  TaoMarketAction,
  { cls: string; icon: typeof TrendingUp; label: string }
> = {
  BUY: { cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", icon: TrendingUp, label: "BUY — accumulate" },
  HOLD: { cls: "bg-sky-500/10 text-sky-600 border-sky-500/30", icon: Activity, label: "HOLD — keep compounding" },
  REDUCE: { cls: "bg-amber-500/10 text-amber-600 border-amber-500/30", icon: Banknote, label: "REDUCE — trim new buys" },
  SELL: { cls: "bg-red-500/10 text-red-600 border-red-500/30", icon: TrendingDown, label: "SELL — de-risk" },
};

// ---------------------------------------------------------------------------
// DCA ladder — deterministic rungs off spot + the 50d mean as the strength
// trigger. Shares sum to 1. Rung prices are LIMITS: each fills only when the
// market comes down to it, so a flat market only fills nothing / partially.
// ---------------------------------------------------------------------------
interface DcaRung {
  key: string;
  label: string;
  share: number;
  limitUsd: number;
  dropPct: number;
  reason: string;
}

function buildDcaLadder(spot: number, sma50: number | null): DcaRung[] {
  const seeds: Array<Omit<DcaRung, "dropPct">> = [
    { key: "r1", label: "Dip limit", share: 0.4, limitUsd: spot * 0.92, reason: "first pullback (−8%)" },
    { key: "r2", label: "Deep dip", share: 0.3, limitUsd: spot * 0.82, reason: "high-vol retrace (−18%)" },
    { key: "r3", label: "Crash zone", share: 0.2, limitUsd: spot * 0.7, reason: "capitulation band (−30%)" },
  ];
  const trigger = sma50 && sma50 > 0 ? sma50 * 1.05 : spot * 1.15;
  seeds.push({
    key: "r4",
    label: "Breakout reserve",
    share: 0.1,
    limitUsd: trigger,
    reason: trigger >= spot ? "buy strength only after the 50d-mean reclaim" : "already in range — trend is up",
  });
  return seeds.map((r) => ({
    ...r,
    dropPct: (r.limitUsd / spot - 1) * 100,
  }));
}

export function BuyHoldTrack({ market }: { market: MarketResponse }) {
  const s = market.signal;
  const spot = s.spot.priceUsd;
  const rungs = buildDcaLadder(spot, s.trend.sma50);
  const [budget, setBudget] = useState("500");
  const budgetNum = Math.max(0, Number(budget) || 0);
  const weekly = budgetNum / (52 / 12);

  // Volatility sizing: monthly 1σ ≈ annualized/√12; 2σ is the "don't get shaken
  // out" band. Pure arithmetic on the reported vol — never part of the score.
  const volAnn = s.volatility.annualizedPct;
  const monthly1 = volAnn != null ? volAnn / Math.sqrt(12) : null;

  const levels = [
    { label: "180d low", v: s.drawdown.low180Usd },
    { label: "SMA200", v: s.trend.sma200 },
    { label: "SMA50", v: s.trend.sma50 },
    { label: "Spot", v: spot, hot: true },
    { label: "180d high", v: s.drawdown.high180Usd },
  ].filter((l) => l.v != null && (l.v as number) > 0) as { label: string; v: number; hot?: boolean }[];
  const lo = Math.min(...levels.map((l) => l.v));
  const hi = Math.max(...levels.map((l) => l.v));

  return (
    <Card className="border-sky-500/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-sky-600" />
          Track 2 — BUY / HOLD · entries, DCA and sizing
        </CardTitle>
        <CardDescription>
          Mechanical trend overlay (SMA50/200, momentum, drawdown, yield edge) — every score point is auditable in
          the reasons. The DCA ladder turns the signal into concrete limit orders.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Signal strip */}
        <div className="flex flex-wrap items-center gap-4">
          {(() => {
            const a = BUY_HOLD_ACTION_STYLE[s.action];
            const Icon = a.icon;
            return (
              <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", a.cls)}>
                <Icon className="h-5 w-5" />
                <div>
                  <div className="text-sm font-bold leading-none">{a.label}</div>
                  <div className="text-[11px] opacity-80">
                    score {s.score > 0 ? "+" : ""}{s.score} · confidence {s.confidence}{s.stale ? " · stale" : ""}
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <div className="text-muted-foreground">Spot</div>
              <div className="font-mono font-semibold tabular">${spot.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">30d / 90d</div>
              <div className="font-mono font-semibold tabular">
                {s.momentum.d30Pct != null ? pct(s.momentum.d30Pct, 1) : "—"} / {s.momentum.d90Pct != null ? pct(s.momentum.d90Pct, 1) : "—"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">vs SMA50 / SMA200</div>
              <div className="font-mono font-semibold tabular">
                {s.trend.priceVsSma50Pct != null ? pct(s.trend.priceVsSma50Pct, 1) : "—"} /{" "}
                {s.trend.priceVsSma200Pct != null ? pct(s.trend.priceVsSma200Pct, 1) : "—"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">From 180d high</div>
              <div className="font-mono font-semibold tabular">
                {s.drawdown.fromHigh180Pct != null ? pct(s.drawdown.fromHigh180Pct, 1) : "—"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Vol (30d ann.)</div>
              <div className="font-mono font-semibold tabular">
                {s.volatility.annualizedPct != null ? pct(s.volatility.annualizedPct, 0) : "—"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Staking edge vs root</div>
              <div className="font-mono font-semibold tabular">
                {s.yieldContext.edgePct != null ? pct(s.yieldContext.edgePct, 2) : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Reference levels ruler */}
        <div>
          <div className="relative h-10 w-full rounded-md border bg-muted/30">
            {levels.map((l) => {
              const left = hi > lo ? ((l.v - lo) / (hi - lo)) * 100 : 50;
              return (
                <div
                  key={l.label}
                  className="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center justify-center"
                  style={{ left: `${Math.min(97, Math.max(3, left))}%` }}
                >
                  <span className={cn("mono text-[9px] leading-none", l.hot ? "font-bold text-foreground" : "text-muted-foreground")}>
                    {l.label}
                  </span>
                  <span className={cn("font-mono text-[10px] leading-tight tabular", l.hot ? "font-bold text-foreground" : "text-muted-foreground")}>
                    ${l.v.toFixed(0)}
                  </span>
                  <span className={cn("mt-0.5 h-2 w-0.5 rounded-full", l.hot ? "bg-primary" : "bg-muted-foreground/40")} aria-hidden="true" />
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {market.dataSources.klinesDays} Binance daily closes · spot via {market.dataSources.spotSource ?? "cache"}
            {market.dataSources.klinesStale ? " · kline cache STALE" : ""}
          </p>
        </div>

        {/* DCA ladder */}
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Label htmlFor="dca-budget" className="text-xs font-semibold text-muted-foreground">
              Monthly DCA budget (USD)
            </Label>
            <Input
              id="dca-budget"
              inputMode="decimal"
              className="mt-1.5 font-mono"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              onBlur={(e) => setBudget(String(Math.max(0, Number(e.target.value) || 0)))}
              placeholder="500"
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Cadence: <span className="font-mono font-semibold text-foreground">${weekly.toFixed(0)}/week</span> —{" "}
              place this week&apos;s slice at the highest unfilled rung, not at market. Rungs are limits: a flat
              market fills nothing, which is the point.
            </p>
            {monthly1 != null && (
              <div className="mt-3 rounded-md border bg-muted/30 p-3 text-[11px]">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Gauge className="h-3.5 w-3.5" /> Volatility sizing
                </div>
                <p className="mt-1 text-muted-foreground">
                  30d annualized vol {pct(volAnn as number, 0)} → typical month ±{monthly1.toFixed(1)}%, stress month
                  (2σ) ±{(monthly1 * 2).toFixed(1)}%. Size so a 2σ drawdown cannot force you to sell — TAO routinely
                  swings {pct(Math.max(20, monthly1), 0)}+ within a month.
                </p>
              </div>
            )}
          </div>
          <div className="lg:col-span-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-[11px]">Rung</TableHead>
                  <TableHead className="h-8 text-right text-[11px]">Limit</TableHead>
                  <TableHead className="h-8 text-right text-[11px]">From spot</TableHead>
                  <TableHead className="h-8 text-right text-[11px]">USD</TableHead>
                  <TableHead className="h-8 text-right text-[11px]">TAO</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rungs.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="py-1.5">
                      <div className="text-[12px] font-medium">{r.label} <span className="font-mono text-[10px] text-muted-foreground">{(r.share * 100).toFixed(0)}%</span></div>
                      <div className="text-[10px] text-muted-foreground">{r.reason}</div>
                    </TableCell>
                    <TableCell className="py-1.5 text-right font-mono text-[12px] tabular">${r.limitUsd.toFixed(2)}</TableCell>
                    <TableCell className={cn("py-1.5 text-right font-mono text-[11px] tabular", r.dropPct >= 0 ? "text-emerald-600" : "text-muted-foreground")}>
                      {pct(r.dropPct, 1)}
                    </TableCell>
                    <TableCell className="py-1.5 text-right font-mono text-[12px] tabular">${fmt.format(budgetNum * r.share)}</TableCell>
                    <TableCell className="py-1.5 text-right font-mono text-[12px] font-semibold tabular">
                      {r.limitUsd > 0 ? (budgetNum * r.share / r.limitUsd).toFixed(3) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Subnet α buys (SN64 / SN4 / SN51 class) are the satellite slice of the STAKE route above — same ladder
              discipline, half the size, expect 50% daily swings there.
            </p>
          </div>
        </div>

        {/* Reasons + playbook line */}
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <span className="font-semibold">Position playbook: </span>
          {s.playbook}
        </div>
        <ul className="grid gap-1 text-[12px] text-muted-foreground md:grid-cols-2">
          {s.reasons.map((r) => (
            <li key={r} className="flex gap-1.5">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              {r}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
