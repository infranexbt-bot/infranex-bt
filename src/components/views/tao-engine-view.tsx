"use client";

// ---------------------------------------------------------------------------
// TAO ENGINE VIEW — SIMPLIFIED (owner request 2026-11-07).
//
// Two sections only, top picks each, opportunity-page style:
//
//   1) Plain Root Staking  — TAO stays TAO, delegate to a root validator.
//                            Low risk, ~5%/yr market baseline.
//   2) Alpha Staking       — top hot subnet validator picks that beat root,
//                            ranked by the Validator Stake Score engine.
//
// Data: /api/tao-engine/recommend over the frozen chain research baseline
// (scripts/tao-engine-research.ts). Math: lib/infranex/tao-engine.ts +
// validator-score.ts (pure, unit-tested). The old planner/market/scoreboard
// sections live on in the Investor Playbook view.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Flame,
  Info,
  Landmark,
  ShieldCheck,
  Sparkles,
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
import type { ScoredValidatorRow } from "@/lib/infranex/validator-score";

interface RecommendResponse {
  stakeTao: number;
  root: RootBaselineRow;
  beatingRoot: SubnetStakeOpportunity[];
  belowRoot: SubnetStakeOpportunity[];
  topValidators: ScoredValidatorRow[];
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

const VERDICT_STYLE: Record<string, string> = {
  STRONG: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  VIABLE: "bg-sky-500/10 text-sky-600 border-sky-500/30",
  SPECULATIVE: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  AVOID: "bg-red-500/10 text-red-600 border-red-500/30",
};

function RiskChip({ level }: { level: "low" | "medium" | "high" }) {
  const style =
    level === "low"
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
      : level === "medium"
        ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
        : "bg-red-500/10 text-red-600 border-red-500/30";
  const Icon = level === "high" ? AlertTriangle : ShieldCheck;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", style)}>
      <Icon className="h-3 w-3" />
      {level} risk
    </span>
  );
}

export function TaoEngineView() {
  const [stakeInput, setStakeInput] = useState("10");
  const stake = Math.max(Number(stakeInput) > 0 ? Number(stakeInput) : 10, 1);

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

  // Hot alpha picks: the scored validator ranking, best 5, AVOID filtered.
  const alphaPicks = (data?.topValidators ?? []).filter((r) => r.verdict !== "AVOID").slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      {/* Header + stake input */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Flame className="h-4 w-4 text-primary" />
            TAO Staking — simple picks
          </CardTitle>
          <CardDescription>
            Two ways to stake. Pick one, enter your amount, stake with your wallet (btcli / SubWallet).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="w-40">
            <Label htmlFor="tao-stake" className="text-xs text-muted-foreground">
              Your stake (TAO)
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
                <div className="text-xs text-muted-foreground">TAO price</div>
                <div className="font-semibold">${data.summary.taoPriceUsd}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Alpha picks beating root</div>
                <div className="font-semibold">{alphaPicks.length}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Researched subnets</div>
                <div className="font-semibold">{data.summary.researchedSubnets}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 1 · Plain Root Staking */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4 text-primary" />
            1 · Plain Root Staking
            {data && <RiskChip level="low" />}
          </CardTitle>
          <CardDescription>
            Your TAO stays TAO — delegate to a root validator, like a savings account. No token
            conversion, no price games, unstake anytime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>}
          {isError && (
            <div className="py-6 text-center text-sm text-red-500">
              Failed to load: {error instanceof Error ? error.message : "unknown"}
            </div>
          )}
          {data && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Where to stake</TableHead>
                  <TableHead className="text-right">Net APY</TableHead>
                  <TableHead className="text-right">You earn</TableHead>
                  <TableHead className="text-right">Take</TableHead>
                  <TableHead>Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <div className="font-medium">Root network (netuid 0) — any reputable validator</div>
                    <div className="text-[11px] text-muted-foreground">
                      Tip: pick a delegate with a commission ≤9% (check taostats before staking)
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular">{pct(data.root.netApyPct)}</TableCell>
                  <TableCell className="text-right tabular">
                    {data.root.taoPerMonth.toFixed(3)} TAO/mo · {data.root.taoPerYear.toFixed(2)} TAO/yr
                  </TableCell>
                  <TableCell className="text-right tabular">{pct(data.root.takePct, 0)}</TableCell>
                  <TableCell>
                    <RiskChip level="low" />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 2 · Alpha Staking — hot picks */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            2 · Alpha Staking — hot picks
            <RiskChip level="high" />
          </CardTitle>
          <CardDescription>
            Your TAO converts into the subnet&apos;s token. Bigger APYs, but the token price moves —
            only picks that beat plain root staking make this list. Ranked by the same score engine as
            the Opportunities page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <div className="py-6 text-center text-sm text-muted-foreground">Ranking validators…</div>}
          {isError && (
            <div className="py-6 text-center text-sm text-red-500">
              Failed to load: {error instanceof Error ? error.message : "unknown"}
            </div>
          )}
          {data && alphaPicks.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No alpha stake beats plain root staking right now — root is the honest pick.
            </div>
          )}
          {data && alphaPicks.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Subnet · Validator</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead className="text-right">Net APY</TableHead>
                  <TableHead className="text-right">You earn</TableHead>
                  <TableHead className="text-right">Take</TableHead>
                  <TableHead className="text-right">Exit slip</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alphaPicks.map((r, i) => (
                  <TableRow key={`${r.netuid}-${r.validatorUid}`}>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">
                        α{r.netuid} · {r.subnetName}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        uid{r.validatorUid} · pool {fmt.format(r.poolTao)} TAO
                        {r.alphaChange24hPct != null && (
                          <> · α24h {r.alphaChange24hPct >= 0 ? "+" : ""}{r.alphaChange24hPct.toFixed(1)}%</>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", VERDICT_STYLE[r.verdict])}>
                        {r.verdict}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-semibold tabular">{pct(r.sustainableApyPct)}</div>
                      <div className="text-[11px] text-muted-foreground tabular">
                        {pct(r.apyLowPct, 1)} … {pct(r.apyHighPct, 1)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular">{r.taoPerMonth.toFixed(3)} TAO/mo</TableCell>
                    <TableCell className="text-right tabular">{pct(r.takePct, 1)}</TableCell>
                    <TableCell className="text-right tabular">
                      {r.exitSlippagePct != null ? pct(r.exitSlippagePct, 2) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Honesty footer */}
      {data && (
        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Baseline captured {new Date(data.summary.baselineFetchedAt).toLocaleString("en-US")} ·
            block {fmt.format(data.summary.baselineBlock)} · {data.summary.researchedSubnets} subnets
            researched. Figures are estimates, not promises — re-run the research script to refresh.
          </span>
        </div>
      )}
    </div>
  );
}
