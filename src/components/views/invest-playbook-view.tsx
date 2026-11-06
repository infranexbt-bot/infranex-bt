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
  Landmark,
  PiggyBank,
  ShieldCheck,
  Sparkles,
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
import { BuyHoldTrack, type MarketResponse } from "./buy-hold-track";
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

const RISK_STYLE: Record<SubnetStakeOpportunity["riskLevel"], string> = {
  low: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  high: "bg-red-500/10 text-red-600 border-red-500/30",
};

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
