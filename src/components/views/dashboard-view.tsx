"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Network, TrendingUp, Coins, Activity, ArrowRight, Pickaxe, Landmark, ShieldQuestion, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";import { computeOpportunityScore, type OpportunityScoreResult, type ScoredStrategy } from "@/lib/infranex/opportunity-score";
import { MetricCard } from "@/components/cards/metric-card";
import { DataSourceBanner } from "@/components/cards/data-source-banner";
import { OpportunityTable } from "@/components/tables/opportunity-table";
import { EmissionDonut } from "@/components/charts/emission-donut";
import {
  useNetwork,
  mergeSubnets,
  mergeOpportunities,
  getLiveDashboardMetrics,
  buildEmissionShares,
} from "@/lib/infranex/use-network";
import { useWorkerStatus } from "@/lib/infranex/use-worker-status";
import { useEconomics } from "@/lib/infranex/use-platform";
import { cn, formatNumber, formatCurrency, formatTao, formatRelativeTime } from "@/lib/utils";
import { useProfitabilityConfig } from "@/lib/infranex/use-profitability";
import { useTrustReport, trustVerdictStyle } from "@/lib/infranex/use-trust";
import type { Opportunity, ViewKey } from "@/lib/infranex/types";

interface DashboardViewProps {
  onSelectOpportunity: (o: Opportunity) => void;
  onStartMining?: (o: Opportunity) => void;
  onNavigate: (v: ViewKey) => void;
}

