"use client";

// ---------------------------------------------------------------------------
// TAO ENGINE VIEW — validator staking recommendations.
//
// The owner's focus (2026-11-05): accumulate TAO via VALIDATOR STAKING.
// This view answers "given S TAO, which subnet validators accumulate the
// most honest TAO?" — sustainable lane-level net APY (ranked, root-gated),
// instant APY shown as transient upside only, honest α-price bands, exit
// slippage for the user's own stake. Data: /api/tao-engine/recommend over
// the frozen chain research baseline (scripts/tao-engine-research.ts).
// Math: lib/infranex/tao-engine.ts (pure, unit-tested).
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowDownUp,
  Info,
  Landmark,
  Minus,
  ShieldCheck,
  Sparkles,
  Timer,
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
import type { RootBaselineRow, SubnetStakeOpportunity } from "@/lib/infranex/tao-engine";
import type { TaoMarketSignal, TaoMarketAction } from "@/lib/infranex/tao-market";

interface RecommendResponse {
  stakeTao: number;
  root: RootBaselineRow;
  beatingRoot: SubnetStakeOpportunity[];
  belowRoot: SubnetStakeOpportunity[];
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

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const pct = (n: number, d = 2) => `${n.toFixed(d)}%`;

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
  HOLD: { cls: "bg-sky-500/10 text-sky-600 border-sky-500/30", icon: Minus, label: "HOLD — keep compounding" },
  REDUCE: { cls: "bg-amber-500/10 text-amber-600 border-amber-500/30", icon: ArrowDownRight, label: "REDUCE — trim new buys" },
  SELL: { cls: "bg-red-500/10 text-red-600 border-red-500/30", icon: TrendingDown, label: "SELL — de-risk" },
};

