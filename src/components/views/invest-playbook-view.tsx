"use client";

// ---------------------------------------------------------------------------
// INVESTOR PLAYBOOK VIEW — the two-track TAO plan.
//
// INVEST-PLAYBOOK-1 (2026-11-06): the owner asked for ONE page that answers
// both halves of the investing question, split exactly like this:
//
//   STAKING 💋→💰                BUY/HOLD 📈
//   Validator data               TAO price
//   Yield                        DCA
//   Risk                         Entry
//   Take                         Volatility
//
// Track 1 (STAKING) reuses the TAO engine: /api/tao-engine/recommend ranks
// (subnet, validator) picks by sustainable net APY, root-gated, with take,
// capture, risk and exit slippage per pick. Track 2 (BUY/HOLD) reuses
// /api/tao-engine/market (mechanical trend overlay) and adds a deterministic
// DCA ladder + volatility sizing hint computed client-side from the signal.
//
// No new math engines here — this view composes existing, unit-tested libs
// and shows every input so each number stays auditable. Not financial advice.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Banknote,
  Gauge,
  Info,
  Landmark,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
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
import type { RootBaselineRow, SubnetStakeOpportunity } from "@/lib/infranex/tao-engine";
import type { TaoMarketSignal, TaoMarketAction } from "@/lib/infranex/tao-market";
import type { ThreeRoutePlan } from "@/lib/infranex/tao-engine-plan";

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const pct = (n: number, d = 2) => `${n.toFixed(d)}%`;

interface RecommendResponse {
  stakeTao: number;
  root: RootBaselineRow;
  beatingRoot: SubnetStakeOpportunity[];
  belowRoot: SubnetStakeOpportunity[];
  plan: ThreeRoutePlan;
  marketAction: TaoMarketAction | null;
  marketConfidence: string | null;
  marketScore: number | null;
  summary: {
    researchedSubnets: number;
    opportunities: number;
    beatingRootCount: number;
    baselineFetchedAt: string;
    baselineBlock: number;
    taoPriceUsd: number;
    notes: string[];
  };
}