export function DashboardView({ onSelectOpportunity, onStartMining, onNavigate }: DashboardViewProps) {
  const { data: snap, isFetching, refetch } = useNetwork();
  const { data: profConfig } = useProfitabilityConfig();
  const m = getLiveDashboardMetrics(snap, profConfig);
  const liveOpps = mergeOpportunities(snap, profConfig);
  const top = liveOpps.slice(0, 8);

  // MOCK-PURGE-2 — emission distribution derives from the LIVE chain snapshot
  // and the Workers card reads real engine runs from /api/workers/status.
  const emissionSharesLive = buildEmissionShares(mergeSubnets(snap));
  // WALLET-ECON-1 — the Portfolio revenue card reads the REAL spend/earnings
  // rollups (estimate-accrued cost + chain emission deltas), never a stub.
  const { data: econ } = useEconomics(30);
  const {
    data: workerData,
    isFetching: workersFetching,
    refetch: refetchWorkers,
  } = useWorkerStatus();
  const workersLive = workerData?.workers ?? [];

  return (
    <div className="space-y-10">
      {/* Hero */}
      <header className="aurora animate-rise grid grid-cols-1 gap-8 rounded-2xl px-1 pb-8 pt-2 lg:grid-cols-[1.5fr_1fr] lg:items-end">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 backdrop-blur">
            <span className={cn(snap?.source === "live" ? "pulse-dot text-success" : "h-2 w-2 rounded-full bg-warning")} />
            <span className="text-eyebrow text-muted-foreground">
              Section · 01 · Network Intelligence
            </span>
          </div>
          <h1 className="animate-rise text-display mt-4 text-4xl font-bold leading-[1.04] md:text-5xl xl:text-6xl">
            Bittensor,
            <br />
            <span className="text-gradient">read like a book.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            A single pane for every subnet you track — scores, miners,
            profitability, and the workers that keep the picture current.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              onClick={() => onNavigate("opportunities")}
              className="gap-2 rounded-lg shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.5)] transition-all hover:shadow-[0_10px_32px_-8px_hsl(var(--primary)/0.65)]"
            >
              Explore opportunities
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
              className="rounded-lg border-border/60 bg-card/50 backdrop-blur"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Syncing…" : "Refresh chain"}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3 lg:items-end">
          <DataSourceBanner />
        </div>
      </header>

      {/* TAO Opportunity Score — mine vs stake, in numbers */}
      <OpportunityScoreCard onNavigate={onNavigate} />

      {/* TRUST-LOOP — did the fleet actually earn the projection? */}
      <TrustLoopCard onNavigate={onNavigate} />

      {/* Metrics */}
      <section className="stagger grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Chain Subnets"
          value={m.totalSubnets || m.trackedSubnets}
          icon={<Network className="h-4 w-4" />}
          subtitle={
            m.totalSubnets
              ? `${m.trackedSubnets} tracked · ${m.activeSubnets} active`
              : "on Finney"
          }
          change={m.taoChange24h}
          trend={m.taoChange24h >= 0 ? "up" : "down"}
        />
        <MetricCard
          title="TAO Price"
          value={m.taoUsd ? `$${m.taoUsd.toFixed(2)}` : "—"}
          icon={<Coins className="h-4 w-4" />}
          subtitle={
            m.taoMarketCap
              ? `MC ${formatCurrency(m.taoMarketCap)}`
              : "CoinGecko"
          }
          change={m.taoChange24h}
          trend={m.taoChange24h >= 0 ? "up" : "down"}
        />
        <MetricCard
          title="Live Miners"
          value={m.totalMiners}
          icon={<Activity className="h-4 w-4" />}
          subtitle={`Across ${m.trackedSubnets} tracked subnets`}
          change={m.taoChange24h}
          trend={m.taoChange24h >= 0 ? "up" : "down"}
        />
        <MetricCard
          title="Avg Score"
          value={m.avgScore}
          format="raw"
          icon={<TrendingUp className="h-4 w-4" />}
          subtitle={`${m.runCount} RUN · ${m.watchCount} WATCH`}
          change={m.taoChange24h}
          trend={m.taoChange24h >= 0 ? "up" : "down"}
        />
      </section>

      {/* Top opportunities + revenue */}
      <section className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="glass">
          <CardHeader className="flex flex-row items-end justify-between gap-3 space-y-0">
            <div>
              <p className="text-eyebrow text-muted-foreground">
                Table · ranked · top {top.length}
              </p>
              <CardTitle className="text-display mt-2 text-2xl font-bold">
                Best subnets by score
              </CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate("opportunities")}
              className="rounded-lg border-border/60 bg-card/50"
            >
              View all
              <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            <OpportunityTable
              opportunities={top}
              onSelect={onSelectOpportunity}
              onStartMining={onStartMining}
              compact
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="glass">
            <CardHeader className="pb-2">
              <p className="text-eyebrow text-muted-foreground">
                Real P&amp;L · ledger rollups (30d)
              </p>
              <CardTitle className="text-display text-xl font-bold">
                Portfolio revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              {econ?.hasData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-lg border border-border/40 bg-background/60 py-2.5">
                      <p className="text-[10px] text-muted-foreground">Infra spend</p>
                      <p className="mono tabular text-lg font-bold">
                        {formatCurrency(econ.totals.spendUsd)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/40 bg-background/60 py-2.5">
                      <p className="text-[10px] text-muted-foreground">Earned</p>
                      <p className="mono tabular text-lg font-bold text-success">
                        {formatCurrency(econ.totals.earnedUsd)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatTao(econ.totals.earnedTao)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/40 bg-background/60 py-2.5">
                      <p className="text-[10px] text-muted-foreground">Net</p>
                      <p
                        className={cn(
                          "mono tabular text-lg font-bold",
                          econ.totals.netUsd >= 0 ? "text-success" : "text-destructive"
                        )}
                      >
                        {formatCurrency(econ.totals.netUsd)}
                      </p>
                    </div>
                  </div>
                  <div className="flex h-[128px] items-end gap-1 rounded-lg border border-border/40 bg-background/60 p-2">
                    {econ.days.slice(-14).map((d) => {
                      const max = Math.max(
                        ...econ.days.slice(-14).map((x) => Math.max(x.spendUsd, x.earnedUsd)),
                        0.01
                      );
                      return (
                        <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5" title={`${d.day} · spend ${formatCurrency(d.spendUsd)} · earned ${formatCurrency(d.earnedUsd)}`}>
                          {d.earnedUsd > 0 && (
                            <div
                              className="w-full rounded-t bg-success/70"
                              style={{ height: `${Math.max(3, (d.earnedUsd / max) * 56)}px` }}
                            />
                          )}
                          <div
                            className="w-full rounded-t bg-primary/50"
                            style={{ height: `${Math.max(3, (d.spendUsd / max) * 56)}px` }}
                          />
                          <span className="text-[8px] text-muted-foreground">{d.day.slice(8)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Spend accrues from live provider cost while miners run; earnings accumulate real
                    chain emission deltas (rollups survive the telemetry retention window). Green =
                    earned, blue = spend. Last {Math.min(14, econ.days.length)} active days shown.
                  </p>
                </div>
              ) : (
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="tabular text-display text-3xl font-bold tracking-tight">
                    {formatCurrency(0)}
                  </span>
                  <span className="text-sm text-muted-foreground">· {formatTao(0)}</span>
                </div>
              )}
              {!econ?.hasData && (
                <div className="flex h-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/50 text-center">
                  <TrendingUp className="h-5 w-5 text-muted-foreground/50" />
                  <p className="max-w-[260px] text-xs text-muted-foreground">
                    No realized P&amp;L yet — spend and earnings rollups appear
                    once a miner is running (spend) and registered on-chain
                    (earnings).
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader className="pb-2">
              <p className="text-eyebrow text-muted-foreground">
                Distribution · TAO/block
              </p>
              <CardTitle className="text-display text-xl font-bold">
                Emission by subnet
              </CardTitle>
            </CardHeader>
            <CardContent>
              {emissionSharesLive.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center px-4 text-center text-xs text-muted-foreground">
                  Awaiting the live chain snapshot — the emission distribution
                  appears once the scanner syncs.
                </div>
              ) : (
                <>
                  <EmissionDonut data={emissionSharesLive} height={200} />
                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {emissionSharesLive.slice(0, 6).map((e) => (
                      <div key={e.netuid} className="flex items-center gap-2 text-xs">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full ring-2 ring-background"
                          style={{ backgroundColor: e.color }}
                        />
                        <span className="truncate text-muted-foreground">{e.name}</span>
                        <span className="ml-auto mono tabular font-medium">{e.emission.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Decision bands + workers */}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <p className="text-eyebrow text-muted-foreground">
              Decision engine
            </p>
            <CardTitle className="text-display text-2xl font-bold">
              3-pillar verdicts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DecisionRow
              label="RUN"
              hint="Score ≥ 75"
              count={m.runCount}
              total={liveOpps.length}
              color="text-success"
              bg="bg-success/10 ring-1 ring-success/20"
              bar="bg-success"
            />
            <DecisionRow
              label="WATCH"
              hint="Score 40–74"
              count={m.watchCount}
              total={liveOpps.length}
              color="text-warning"
              bg="bg-warning/10 ring-1 ring-warning/20"
              bar="bg-warning"
            />
            <DecisionRow
              label="AVOID"
              hint="Score < 40"
              count={m.avoidCount}
              total={liveOpps.length}
              color="text-destructive"
              bg="bg-destructive/10 ring-1 ring-destructive/20"
              bar="bg-destructive"
            />
            <div className="editorial-rule" />
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Live miners" value={formatNumber(m.totalMiners)} />
              <Stat label="Chain subnets" value={formatNumber(m.totalSubnets)} />
              <Stat label="TAO mkt cap" value={m.taoMarketCap ? formatCurrency(m.taoMarketCap) : "—"} />
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <p className="text-eyebrow text-muted-foreground">System</p>
              <CardTitle className="text-display text-2xl font-bold">Workers</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 rounded-lg"
              onClick={() => refetchWorkers()}
              disabled={workersFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${workersFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {workersLive.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/50 px-3 py-8 text-center text-xs text-muted-foreground">
                No worker runs recorded yet — trigger a pass from
                System &amp; Errors or DevOps Engine.
              </div>
            ) : (
              workersLive.map((w) => {
                const ok = w.status === "completed" || w.status === "running";
                const failed = w.status === "failed";
                return (
                  <div
                    key={w.id}
                    className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/30 px-3 py-2.5 transition-colors hover:border-border/70 hover:bg-card/50"
                  >
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        ok
                          ? "bg-success shadow-[0_0_8px_0_hsl(var(--success)/0.7)]"
                          : failed
                            ? "bg-destructive shadow-[0_0_8px_0_hsl(var(--destructive)/0.7)]"
                            : "bg-warning shadow-[0_0_8px_0_hsl(var(--warning)/0.7)]"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{w.workerName}</p>
                      <p className="text-xs text-muted-foreground">
                        last run {formatRelativeTime(w.lastRun)} ·{" "}
                        <span className="mono tabular">{w.durationMs}ms</span>
                        {w.error ? (
                          <span className="text-destructive"> · {w.error}</span>
                        ) : null}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="mono tabular text-sm font-semibold">
                        {formatNumber(w.tasksProcessed)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">tasks</p>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function DecisionRow({
  label,
  hint,
  count,
  total,
  color,
  bg,
  bar,
}: {
  label: string;
  hint: string;
  count: number;
  total: number;
  color: string;
  bg: string;
  bar: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-[10px]", bg, color)}>
            {label}
          </Badge>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </div>
        <span className="tabular text-sm font-semibold">
          {count}
          <span className="text-muted-foreground">/{total}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-700", bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="tabular text-display text-lg font-bold tracking-tight">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TAO Opportunity Score — the home-screen "what earns more, mine or stake?"
// verdict. Numbers come from the live chain snapshot (emissions, pool depths,
// TAO spot) through the shared opportunity-score engine — no hardcoded
// returns. Capital input scales the staking leg; mining is per miner slot.
// ---------------------------------------------------------------------------

const CAPITAL_KEY = "infranex-opportunity-capital-tao";

function formatINR(usd: number, usdInr: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(usd * usdInr);
}

function riskBadgeClass(risk: string): string {
  if (risk === "low") return "text-success bg-success/10 ring-1 ring-success/20";
  if (risk === "medium") return "text-warning bg-warning/10 ring-1 ring-warning/20";
  return "text-destructive bg-destructive/10 ring-1 ring-destructive/20";
}

function scoreColor(score: number): string {
  if (score >= 70) return "hsl(var(--success))";
  if (score >= 40) return "hsl(var(--warning))";
  return "hsl(var(--destructive))";
}

function ScoreRing({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const filled = (clampScore(score) / 100) * c;
  return (
    <div className="relative h-[136px] w-[136px] shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={scoreColor(score)}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-display text-4xl font-bold tabular">{score}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">score</span>
      </div>
    </div>
  );
}

function clampScore(s: number): number {
  return Math.min(100, Math.max(0, s));
}

function StrategyRow({
  s,
  kind,
  usdInr,
  capitalTao,
  primary,
}: {
  s: ScoredStrategy;
  kind: "mine" | "stake";
  usdInr: number;
  capitalTao: number;
  primary?: boolean;
}) {
  const Icon = kind === "mine" ? Pickaxe : Landmark;
  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        primary
          ? "border-primary/40 bg-primary/5"
          : "border-border/40 bg-background/60"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold",
            kind === "mine" ? "bg-primary/15 text-primary" : "bg-muted text-foreground"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {kind === "mine" ? "Mine" : "Stake TAO"}
        </span>
        <span className="text-sm font-semibold">{s.title}</span>
        {s.netuid != null && s.netuid > 0 && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            α{s.netuid}
          </Badge>
        )}
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide", riskBadgeClass(s.riskLevel))}>
          {s.riskLevel} risk
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {kind === "mine" ? "Expected net return" : "Expected yield (net)"}
          </p>
          <p className="mono tabular text-lg font-bold">
            {kind === "mine"
              ? formatINR(s.netMonthlyUsd, usdInr)
              : `${s.roiMonthlyPct.toFixed(2)}%/mo`}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {kind === "mine"
              ? `$${s.netMonthlyUsd.toLocaleString()}/mo · ${s.roiMonthlyPct.toFixed(1)}%/mo ROI`
              : `${s.roiMonthlyPct.toFixed(2)}% × 12 net APY`}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">TAO accumulation</p>
          <p className="mono tabular text-lg font-bold">
            {s.taoPerMonth.toFixed(3)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">TAO/mo</span>
          </p>
          <p className="text-[10px] text-muted-foreground">
            {kind === "stake" ? `on ${capitalTao} TAO staked` : "gross emission share"}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {kind === "mine" ? "GPU required" : "Confidence"}
          </p>
          {kind === "mine" ? (
            <>
              <p className="mono truncate text-sm font-semibold">{s.requiredGpu ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">
                {s.minVramGb != null ? `${s.minVramGb} GB VRAM · ` : ""}
                {Math.round(s.confidence * 100)}% confidence
              </p>
            </>
          ) : (
            <>
              <p className="mono text-sm font-semibold">{Math.round(s.confidence * 100)}%</p>
              <p className="text-[10px] text-muted-foreground">{s.detail}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const TRUST_VERDICT_ORDER = [
  "on-track",
  "lagging",
  "off-track",
  "warming-up",
  "no-baseline",
] as const;

/** TRUST-LOOP — the fleet's projected-vs-actual scoreboard on the home screen. */
function TrustLoopCard({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { data: trust, isLoading } = useTrustReport(120_000);
  const rows = trust?.rows ?? [];
  const p = trust?.portfolio;
  const projected = p?.projectedMonthlyTao ?? 0;
  const actual = p?.actualMonthlyTao ?? 0;
  const counts = p?.counts;
  const fleetRatio =
    projected > 0 && actual > 0
      ? Math.round((actual / projected) * 100)
      : null;
  const hasStory =
    rows.some((r) => r.verdict !== "no-data") || actual > 0;

  return (
    <Card className="glass">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <p className="text-eyebrow text-muted-foreground">
            Trust loop · projected vs actual
          </p>
          <CardTitle className="text-display mt-2 flex items-center gap-2 text-2xl font-bold">
            <BadgeCheck className="h-5 w-5 text-primary" />
            Did we earn the promise?
          </CardTitle>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate("miners")}
          className="rounded-lg border-border/60 bg-card/50"
        >
          My miners
          <ArrowRight className="ml-2 h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-[92px] items-center justify-center text-sm text-muted-foreground">
            Loading trust report…
          </div>
        ) : !hasStory ? (
          <div className="flex h-[92px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/50 text-center">
            <p className="text-sm font-medium">No miner has booked on-chain earnings yet</p>
            <p className="max-w-[520px] text-xs text-muted-foreground">
              Deploy a miner and its projection is snapshotted from the live chain at deploy time —
              verdicts appear once the emission sampler books the first days.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="flex flex-col justify-center gap-2">
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Projected (at deploy)</p>
                  <p className="tabular text-2xl font-bold">
                    {projected > 0 ? projected.toFixed(2) : "—"}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">TAO/mo</span>
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Actual pace</p>
                  <p className="tabular text-2xl font-bold text-success">
                    {actual > 0 ? actual.toFixed(2) : "—"}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">TAO/mo</span>
                  </p>
                </div>
                {fleetRatio != null && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Fleet accuracy</p>
                    <p
                      className={cn(
                        "tabular text-2xl font-bold",
                        fleetRatio >= 85
                          ? "text-success"
                          : fleetRatio >= 60
                            ? "text-warning"
                            : "text-destructive"
                      )}
                    >
                      {fleetRatio}%
                    </p>
                  </div>
                )}
              </div>
              {p != null && p.netUsd !== 0 && (
                <p className="text-xs text-muted-foreground">
                  Earnings pace {formatCurrency(p.actualUsd)}/mo vs GPU spend pace {formatCurrency(p.actualUsd - p.netUsd)}/mo ·
                  net <span className={p.netUsd >= 0 ? "text-success" : "text-destructive"}>{formatCurrency(p.netUsd)}/mo</span>
                </p>
              )}
            </div>
            <div className="flex flex-col justify-center gap-2">
              <div className="flex flex-wrap gap-1.5">
                {counts != null &&
                  TRUST_VERDICT_ORDER.map((v) => {
                    const n = counts[v] ?? 0;
                    if (n === 0) return null;
                    const s = trustVerdictStyle(v);
                    return (
                      <span key={v} className={cn("badge-status", s.className)}>
                        {n} {s.label.toLowerCase()}
                      </span>
                    );
                  })}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {trust?.calibration.note}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OpportunityScoreCard({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { data: snap, isFetching } = useNetwork();
  const { data: profConfig } = useProfitabilityConfig();
  const { data: trust } = useTrustReport(120_000);
  const [capitalInput, setCapitalInput] = useState("10");
  const [capitalTao, setCapitalTao] = useState(10);
  // TRUST-LOOP recalibration inputs (primitives so the memo stays stable).
  const calMinerDays = trust?.calibration.minerDays ?? 0;
  const calRatio = trust?.calibration.accuracyRatio ?? null;

  // Restore the capital assumption across visits. Deferred past the
  // hydration pass so SSR markup stays deterministic (same pattern as the
  // opportunities view's GPU filter).
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(CAPITAL_KEY); } catch { /* ignore */ }
    if (!saved) return;
    const t = setTimeout(() => {
      setCapitalInput(saved!);
      const n = parseFloat(saved!);
      if (Number.isFinite(n) && n > 0) setCapitalTao(n);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const applyCapital = (raw: string) => {
    setCapitalInput(raw);
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) {
      setCapitalTao(n);
      try { localStorage.setItem(CAPITAL_KEY, String(n)); } catch { /* ignore */ }
    }
  };

  const score: OpportunityScoreResult | null = useMemo(() => {
    if (!snap || snap.subnets.length === 0) return null;
    try {
      return computeOpportunityScore(snap, {
        capitalTao,
        profConfig: profConfig ?? undefined,
        calibration:
          calRatio != null && calMinerDays >= 7
            ? { minerDays: calMinerDays, accuracyRatio: calRatio }
            : null,
      });
    } catch {
      return null;
    }
  }, [snap, capitalTao, profConfig, calMinerDays, calRatio]);

  const recommended = score ? score.recommended : null;
  const alternative = score ? score.alternative : null;
  const showAlternative = alternative && recommended && alternative !== recommended;
  // Runner-ups — the subnets the score evaluated and did NOT pick. Rendered
  // so the verdict is transparent: the card pits the best mining subnet
  // against the best staking lane, but the losers are visible too.
  const hideNetuids = new Set(
    [recommended?.netuid, alternative?.netuid].filter((n): n is number => n != null)
  );
  const runnerUpsMining = score
    ? score.alternatives.mining.filter((m) => !hideNetuids.has(m.netuid)).slice(0, 3)
    : [];
  const runnerUpsStaking = score
    ? score.alternatives.staking.filter((s) => !hideNetuids.has(s.netuid)).slice(0, 3)
    : [];

  return (
    <Card className="glass">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <p className="text-eyebrow text-muted-foreground">
            Decision · mine vs stake, in numbers
          </p>
          <CardTitle className="text-display mt-2 text-2xl font-bold">
            TAO Opportunity Score
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Staking capital</span>
          <Input
            value={capitalInput}
            onChange={(e) => applyCapital(e.target.value)}
            inputMode="decimal"
            className="mono h-9 w-28 text-right tabular"
            aria-label="Capital in TAO"
          />
          <span className="text-xs text-muted-foreground">TAO</span>
        </div>
      </CardHeader>
      <CardContent>
        {!score || !recommended ? (
          <div className="flex h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/50 text-center">
            <ShieldQuestion className="h-5 w-5 text-muted-foreground/50" />
            <p className="max-w-[320px] text-xs text-muted-foreground">
              {isFetching ? "Syncing the live chain snapshot…" : "Awaiting the chain scan — the score appears once subnets, emissions and pool depths land."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex flex-col items-center justify-center gap-3 lg:w-[190px]">
              <ScoreRing score={score.score} />
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide", riskBadgeClass(recommended.riskLevel))}>
                  {recommended.riskLevel} risk
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {Math.round(score.confidence * 100)}% confidence
                </span>
              </div>
              <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
                {score.liveData ? "Live chain data" : "Curated fallback"} · TAO ${score.taoPriceUsd.toFixed(0)} · ₹{score.usdInr}/$
              </p>
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-eyebrow mb-2 text-muted-foreground">
                  Recommended strategy
                  {score.closeCall ? " · close call" : ""}
                </p>
                <StrategyRow
                  s={recommended}
                  kind={recommended.strategy}
                  usdInr={score.usdInr}
                  capitalTao={score.capitalTao}
                  primary
                />
              </div>
              {showAlternative && (
                <div>
                  <p className="text-eyebrow mb-2 text-muted-foreground">Alternative</p>
                  <StrategyRow
                    s={alternative}
                    kind={alternative.strategy}
                    usdInr={score.usdInr}
                    capitalTao={score.capitalTao}
                  />
                </div>
              )}
              {(runnerUpsMining.length > 0 || runnerUpsStaking.length > 0) && (
                <div>
                  <p className="text-eyebrow mb-2 text-muted-foreground">
                    Runner-ups · scored, not picked
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {runnerUpsMining.map((m) => (
                      <span
                        key={`m-${m.netuid}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/60 px-2.5 py-1 text-[11px]"
                      >
                        <Pickaxe className="h-3 w-3 text-primary/70" />
                        <span className="font-semibold">#{m.netuid} {m.name}</span>
                        <span className="mono tabular text-muted-foreground">{m.roiMonthlyPct.toFixed(0)}%/mo</span>
                        <span className="text-muted-foreground/70">{m.gpu}</span>
                      </span>
                    ))}
                    {runnerUpsStaking.map((s) => (
                      <span
                        key={`s-${s.kind}-${s.netuid}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/60 px-2.5 py-1 text-[11px]"
                      >
                        <Landmark className="h-3 w-3 text-muted-foreground" />
                        <span className="font-semibold">{s.kind === "root" ? "Root staking" : `#${s.netuid} ${s.name}`}</span>
                        <span className="mono tabular text-muted-foreground">{s.netApyPct.toFixed(1)}% APY</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {score.notes.length > 0 && (
                <ul className="space-y-1 pt-1">
                  {score.notes.slice(0, 4).map((n, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                      <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                      {n}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center justify-between pt-1">
                <p className="text-[10px] text-muted-foreground">
                  Scored {score.miningEvaluated} mining subnets · {score.miningCandidates} net-positive — the card pits the best against the best staking lane. Mining ROI is per miner slot (net of GPU + infra); staking scales with your capital input.
                </p>
                <Button variant="outline" size="sm" onClick={() => onNavigate("opportunities")} className="shrink-0 rounded-lg border-border/60 bg-card/50">
                  Open opportunities
                  <ArrowRight className="ml-2 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
