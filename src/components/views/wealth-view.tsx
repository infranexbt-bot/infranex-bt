"use client";

// WEALTH-0 — Wealth Command: the "One System. Three Engines." landing view.
// Three engine cards (Invest / Earn / Capture) exactly like the operator's
// blueprint, each wired to live KPIs where the engine is already live, with
// honest "in build" markers where the module ships in a later phase.

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNetwork, mergeOpportunities } from "@/hooks/use-network";
import { useProfitabilityConfig } from "@/hooks/use-profitability";
import { useSubnetOverrides } from "@/hooks/use-subnet-overrides";
import { useStakePortfolio } from "@/hooks/use-stake-portfolio";
import { useIncomeSummary } from "@/hooks/use-wealth";
import { cn } from "@/lib/utils";
import {
  LineChart,
  DollarSign,
  ArrowUpRight,
  CircleCheck,
  CircleDashed,
  ArrowRight,
  Blocks,
} from "lucide-react";
import type { ViewKey } from "@/lib/infranex/types";

const usd = (n: number, digits = 0) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

interface EngineDef {
  id: string;
  num: string;
  tag: string;
  title: string;
  description: string;
  icon: typeof LineChart;
  items: { label: string; live: boolean }[];
  kpi?: React.ReactNode;
  target?: ViewKey;
  cta: string;
}