interface MarketResponse {
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

const ACTION_STYLE: Record<TaoMarketAction, { cls: string; icon: typeof TrendingUp; label: string }> = {
  BUY: { cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30", icon: TrendingUp, label: "BUY — accumulate" },
  HOLD: { cls: "bg-sky-500/10 text-sky-600 border-sky-500/30", icon: Activity, label: "HOLD — keep compounding" },
  REDUCE: { cls: "bg-amber-500/10 text-amber-600 border-amber-500/30", icon: Banknote, label: "REDUCE — trim new buys" },
  SELL: { cls: "bg-red-500/10 text-red-600 border-red-500/30", icon: Banknote, label: "SELL — de-risk" },
};

const RISK_STYLE: Record<SubnetStakeOpportunity["riskLevel"], string> = {
  low: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  high: "bg-red-500/10 text-red-600 border-red-500/30",
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

// ---------------------------------------------------------------------------
// Two-track hero — mirrors the owner's split verbatim.
// ---------------------------------------------------------------------------
function TrackHero() {
  const tracks = [
    {
      key: "staking",
      icon: PiggyBank,
      title: "STAKING",
      accent: "text-emerald-600",
      chip: "border-emerald-500/30 bg-emerald-500/10",
      pillars: ["Validator data", "Yield", "Risk", "Take"],
      blurb: "Put TAO to work with a validator. Yield accrues in TAO (root) or α (subnet) — no market timing needed.",
    },
    {
      key: "buyhold",
      icon: TrendingUp,
      title: "BUY / HOLD",
      accent: "text-sky-600",
      chip: "border-sky-500/30 bg-sky-500/10",
      pillars: ["TAO price", "DCA", "Entry", "Volatility"],
      blurb: "Directional accumulation. Mechanical signal sets the mode; the DCA ladder sets the entries; volatility sets the size.",
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-label="Two-track plan">
      {tracks.map((t) => {
        const Icon = t.icon;
        return (
          <div key={t.key} className="relative overflow-hidden rounded-xl border bg-card/60 p-4 lg:p-5">
            <div className="flex items-center gap-2">
              <Icon className={cn("h-5 w-5", t.accent)} aria-hidden="true" />
              <h2 className="text-display text-lg font-bold tracking-tight">{t.title}</h2>
              <span className={cn("ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", t.chip, t.accent)}>
                Track {t.key === "staking" ? "1" : "2"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {t.pillars.map((p) => (
                <span key={p} className="mono rounded-md border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {p}
                </span>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{t.blurb}</p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Allocation bar — the fused split across both tracks (stake / hold / cash).
// Same color language as the TAO engine planner: stake=emerald, hold=sky,
// cash=amber.
// ---------------------------------------------------------------------------
function SplitBar({ plan, marketAction, marketScore }: { plan: ThreeRoutePlan; marketAction: TaoMarketAction | null; marketScore: number | null }) {
  const a = plan.allocation;
  const segments = [
    { key: "stake", label: "STAKE", pct: a.stakePct, tao: a.stakeTao, cls: "bg-emerald-500/80" },
    { key: "hold", label: "HOLD", pct: a.holdPct, tao: a.holdTao, cls: "bg-sky-500/80" },
    { key: "cash", label: "CASH", pct: a.cashPct, tao: a.cashTao, cls: "bg-amber-500/80" },
  ];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          The split — new money across both tracks
        </CardTitle>
        <CardDescription>
          Deterministic three-route allocation for {fmt.format(plan.stakeTao)} TAO at the current market mode
          {marketAction ? ` (${marketAction}, score ${marketScore != null && marketScore > 0 ? "+" : ""}${marketScore})` : " (no signal)"}.
          Full rules live in the TAO Engine → Strategy Planner.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-9 w-full overflow-hidden rounded-lg border" role="img" aria-label={`Allocation: stake ${a.stakePct.toFixed(0)}%, hold ${a.holdPct.toFixed(0)}%, cash ${a.cashPct.toFixed(0)}%`}>
          {segments.map((s) => (
            <div
              key={s.key}
              className={cn("flex items-center justify-center text-[11px] font-semibold text-white", s.cls)}
              style={{ width: `${s.pct}%` }}
              title={`${s.label}: ${fmt.format(s.tao)} TAO (${s.pct.toFixed(0)}%)`}
            >
              {s.pct >= 8 ? `${s.pct.toFixed(0)}%` : ""}
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-muted-foreground">
          {segments.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", s.cls)} aria-hidden="true" />
              {s.label} <span className="font-mono tabular text-foreground/80">{fmt.format(s.tao)} TAO</span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TRACK 1 — STAKING.
// ---------------------------------------------------------------------------
function StakeTrack({ rec }: { rec: RecommendResponse }) {
  const root = rec.root;
  const picks = rec.beatingRoot;
  return (
    <Card className="border-emerald-500/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PiggyBank className="h-4 w-4 text-emerald-600" />
          Track 1 — STAKING · which validators pay the most honest TAO
        </CardTitle>
        <CardDescription>
          Root-gated picks: every row beats plain root staking on sustainable net APY, after the validator&apos;s
          take, pricing α rewards at the realizable (flow) price — never the spot paper price.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Root floor + the four pillars */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Landmark className="h-3.5 w-3.5" /> THE FLOOR — root staking (SN0)
            </div>
            <div className="mt-1.5 font-mono text-xl font-bold tabular">{pct(root.netApyPct)}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              net of the {root.takePct.toFixed(0)}% take · {root.taoPerMonth.toFixed(2)} TAO/mo per {fmt.format(rec.stakeTao)} staked · liquid, no α exposure
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs font-semibold text-muted-foreground">Validator data</div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              capture share = the validator&apos;s Yuma lane share; concentration &gt; 50% means one whale sets your yield.
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs font-semibold text-muted-foreground">Yield vs Risk</div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Sustainable APY is the lane-equilibrium (stake-invariant) band; instant APY is transient and never ranked.
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs font-semibold text-muted-foreground">Take</div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              The fraction the delegate keeps before you get paid — chain default 18%, lower is better, raisable once/30d.
            </p>
          </div>
        </div>

        {/* Picks table */}
        {picks.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            No researched pick beats root staking right now — the honest answer is root staking until the baseline refresh.
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto custom-scroll rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="h-8 text-[11px]">Subnet</TableHead>
                  <TableHead className="h-8 text-[11px]">Best validator (uid · take · capture)</TableHead>
                  <TableHead className="h-8 text-right text-[11px]">Sustainable APY</TableHead>
                  <TableHead className="h-8 text-right text-[11px]">TAO/mo</TableHead>
                  <TableHead className="h-8 text-right text-[11px]">Exit slip</TableHead>
                  <TableHead className="h-8 text-[11px]">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {picks.map((o) => {
                  const v = o.bestValidator;
                  return (
                    <TableRow key={o.netuid}>
                      <TableCell className="py-2">
                        <div className="font-medium">SN{o.netuid} · {o.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          pool {fmt.format(o.poolTao)} TAO · α 24h {o.alphaChange24hPct != null ? pct(o.alphaChange24hPct, 1) : "—"}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="font-mono text-[11px]">uid {v.uid} · take {pct(v.take * 100, 0)} · capture {pct(v.captureShare * 100, 1)}</div>
                        <div className="text-[10px] text-muted-foreground">
                          instant {pct(v.apyInstantPct, 1)} (transient) · band {pct(v.apyLowPct, 1)}–{pct(v.apyHighPct, 1)}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-[12px] font-semibold tabular">
                        {pct(o.bestApySustainablePct, 1)}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-[11px] tabular">
                        {v.taoPerMonth.toFixed(2)}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-[11px] tabular">
                        {o.exitSlippagePct != null ? pct(o.exitSlippagePct, 2) : "—"}
                      </TableCell>
                      <TableCell className="py-2">
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", RISK_STYLE[o.riskLevel])}>
                          {o.riskLevel}
                        </span>
                        <div className="text-[10px] text-muted-foreground">whale {pct(o.topValidatorConcentration * 100, 0)}</div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="text-[11px] text-muted-foreground">
          Baseline: block {fmt.format(rec.summary.baselineBlock)} · fetched {new Date(rec.summary.baselineFetchedAt).toLocaleString()} ·{" "}
          {rec.summary.opportunities} opportunities researched, {rec.summary.beatingRootCount} beat root. Re-run{" "}
          <span className="font-mono">scripts/tao-engine-research.ts</span> to refresh.
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TRACK 2 — BUY/HOLD.
// ---------------------------------------------------------------------------
function BuyHoldTrack({ market }: { market: MarketResponse }) {
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
            const a = ACTION_STYLE[s.action];
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
          <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-4">
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
              <div className="text-muted-foreground">From 180d high</div>
              <div className="font-mono font-semibold tabular">
                {s.drawdown.fromHigh180Pct != null ? pct(s.drawdown.fromHigh180Pct, 1) : "—"}
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

// ---------------------------------------------------------------------------
// VIEW ROOT.
// ---------------------------------------------------------------------------
export function InvestPlaybookView() {
  const [stakeDraft, setStakeDraft] = useState("100");
  const [stakeCommitted, setStakeCommitted] = useState(100);
  const commitStake = () =>
    setStakeCommitted(Math.min(Math.max(Math.round(Number(stakeDraft) || 0), 1), 10_000_000));

  const recQ = useQuery<RecommendResponse>({
    queryKey: ["invest-playbook-recommend", stakeCommitted],
    queryFn: async () => {
      const res = await fetch(`/api/tao-engine/recommend?stake=${stakeCommitted}&limit=10`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<RecommendResponse>;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const marketQ = useQuery<MarketResponse>({
    queryKey: ["invest-playbook-market"],
    queryFn: async () => {
      const res = await fetch("/api/tao-engine/market");
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<MarketResponse>;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const rec = recQ.data ?? null;
  const market = marketQ.data ?? null;

  return (
    <div className="flex flex-col gap-6">
      <TrackHero />

      {/* Stake size control — drives the whole STAKING track */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card/60 p-4">
        <div className="w-40">
          <Label htmlFor="stake-tao" className="text-xs font-semibold text-muted-foreground">
            Your stake (TAO)
          </Label>
          <Input
            id="stake-tao"
            inputMode="decimal"
            className="mt-1.5 font-mono"
            value={stakeDraft}
            onChange={(e) => setStakeDraft(e.target.value)}
            onBlur={commitStake}
            onKeyDown={(e) => e.key === "Enter" && commitStake()}
          />
        </div>
        <p className="flex-1 text-[12px] text-muted-foreground">
          Press Enter or click away to apply — every TAO figure in Track 1 (and the split bar) recomputes for this
          stake. All math is take-adjusted and α-priced at the realizable flow price.
        </p>
        {rec && (
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-600">
            <ShieldCheck className="h-4 w-4" />
            {rec.summary.beatingRootCount} of {rec.summary.opportunities} researched picks beat root
          </div>
        )}
      </div>

      {rec && rec.plan && <SplitBar plan={rec.plan} marketAction={rec.marketAction} marketScore={rec.marketScore} />}

      {recQ.isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Ranking validator stake lanes over the research baseline…
          </CardContent>
        </Card>
      )}
      {recQ.isError && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-red-500">
            Staking engine unavailable: {recQ.error instanceof Error ? recQ.error.message : "unknown"}
          </CardContent>
        </Card>
      )}
      {rec && <StakeTrack rec={rec} />}

      {marketQ.isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Reading the tape…</CardContent>
        </Card>
      )}
      {marketQ.isError && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-red-500">
            Market signal unavailable: {marketQ.error instanceof Error ? marketQ.error.message : "unknown"}
          </CardContent>
        </Card>
      )}
      {market && <BuyHoldTrack market={market} />}

      <p className="text-[11px] text-muted-foreground">
        Research tooling, not financial advice. Staking figures come from the frozen chain research baseline
        (staleness shown); market signal is a mechanical trend overlay on daily closes. Staking yields are not
        promises — α rewards reprice continuously under dTAO/Taoflow.
      </p>
    </div>
  );
}