function MarketRouteCard() {
  const { data, isLoading, isError, error } = useQuery<MarketResponse>({
    queryKey: ["tao-engine-market"],
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          Market Route — buy / hold / sell TAO
        </CardTitle>
        <CardDescription>
          Mechanical trend overlay on daily closes (SMA50/200, momentum, drawdown, volatility) plus the
          staking-yield edge. Every score point is auditable in the reasons below — not a prediction.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <div className="py-6 text-center text-sm text-muted-foreground">Reading the tape…</div>}
        {isError && (
          <div className="py-6 text-center text-sm text-red-500">
            Market signal unavailable: {error instanceof Error ? error.message : "unknown"}
          </div>
        )}
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-4">
              {(() => {
                const a = ACTION_STYLE[data.signal.action];
                const Icon = a.icon;
                return (
                  <div className={cn("flex items-center gap-2 rounded-lg border px-4 py-2", a.cls)}>
                    <Icon className="h-5 w-5" />
                    <div>
                      <div className="text-lg font-bold leading-none">{a.label}</div>
                      <div className="text-[11px] opacity-80">
                        score {data.signal.score > 0 ? "+" : ""}{data.signal.score} · confidence {data.signal.confidence}
                        {data.signal.stale && " · stale data"}
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div className="flex flex-1 flex-wrap gap-6 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Spot</div>
                  <div className="font-semibold">${data.signal.spot.priceUsd.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">30d momentum</div>
                  <div className="font-semibold">
                    {data.signal.momentum.d30Pct != null ? pct(data.signal.momentum.d30Pct, 1) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">vs SMA50 / SMA200</div>
                  <div className="font-semibold">
                    {data.signal.trend.priceVsSma50Pct != null ? pct(data.signal.trend.priceVsSma50Pct, 1) : "—"} /{" "}
                    {data.signal.trend.priceVsSma200Pct != null ? pct(data.signal.trend.priceVsSma200Pct, 1) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">From 180d high</div>
                  <div className="font-semibold">
                    {data.signal.drawdown.fromHigh180Pct != null ? pct(data.signal.drawdown.fromHigh180Pct, 1) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Volatility (30d ann.)</div>
                  <div className="font-semibold">
                    {data.signal.volatility.annualizedPct != null ? pct(data.signal.volatility.annualizedPct, 0) : "—"}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-md border bg-muted/40 p-3 text-sm">
              <span className="font-semibold">Playbook: </span>
              {data.signal.playbook}
            </div>
            <ul className="mt-3 grid gap-1 text-[12px] text-muted-foreground md:grid-cols-2">
              {data.signal.reasons.map((r) => (
                <li key={r} className="flex gap-1.5">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
            <div className="mt-3 text-[11px] text-muted-foreground">
              {data.disclaimer} · {data.dataSources.klinesDays} daily closes (Binance) · spot via{" "}
              {data.dataSources.spotSource ?? "cache"} · staking edge from baseline block{" "}
              {fmt.format(data.dataSources.baselineBlock)}.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RiskChip({ level }: { level: SubnetStakeOpportunity["riskLevel"] }) {
  const style =
    level === "medium"
      ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
      : "bg-red-500/10 text-red-600 border-red-500/30";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", style)}>
      {level === "medium" ? <ShieldCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {level}
    </span>
  );
}

export function TaoEngineView() {
  const [stakeInput, setStakeInput] = useState("100");
  const stake = Math.max(Number(stakeInput) > 0 ? Number(stakeInput) : 100, 1);

  const { data, isLoading, isError, error } = useQuery<RecommendResponse>({
    queryKey: ["tao-engine-recommend", stake],
    queryFn: async () => {
      const res = await fetch(`/api/tao-engine/recommend?stake=${stake}&limit=12`);
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<RecommendResponse>;
    },
    staleTime: 60_000,
  });

  const rows = data?.beatingRoot ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Stake planner */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            TAO Accumulation Engine — validator staking
          </CardTitle>
          <CardDescription>
            Best subnet validators for honest TAO accumulation, net of validator take, priced at
            what α rewards actually realize. Ranked on <strong>sustainable</strong> APY (lane-level
            equilibrium); the higher <em>instant</em> APY of joining a lightly-staked validator is
            shown as transient upside only.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="w-40">
            <Label htmlFor="tao-stake" className="text-xs text-muted-foreground">
              Stake (TAO)
            </Label>
            <Input
              id="tao-stake"
              type="number"
              min={1}
              value={stakeInput}
              onChange={(e) => setStakeInput(e.target.value)}
              className="mt-1"
            />
          </div>
          {data && (
            <div className="flex flex-1 flex-wrap gap-6 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Root baseline (net)</div>
                <div className="font-semibold">{pct(data.root.netApyPct)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Root yield on stake</div>
                <div className="font-semibold">
                  {data.root.taoPerMonth} TAO/mo
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Subnets beating root</div>
                <div className="font-semibold">
                  {data.summary.beatingRootCount} / {data.summary.opportunities}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Best sustainable</div>
                <div className="font-semibold">
                  {rows[0] ? pct(rows[0].bestApySustainablePct) : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Baseline block</div>
                <div className="font-mono text-xs leading-6">{fmt.format(data.summary.baselineBlock)}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Market route — buy / hold / sell */}
      <MarketRouteCard />

      {/* Recommendations */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4 text-primary" />
            Best subnet validators
          </CardTitle>
          <CardDescription>
            Sustainable = capture-weighted lane yield after stake inflow (the honest number). Band =
            ±25% α price on top of the 24h drift. Exit slippage is computed for YOUR stake.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <div className="py-10 text-center text-sm text-muted-foreground">Ranking validators…</div>}
          {isError && (
            <div className="py-10 text-center text-sm text-red-500">
              Failed to load recommendations: {error instanceof Error ? error.message : "unknown"}
            </div>
          )}
          {data && rows.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No subnet beats the root baseline sustainably right now — root staking is the honest
              pick.
            </div>
          )}
          {data && rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subnet</TableHead>
                  <TableHead>Validator</TableHead>
                  <TableHead className="text-right">Take</TableHead>
                  <TableHead className="text-right">Lane share</TableHead>
                  <TableHead className="text-right">Sustainable APY (band)</TableHead>
                  <TableHead className="text-right">TAO/mo</TableHead>
                  <TableHead className="text-right">Instant upside</TableHead>
                  <TableHead className="text-right">Exit slip</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.flatMap((sub) =>
                  sub.validators.slice(0, 3).map((v, vi) => (
                    <TableRow key={`${sub.netuid}-${v.uid}`}>
                      <TableCell className="whitespace-nowrap">
                        {vi === 0 && (
                          <div className="font-medium">
                            α{sub.netuid} · {sub.name}
                          </div>
                        )}
                        {vi === 0 && (
                          <div className="text-[11px] text-muted-foreground">
                            pool {fmt.format(sub.poolTao)} TAO
                            {sub.alphaChange24hPct != null && (
                              <> · α24h {sub.alphaChange24hPct >= 0 ? "+" : ""}{sub.alphaChange24hPct.toFixed(1)}%</>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        uid{v.uid}
                        <div className="text-[10px] text-muted-foreground">{v.hotkey.slice(0, 10)}…</div>
                      </TableCell>
                      <TableCell className="text-right">{pct(v.take * 100, 1)}</TableCell>
                      <TableCell className="text-right">{pct(v.captureShare * 100, 1)}</TableCell>
                      <TableCell className="text-right">
                        <div className="font-semibold">{pct(v.apySustainablePct)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {pct(v.apyLowPct, 1)} … {pct(v.apyHighPct, 1)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{v.taoPerMonth.toFixed(3)}</TableCell>
                      <TableCell className="text-right text-amber-600">{pct(v.apyInstantPct, 1)}</TableCell>
                      <TableCell className="text-right">{sub.exitSlippagePct != null ? pct(sub.exitSlippagePct, 2) : "—"}</TableCell>
                      <TableCell>{vi === 0 && <RiskChip level={sub.riskLevel} />}</TableCell>
                      <TableCell className="max-w-64 text-[11px] text-muted-foreground">
                        {vi === 0 ? sub.notes.slice(0, 2).join(" · ") || "—" : ""}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Root baseline + honesty notes */}
      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowDownUp className="h-4 w-4 text-primary" />
                Baseline — root staking
              </CardTitle>
              <CardDescription>Every subnet pick above must beat this sustainably.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{pct(data.root.netApyPct)}</span>
                <span className="text-muted-foreground">net APY ({data.root.grossApyPct}% gross − {data.root.takePct}% take)</span>
              </div>
              <div className="mt-2 text-muted-foreground">
                {data.root.taoPerMonth} TAO/mo · {data.root.taoPerYear} TAO/yr on {fmt.format(data.stakeTao)} TAO
              </div>
              <ul className="mt-3 space-y-1 text-[12px] text-muted-foreground">
                {data.root.notes.map((n) => (
                  <li key={n} className="flex gap-1.5">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    {n}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Timer className="h-4 w-4 text-primary" />
                How to read this engine
              </CardTitle>
              <CardDescription>Honesty contract — what each number means.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-[12px] text-muted-foreground">
                {data.summary.notes.map((n) => (
                  <li key={n} className="flex gap-1.5">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    {n}
                  </li>
                ))}
                <li className="flex gap-1.5">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  Baseline captured {new Date(data.summary.baselineFetchedAt).toLocaleString("en-US")} ·
                  TAO ${data.summary.taoPriceUsd} · {data.summary.researchedSubnets} subnets researched.
                </li>
              </ul>
              {data.belowRoot.length > 0 && (
                <div className="mt-3 text-[12px] text-muted-foreground">
                  Researched but not root-beating (context):{" "}
                  {data.belowRoot.slice(0, 8).map((s) => `α${s.netuid} ${s.name}`).join(", ")}
                  {data.belowRoot.length > 8 ? "…" : ""}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