export function WealthView({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { data: snap } = useNetwork();
  const { data: profConfig } = useProfitabilityConfig();
  const { data: overrides } = useSubnetOverrides();
  const { data: portfolio } = useStakePortfolio(120_000);
  const { data: income } = useIncomeSummary();

  const topOpp = useMemo(() => {
    const opps = mergeOpportunities(snap, profConfig, overrides) ?? [];
    const mining = opps.filter((o) => o.type === "mining" && o.score > 0);
    mining.sort((a, b) => b.score - a.score);
    return mining[0] ?? null;
  }, [snap, profConfig, overrides]);

  const highScoreCount = useMemo(() => {
    const opps = mergeOpportunities(snap, profConfig, overrides) ?? [];
    return opps.filter((o) => o.type === "mining" && o.score >= 70).length;
  }, [snap, profConfig, overrides]);

  const taoPrice = snap?.taoPriceUsd ?? 0;
  const stakedUsd = portfolio?.totals?.stakedUsd ?? 0;
  const freeUsd = (portfolio?.totals?.coldFreeTao ?? 0) * taoPrice;
  const netWealth = stakedUsd + freeUsd;

  const engines: EngineDef[] = [
    {
      id: "invest",
      num: "ENGINE 01",
      tag: "INVEST",
      title: "THE AI INVESTING ENGINE",
      description: "Identify high-conviction investments positioned to benefit from the growth of AI.",
      icon: LineChart,
      items: [
        { label: "AI investment opportunities", live: false },
        { label: "Crypto x AI", live: false },
        { label: "Portfolio allocation", live: false },
        { label: "Asymmetric opportunities", live: false },
      ],
      cta: "Phase 2 · in build",
    },
    {
      id: "earn",
      num: "ENGINE 02",
      tag: "EARN",
      title: "THE CASHFLOW ENGINE",
      description: "Build recurring cashflow using digital assets, DeFi and emerging financial systems.",
      icon: DollarSign,
      items: [
        { label: "Stablecoin yield", live: true },
        { label: "DeFi liquidity", live: true },
        { label: "TAO subnet staking", live: true },
        { label: "Monthly income strategies", live: true },
      ],
      kpi: (
        <div className="flex gap-5">
          <div>
            <p className="text-eyebrow text-muted-foreground">Monthly cashflow</p>
            <p className="mono text-xl font-bold tabular text-success">
              {income ? usd(income.totalMonthlyUsd, 2) : "—"}
            </p>
          </div>
          <div>
            <p className="text-eyebrow text-muted-foreground">Blended yield APY</p>
            <p className="mono text-xl font-bold tabular">
              {income && income.yield.blendedApy > 0 ? `${income.yield.blendedApy.toFixed(1)}%` : "—"}
            </p>
          </div>
        </div>
      ),
      target: "earn",
      cta: "Open Earn engine",
    },
    {
      id: "capture",
      num: "ENGINE 03",
      tag: "CAPTURE",
      title: "THE TACTICAL ENGINE",
      description: "Capitalize on shorter-term opportunities with systematic, repeatable strategies.",
      icon: ArrowUpRight,
      items: [
        { label: "AlphaChaser Bot", live: false },
        { label: "AI & subnet opportunities", live: true },
        { label: "Perp trade setups", live: false },
        { label: "Tactical entries & exits", live: false },
      ],
      kpi: (
        <div className="flex gap-5">
          <div>
            <p className="text-eyebrow text-muted-foreground">Best subnet now</p>
            <p className="mono text-xl font-bold tabular">
              {topOpp ? `SN${topOpp.netuid} · ${topOpp.score.toFixed(0)}` : "—"}
            </p>
          </div>
          <div>
            <p className="text-eyebrow text-muted-foreground">Est. APY</p>
            <p className="mono text-xl font-bold tabular text-success">
              {topOpp ? `${topOpp.estimatedApy.toFixed(1)}%` : "—"}
            </p>
          </div>
        </div>
      ),
      target: "opportunities",
      cta: "Open Capture engine",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Net wealth strip */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-6 p-5">
          <div>
            <p className="text-eyebrow text-muted-foreground">Net wealth on-platform</p>
            <p className="mono mt-1 text-3xl font-bold tabular">
              {portfolio ? usd(netWealth, 2) : <Skeleton className="h-9 w-44" />}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {usd(stakedUsd, 2)} staked · {usd(freeUsd, 2)} free TAO · mining equity tracked in My Miners
            </p>
          </div>
          <div className="flex gap-8">
            <div>
              <p className="text-eyebrow text-muted-foreground">TAO price</p>
              <p className="mono text-lg font-semibold tabular">{taoPrice ? `$${taoPrice.toFixed(2)}` : "—"}</p>
            </div>
            <div>
              <p className="text-eyebrow text-muted-foreground">Chain</p>
              <p className="mono text-lg font-semibold tabular">
                {snap?.blockNumber ? `#${snap.blockNumber.toLocaleString()}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-eyebrow text-muted-foreground">Subnets</p>
              <p className="mono text-lg font-semibold tabular">{snap?.totalSubnets ?? "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Three engines */}
      <div>
        <div className="mb-6 text-center">
          <h2 className="text-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            ONE SYSTEM. <span className="text-gradient">THREE ENGINES.</span>
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            A 3-engine system designed to build income and long-term wealth in the AI economy.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {engines.map((e) => {
            const Icon = e.icon;
            const clickable = !!e.target;
            const liveCount = e.items.filter((i) => i.live).length;
            return (
              <Card
                key={e.id}
                className={cn(
                  "group relative flex flex-col overflow-hidden transition-all duration-200",
                  clickable && "hover:border-primary/40 hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.15),0_8px_40px_-12px_hsl(var(--primary)/0.25)]"
                )}
              >
                <CardContent className="flex flex-1 flex-col gap-4 p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-eyebrow text-primary">
                      {e.num} <span className="text-muted-foreground">· {e.tag}</span>
                    </p>
                    <h3 className="mt-1 text-base font-bold tracking-tight">{e.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{e.description}</p>
                  </div>

                  {e.kpi && (
                    <div className="rounded-lg border border-border/60 bg-card/60 px-4 py-3">{e.kpi}</div>
                  )}

                  <ul className="space-y-2">
                    {e.items.map((item) => (
                      <li key={item.label} className="flex items-center gap-2 text-sm">
                        {item.live ? (
                          <CircleCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                        ) : (
                          <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                        )}
                        <span className={item.live ? "text-foreground" : "text-muted-foreground"}>
                          {item.label}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto flex items-center justify-between pt-2">
                    <Badge variant="outline" className="mono text-[10px]">
                      <Blocks className="mr-1 h-3 w-3" />
                      {liveCount}/{e.items.length} live
                    </Badge>
                    {clickable ? (
                      <Button size="sm" variant="ghost" className="gap-1 px-2 text-xs" onClick={() => e.target && onNavigate(e.target)}>
                        {e.cta} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">{e.cta}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Cross-engine loop note */}
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">The loop:</span> Capture finds the
          opportunity (subnet mining, yield pools) → Earn compounds it into recurring cashflow →
          profits feed the Invest engine&rsquo;s long-term allocations. Mining rewards land in the
          Income dashboard automatically; yield positions feed the same monthly number.
        </CardContent>
      </Card>
    </div>
  );
}
