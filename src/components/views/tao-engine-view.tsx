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

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowDownUp,
  Banknote,
  ChevronDown,
  Info,
  Landmark,
  Minus,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
  Wallet,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import type { ScoredValidatorRow } from "@/lib/infranex/validator-score";
import { BuyHoldTrack, type MarketResponse } from "./buy-hold-track";
import type { TaoMarketAction } from "@/lib/infranex/tao-market";
import type { ThreeRoutePlan, PlanRisk } from "@/lib/infranex/tao-engine-plan";

interface RecommendResponse {
  stakeTao: number;
  root: RootBaselineRow;
  beatingRoot: SubnetStakeOpportunity[];
  belowRoot: SubnetStakeOpportunity[];
  /** FLAT scored cross-subnet validator ranking — the headline list. */
  topValidators: ScoredValidatorRow[];
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

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const pct = (n: number, d = 2) => `${n.toFixed(d)}%`;
const RISKS: { key: PlanRisk; label: string }[] = [
  { key: "safe", label: "Safe" },
  { key: "balanced", label: "Balanced" },
  { key: "aggressive", label: "Aggressive" },
];
const HORIZONS = [30, 90, 365];

const VERDICT_STYLE: Record<string, string> = {
  STRONG: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  VIABLE: "bg-sky-500/10 text-sky-600 border-sky-500/30",
  SPECULATIVE: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  AVOID: "bg-red-500/10 text-red-600 border-red-500/30",
};
const GRADE_STYLE: Record<string, string> = {
  A: "bg-emerald-500/15 text-emerald-600 border-emerald-500/40",
  B: "bg-lime-500/15 text-lime-700 border-lime-500/40",
  C: "bg-amber-500/15 text-amber-600 border-amber-500/40",
  D: "bg-red-500/15 text-red-600 border-red-500/40",
};
const scoreBarCls = (grade: string) =>
  grade === "A" ? "bg-emerald-500" : grade === "B" ? "bg-lime-500" : grade === "C" ? "bg-amber-500" : "bg-red-500";

function ScoreBadge({ score, grade }: { score: number; grade: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", scoreBarCls(grade))} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </div>
      <span className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-bold tabular", GRADE_STYLE[grade] ?? GRADE_STYLE.D)}>
        {score.toFixed(0)}
      </span>
      <span className="text-[10px] font-semibold text-muted-foreground">{grade}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BEST VALIDATORS TO STAKE — the flat scored ranking (opportunity-engine
// pattern): verdict tier → Validator Stake Score → sustainable APY. This is
// the headline answer to "which validators should I stake for good returns?"
// ---------------------------------------------------------------------------
function TopValidatorsCard({ data }: { data: RecommendResponse }) {
  const [showAll, setShowAll] = useState(false);
  // Headline: best 8 non-AVOID. The FULL SCORE BOARD below exposes every
  // scored validator row (incl. AVOID, score-capped) — same engine output,
  // same rank order, nothing re-ranked or hidden.
  const rows = data.topValidators.filter((r) => r.verdict !== "AVOID").slice(0, 8);
  const all = data.topValidators;
  const avoidCount = all.filter((r) => r.verdict === "AVOID").length;
  const boardSubnets = new Set(all.map((r) => r.netuid)).size;
  const verdictCounts = all.reduce<Record<string, number>>((m, r) => {
    m[r.verdict] = (m[r.verdict] ?? 0) + 1;
    return m;
  }, {});
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Best validators to stake — scored 0–100
        </CardTitle>
        <CardDescription>
          Validator Stake Score = yield edge vs root (30%) · reward quality (20%) · exit liquidity (15%) ·
          take (10%) · decentralization (10%) · price stability (10%) · dilution (5%). Missing data scores a
          neutral 35 and is flagged; verdict AVOID caps the score at 25. Same auditable inputs as the APY math.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Nothing scores above AVOID right now — root staking is the honest pick.
          </div>
        )}
        {rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Subnet · Validator</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead className="text-right">Take</TableHead>
                <TableHead className="text-right">Sustainable APY (band)</TableHead>
                <TableHead className="text-right">TAO/mo</TableHead>
                <TableHead className="text-right">Exit slip</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.netuid}-${r.validatorUid}`}>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">α{r.netuid} · {r.subnetName}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      uid{r.validatorUid} · {r.validatorHotkey.slice(0, 10)}… · lane {r.captureSharePct.toFixed(1)}%
                    </div>
                  </TableCell>
                  <TableCell className="text-right"><ScoreBadge score={r.score.score} grade={r.score.grade} /></TableCell>
                  <TableCell>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", VERDICT_STYLE[r.verdict])}>
                      {r.verdict}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular">{pct(r.takePct, 1)}</TableCell>
                  <TableCell className="text-right">
                    <div className="font-semibold tabular">{pct(r.sustainableApyPct)}</div>
                    <div className="text-[11px] text-muted-foreground tabular">
                      {pct(r.apyLowPct, 1)} … {pct(r.apyHighPct, 1)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular">{r.taoPerMonth.toFixed(3)}</TableCell>
                  <TableCell className="text-right tabular">{r.exitSlippagePct != null ? pct(r.exitSlippagePct, 2) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {avoidCount > 0 && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            {avoidCount} researched pick{avoidCount === 1 ? "" : "s"} scored AVOID (root-losing or α crashing), score
            capped at 25 — excluded from the headline, visible in the full score board below.
          </div>
        )}

        {/* FULL SCORE BOARD — every scored validator across every researched
            subnet, including AVOID rows. Answers "what about the OTHER subnet
            validators?" with the same auditable math, no display cap. */}
        {all.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-muted/50"
            >
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Trophy className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  Full score board — all {all.length} scored validators across {boardSubnets} researched subnets
                </span>
                <span className="font-normal text-muted-foreground">
                  (STRONG {verdictCounts.STRONG ?? 0} · VIABLE {verdictCounts.VIABLE ?? 0} · SPECULATIVE{" "}
                  {verdictCounts.SPECULATIVE ?? 0} · AVOID {verdictCounts.AVOID ?? 0})
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  showAll && "rotate-180"
                )}
              />
            </button>
            {showAll && (
              <div className="mt-3 max-h-[480px] overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Subnet · Validator</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead>Verdict</TableHead>
                      <TableHead className="text-right">Take</TableHead>
                      <TableHead className="text-right">Lane cap</TableHead>
                      <TableHead className="text-right">Validator stake</TableHead>
                      <TableHead className="text-right">Sustainable APY</TableHead>
                      <TableHead className="text-right">Exit slip</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {all.map((r, i) => (
                      <TableRow
                        key={`board-${r.netuid}-${r.validatorUid}`}
                        className={cn(r.verdict === "AVOID" && "opacity-60")}
                      >
                        <TableCell className="font-mono text-[11px] text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium">α{r.netuid} · {r.subnetName}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            uid{r.validatorUid} · {r.validatorHotkey.slice(0, 10)}… · lane {r.captureSharePct.toFixed(1)}%
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <ScoreBadge score={r.score.score} grade={r.score.grade} />
                          {r.score.cappedByVerdict && (
                            <div className="text-[10px] text-muted-foreground">capped · AVOID</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                              VERDICT_STYLE[r.verdict]
                            )}
                          >
                            {r.verdict}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular">{pct(r.takePct, 1)}</TableCell>
                        <TableCell className="text-right tabular">
                          {r.concentrationPct != null ? pct(r.concentrationPct, 1) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {fmt.format(Math.round(r.stakeAlpha))}α
                        </TableCell>
                        <TableCell className="text-right">
                          <div className={cn("font-semibold tabular", !r.beatsRoot && "text-muted-foreground")}>
                            {pct(r.sustainableApyPct)}
                          </div>
                          <div className="text-[10px] text-muted-foreground tabular">
                            {r.beatsRoot ? `vs root ${pct(r.rootBaselineApyPct, 1)}` : "below root"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {r.exitSlippagePct != null ? pct(r.exitSlippagePct, 2) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Every validator of every researched subnet is scored — the {rows.length} above make the headline; the
              rest rank here by the same math. Validators on subnets outside the research baseline have no
              dividend/pool data, so they are not scored — nothing is fabricated.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// MARKET SECTION — Track 2 (BUY/HOLD: signal, entries, DCA ladder, sizing).
// Shared card extracted from the Investor Playbook (merged into this view).
// ---------------------------------------------------------------------------
function MarketSection() {
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
    <div>
      {isLoading && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">Reading the tape…</CardContent>
        </Card>
      )}
      {isError && (
        <Card>
          <CardContent className="py-6 text-center text-sm text-red-500">
            Market signal unavailable: {error instanceof Error ? error.message : "unknown"}
          </CardContent>
        </Card>
      )}
      {data && <BuyHoldTrack market={data} />}
    </div>
  );
}


function ScenarioTable({
  scenarios,
  allocTao,
}: {
  scenarios: ThreeRoutePlan["hold"]["scenarios"];
  allocTao: number;
}) {
  if (allocTao <= 0 || scenarios.length === 0) {
    return <div className="text-[12px] text-muted-foreground">No allocation on this route.</div>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="h-7 text-[11px]">Price {scenarios[0].priceChgPct >= 0 ? "" : ""}move</TableHead>
          <TableHead className="h-7 text-right text-[11px]">End TAO</TableHead>
          <TableHead className="h-7 text-right text-[11px]">End USD</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {scenarios.map((s) => (
          <TableRow key={s.priceChgPct}>
            <TableCell className="h-7 py-1 text-[11px]">
              {s.priceChgPct >= 0 ? "+" : ""}{s.priceChgPct.toFixed(1)}%
            </TableCell>
            <TableCell className="h-7 py-1 text-right font-mono text-[11px]">{s.endTao.toFixed(2)}</TableCell>
            <TableCell className="h-7 py-1 text-right font-mono text-[11px]">
              {s.endUsd != null ? `$${fmt.format(s.endUsd)}` : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StrategyPlannerCard({
  plan,
  risk,
  onRiskChange,
  horizon,
  onHorizonChange,
  marketAction,
  marketScore,
  spotUsd,
}: {
  plan: ThreeRoutePlan;
  risk: PlanRisk;
  onRiskChange: (r: PlanRisk) => void;
  horizon: number;
  onHorizonChange: (h: number) => void;
  marketAction: string | null;
  marketScore: number | null;
  spotUsd: number | null;
}) {
  const a = plan.allocation;
  const segments = [
    { key: "stake", label: "STAKE", tao: a.stakeTao, pct: a.stakePct, cls: "bg-emerald-500/80", icon: Landmark, route: plan.stake },
    { key: "hold", label: "HOLD", tao: a.holdTao, pct: a.holdPct, cls: "bg-sky-500/80", icon: Wallet, route: plan.hold },
    { key: "cash", label: "CASH", tao: a.cashTao, pct: a.cashPct, cls: "bg-amber-500/80", icon: Banknote, route: plan.cash },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Strategy Planner — stake / hold / sell
        </CardTitle>
        <CardDescription>
          One answer for your {fmt.format(plan.stakeTao)} TAO: how much goes to validator staking, how much
          stays a plain TAO hold, how much stays cash. Rules are deterministic and shown in the reasons below —
          the price grid is a scenario, not a forecast.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1 rounded-lg border p-1">
            {RISKS.map((r) => (
              <button
                key={r.key}
                onClick={() => onRiskChange(r.key)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  risk === r.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border p-1">
            {HORIZONS.map((h) => (
              <button
                key={h}
                onClick={() => onHorizonChange(h)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  horizon === h ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                {h === 365 ? "1y" : `${h}d`}
              </button>
            ))}
          </div>
          {marketAction && (
            <div className="text-xs text-muted-foreground">
              market: <span className="font-semibold text-foreground">{marketAction}</span>
              {marketScore != null && ` (score ${marketScore > 0 ? "+" : ""}${marketScore})`}
            </div>
          )}
        </div>

        {/* Allocation bar */}
        <div className="flex h-9 w-full overflow-hidden rounded-lg border">
          {segments.map((s) => (
            <div
              key={s.key}
              className={cn("flex items-center justify-center text-[11px] font-semibold text-white", s.cls)}
              style={{ width: `${s.pct}%` }}
              title={`${s.label}: ${s.tao} TAO (${s.pct.toFixed(0)}%)`}
            >
              {s.pct >= 8 ? `${s.pct.toFixed(0)}%` : ""}
            </div>
          ))}
        </div>

        {/* Route cards */}
        <div className="grid gap-3 md:grid-cols-3">
          {segments.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.key} className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="h-4 w-4 text-primary" />
                  {s.label}
                  <span className="ml-auto font-mono text-sm">{s.tao > 0 ? `${fmt.format(s.tao)} TAO` : "—"}</span>
                </div>
                {s.key === "stake" && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    target: {plan.stakeTarget === "subnet" ? "subnet validators (VIABLE list)" : "root staking (no subnet beats root)"}
                  </div>
                )}
                <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                  {s.route.notes.slice(0, 2).map((n) => (
                    <li key={n} className="flex gap-1">
                      <Info className="mt-0.5 h-3 w-3 shrink-0" />{n}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 border-t pt-2">
                  <ScenarioTable scenarios={s.route.scenarios} allocTao={s.tao} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Auditable reasons */}
        <ul className="grid gap-1 text-[12px] text-muted-foreground md:grid-cols-2">
          {plan.reasons.map((r) => (
            <li key={r} className="flex gap-1.5">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              {r}
            </li>
          ))}
        </ul>
        <div className="text-[11px] text-muted-foreground">
          Spot {spotUsd != null ? `$${spotUsd.toFixed(2)}` : "—"} · horizon {plan.horizonDays}d · risk "{plan.risk}" ·
          stake bucket earns the {plan.stakeTarget === "subnet" ? "subnet" : "root"} yield band; both staked and held
          slices ride the same price grid so routes stay comparable.
        </div>
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
  const [risk, setRisk] = useState<PlanRisk>("balanced");
  const [horizon, setHorizon] = useState(90);
  const stake = Math.max(Number(stakeInput) > 0 ? Number(stakeInput) : 100, 1);

  const { data, isLoading, isError, error } = useQuery<RecommendResponse>({
    queryKey: ["tao-engine-recommend", stake, risk, horizon],
    queryFn: async () => {
      const res = await fetch(
        `/api/tao-engine/recommend?stake=${stake}&limit=12&risk=${risk}&horizon=${horizon}`
      );
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

      {/* Strategy planner — stake / hold / sell */}
      {data?.plan && (
        <StrategyPlannerCard
          plan={data.plan}
          risk={risk}
          onRiskChange={setRisk}
          horizon={horizon}
          onHorizonChange={setHorizon}
          marketAction={data.marketAction}
          marketScore={data.marketScore}
          spotUsd={data.summary.taoPriceUsd}
        />
      )}

      {/* Best validators — scored headline */}
      {data && <TopValidatorsCard data={data} />}

      {/* Market route — buy / hold / sell (Track 2, merged playbook) */}
      <MarketSection />

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
