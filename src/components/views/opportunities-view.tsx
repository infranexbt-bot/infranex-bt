"use client";

import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OpportunityTable } from "@/components/tables/opportunity-table";
import { OpportunityCard } from "@/components/cards/opportunity-detail";
import { ProfitabilitySettingsDialog } from "@/components/cards/profitability-settings";
import { useNetwork, mergeOpportunities } from "@/lib/infranex/use-network";
import { useProfitabilityConfig } from "@/lib/infranex/use-profitability";
import { useSubnetOverrides } from "@/lib/infranex/use-subnet-overrides";
import {
  computeRentEarnMap,
  RENT_EARN_BAND_STYLE,
} from "@/lib/infranex/rent-earn";
import { cn, opportunityBand } from "@/lib/utils";
import { TrendingUp, LayoutGrid, List, Cpu, Settings2, CloudCog } from "lucide-react";
import type { Opportunity } from "@/lib/infranex/types";

interface OpportunitiesViewProps {
  onSelectOpportunity: (o: Opportunity) => void;
  onStartMining?: (o: Opportunity) => void;
}

const GPU_FILTER_KEY = "infranex-gpu-filter";

// "What can my rig run?" — subnets whose required VRAM fits the selected GPU.
// CPU-only shows subnets whose work type needs no GPU at all.
// "Rented rig picks" = RENT-EARN GREAT/OK — a rented GPU/CPU (Akash/Vast-class)
// can legally run the work AND a new seat has a real chance to earn.
const GPU_FILTERS: { value: string; label: string; maxVram: number | null }[] = [
  { value: "any", label: "Any hardware", maxVram: null },
  { value: "rented", label: "Rented rig picks", maxVram: null },
  { value: "cpu", label: "CPU-only work", maxVram: 0 },
  { value: "8", label: "8 GB+ (entry)", maxVram: 8 },
  { value: "16", label: "16 GB+ (4060 Ti)", maxVram: 16 },
  { value: "24", label: "24 GB+ (4090)", maxVram: 24 },
  { value: "48", label: "48 GB+ (A6000)", maxVram: 48 },
  { value: "80", label: "80 GB+ (A100/H100)", maxVram: 80 },
  { value: "141", label: "141 GB+ (H200)", maxVram: 141 },
];

export function OpportunitiesView({ onSelectOpportunity, onStartMining }: OpportunitiesViewProps) {
  const [layout, setLayout] = useState<"table" | "grid">("table");
  const [filter, setFilter] = useState<"all" | "RUN" | "WATCH" | "AVOID">("all");
  const [gpuFilter, setGpuFilter] = useState("any");
  const [gpuDirty, setGpuDirty] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { data: snap } = useNetwork();
  const { data: profConfig } = useProfitabilityConfig();
  const { data: overrides } = useSubnetOverrides();
  const opportunities = useMemo(
    () => mergeOpportunities(snap, profConfig, overrides),
    [snap, profConfig, overrides]
  );
  // RENT-EARN verdicts — one pass over all rows (Rent earn column + filter).
  const rentMap = useMemo(
    () => computeRentEarnMap(opportunities),
    [opportunities]
  );
  const rentedPicks = useMemo(
    () =>
      opportunities
        .map((o) => ({ o, rent: rentMap.get(o.id)! }))
        .filter((r) => r.rent.band === "GREAT" || r.rent.band === "OK")
        .sort((a, b) => b.rent.score - a.rent.score),
    [opportunities, rentMap]
  );
  const target = profConfig?.minNetProfitTargetUsd ?? 300;
  const passCount = opportunities.filter((o) => o.meetsMinimum !== false).length;

  // Restore the miner's hardware profile across visits. Deferred past the
  // hydration pass so SSR markup stays deterministic.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(GPU_FILTER_KEY); } catch { /* ignore */ }
    if (!saved) return;
    const t = setTimeout(() => setGpuFilter(saved!), 0);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!gpuDirty) return;
    try { localStorage.setItem(GPU_FILTER_KEY, gpuFilter); } catch { /* ignore */ }
  }, [gpuFilter, gpuDirty]);

  const applyGpuFilter = (v: string) => {
    setGpuFilter(v);
    setGpuDirty(true);
  };

  const filtered = useMemo(() => {
    let r = opportunities;
    const gf = GPU_FILTERS.find((g) => g.value === gpuFilter);
    if (gf) {
      if (gf.value === "rented")
        r = r.filter(
          (o) => rentMap.get(o.id)?.band === "GREAT" || rentMap.get(o.id)?.band === "OK"
        );
      else if (gf.maxVram === 0) r = r.filter((o) => o.minVramGb <= 0);
      else if (gf.maxVram != null) r = r.filter((o) => o.minVramGb <= gf.maxVram!);
    }
    if (filter !== "all") r = r.filter((o) => opportunityBand(o).label === filter);
    return r;
  }, [filter, gpuFilter, opportunities, rentMap]);

  const tabs: { key: typeof filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: filtered.length },
    { key: "RUN", label: "RUN", count: filtered.filter((o) => opportunityBand(o).label === "RUN").length },
    { key: "WATCH", label: "WATCH", count: filtered.filter((o) => opportunityBand(o).label === "WATCH").length },
    { key: "AVOID", label: "AVOID", count: filtered.filter((o) => opportunityBand(o).label === "AVOID").length },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-eyebrow text-muted-foreground">
            Section · 02 · <span className="text-primary">Step 1 — choose what to mine</span>
          </p>
          <h1 className="animate-rise text-display text-3xl font-bold tracking-tight md:text-4xl">
            Opportunities
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {snap?.subnets?.length
              ? `All ${snap.subnets.length} Finney subnets scored with the Miner's Ledger`
              : "Finney subnets scored with the Miner's Ledger"}
            {" "}
            — per-<span className="text-foreground/80">earning</span>-miner
            revenue minus GPU + infra cost, seat safety (slot pressure, reward
            concentration, burn, immunity), alpha economics (24h trend,
            liquidity, slippage) and earning reality.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Profitability Engine: revenue − GPU − storage − infra − other = net.
            Minimum entry rule: net &lt;{" "}
            <span className="font-semibold text-foreground/80">
              ${target.toLocaleString()}/mo
            </span>{" "}
            → AVOID ·{" "}
            <span className={cn("font-semibold", passCount > 0 ? "text-success" : "text-destructive")}>
              {passCount} pass
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-card/40 p-1">
          <Button
            variant={layout === "table" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setLayout("table")}
            className="gap-1.5"
          >
            <List className="h-3.5 w-3.5" />
            Table
          </Button>
          <Button
            variant={layout === "grid" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setLayout("grid")}
            className="gap-1.5"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Grid
          </Button>
        </div>
      </header>

      {/* DATA-AUDIT-1 — stale/empty honesty notice (M1): no silent fake data */}
      {snap && !snap.isLive && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-4 py-2.5 text-xs text-amber-600">
          Chain data is stale or unavailable right now — the ranking below is
          computed from the last snapshot ({snap.fetchedAt ? new Date(snap.fetchedAt).toLocaleString() : "unknown time"}).
          {opportunities.length === 0 && " No subnets are scored until a chain scan succeeds."}
        </div>
      )}
      {snap?.isLive && opportunities.length === 0 && (
        <div className="rounded-lg border border-border/60 bg-card/40 px-4 py-2.5 text-xs text-muted-foreground">
          No subnets to score yet — the first chain scan is still running.
        </div>
      )}

      {/* RENT-EARN summary — where a RENTED GPU/CPU actually has a chance */}
      {rentedPicks.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-card/40 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground/90">
            <CloudCog className="h-3.5 w-3.5 text-primary" />
            Rented-rig earn picks
            <span className="font-normal text-muted-foreground">
              — rentable work × seat reality × new-entrant EV (Rent earn column)
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {rentedPicks.slice(0, 8).map(({ o, rent }) => {
              const st = RENT_EARN_BAND_STYLE[rent.band];
              return (
                <span
                  key={o.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/40 px-2.5 py-1 text-xs"
                >
                  <span className="font-medium">SN{o.netuid} {o.subnetName}</span>
                  <Badge variant="outline" className={cn("text-[10px]", st.bg, st.color)}>
                    {rent.band} {rent.score}
                  </Badge>
                  {rent.expectedNetMonthlyUsd != null && (
                    <span className="text-[10px] text-muted-foreground">
                      EV ~${rent.expectedNetMonthlyUsd.toLocaleString()}/mo
                    </span>
                  )}
                  {rent.whaleMean && (
                    <span className="text-[10px] text-warning" title="Few UIDs earn — $/mo is a whale-mean, not a forecast">⚠</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === t.key
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/60 bg-card/30 text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            <Badge variant="outline" className="mono text-[10px]">
              {t.count}
            </Badge>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={gpuFilter} onValueChange={applyGpuFilter}>
            <SelectTrigger className="h-8 w-[190px] rounded-full border-border/60 bg-card/30 text-xs">
              <SelectValue placeholder="My GPU" />
            </SelectTrigger>
            <SelectContent>
              {GPU_FILTERS.map((g) => (
                <SelectItem key={g.value} value={g.value} className="text-xs">
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            title="Profitability settings — minimum net profit target, cost lines"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ProfitabilitySettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        passCount={passCount}
        totalCount={opportunities.length}
      />

      <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-display flex items-center gap-2 text-xl">
            <TrendingUp className="h-4 w-4 text-primary" />
            Ranked opportunities
            <span className="text-xs font-normal text-muted-foreground">
              ranked by net ROI, seat safety & alpha hold value
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {layout === "table" ? (
            <OpportunityTable
              opportunities={filtered}
              onSelect={onSelectOpportunity}
              onStartMining={onStartMining}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((o) => (
                <OpportunityCard key={o.id} opportunity={o} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
