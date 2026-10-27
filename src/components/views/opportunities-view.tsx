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
import { WinOddsPanel } from "@/components/cards/win-odds-panel";
import { ProfitabilitySettingsDialog } from "@/components/cards/profitability-settings";
import { CostBasisToggle } from "@/components/cards/cost-basis-toggle";
import { useNetwork, mergeOpportunities } from "@/hooks/use-network";
import { useProfitabilityConfig } from "@/hooks/use-profitability";
import { useSubnetOverrides } from "@/hooks/use-subnet-overrides";
import {
  costBasisFromConfig,
  rentEarnLabels,
} from "@/lib/infranex/rent-earn";
import { computeMinePickMap } from "@/lib/infranex/mine-pick";
import { computeVerdictMapFor } from "@/lib/infranex/verdict";
import { cn } from "@/lib/utils";
import { TrendingUp, LayoutGrid, List, Cpu, Settings2 } from "lucide-react";
import type { Opportunity } from "@/lib/infranex/types";

interface OpportunitiesViewProps {
  onSelectOpportunity: (o: Opportunity) => void;
  onStartMining?: (o: Opportunity) => void;
}

const GPU_FILTER_KEY = "infranex-gpu-filter";

// "What can my rig run?" — subnets whose required VRAM fits the selected GPU.
// CPU-only shows subnets whose work type needs no GPU at all.
// "Rented/Owned rig picks" = RENT-EARN GREAT/OK — a rented GPU/CPU
// (Akash/Vast-class) or your OWN rig (owned electricity basis) can legally run
// the work AND a new seat has a real chance to earn. Label follows the active
// cost basis via rentEarnLabels().
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
  // VERDICT-UNIFY-1 — ONE ranking (conviction), ONE vocabulary (RUN / WATCH /
  // AVOID). The old page scored rows with the Ledger band here and conviction
  // on the Dashboard — two answers to the same question. Now the conviction
  // engine (rent-earn × diligence × confidence, gated) is the ONLY verdict.
  // OWNED-RIG-1 — the basis carries the rig profile (VRAM + TEE) so the
  // verdict answers "can MY GPU run it & earn" on the owned basis.
  const ownedBasis = profConfig?.hardwareMode === "owned";
  const pickMap = useMemo(
    () => computeMinePickMap(opportunities, costBasisFromConfig(profConfig)),
    [opportunities, profConfig]
  );
  // VERDICT-UNIFY-2 — the verdict is DERIVED from the evidence engine (the
  // same 7-factor score the table ranks by + the SCALE/TEST/WATCHLIST/AVOID
  // classification), not from the legacy conviction bands. The legacy
  // conviction (pickMap) stays only as the GPU-filter's seat-quality lens.
  const verdictMap = useMemo(
    () => computeVerdictMapFor(opportunities as never, profConfig),
    [opportunities, profConfig]
  );
  const target = profConfig?.minNetProfitTargetUsd ?? 300;
  const passCount = opportunities.filter((o) => o.meetsMinimum !== false).length;
  // Mode-aware lens labels — must never say "Rented" while the cost basis is Owned.
  const L = rentEarnLabels(profConfig?.hardwareMode);

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
          (o) => pickMap.get(o.id)?.rent.band === "GREAT" || pickMap.get(o.id)?.rent.band === "OK"
        );
      else if (gf.maxVram === 0) r = r.filter((o) => o.minVramGb <= 0);
      else if (gf.maxVram != null) r = r.filter((o) => o.minVramGb <= gf.maxVram!);
    }
    if (filter !== "all") r = r.filter((o) => verdictMap.get(o.id ?? "") === filter);
    return r;
  }, [filter, gpuFilter, opportunities, pickMap, verdictMap]);

  const tabs: { key: typeof filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: filtered.length },
    { key: "RUN", label: "RUN", count: filtered.filter((o) => verdictMap.get(o.id ?? "") === "RUN").length },
    { key: "WATCH", label: "WATCH", count: filtered.filter((o) => verdictMap.get(o.id ?? "") === "WATCH").length },
    { key: "AVOID", label: "AVOID", count: filtered.filter((o) => verdictMap.get(o.id ?? "") === "AVOID").length },
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
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            ONE ranked list, ONE core number. The{" "}
            <span className="font-medium text-primary">Opportunity Score</span>{" "}
            (/100 = net contribution 30 · miner performance 20 · hardware fit 20
            · entry risk 15 · data quality 15) ranks the table — hard gates
            (hardware mismatch, unverified payout, negative net) always sink a
            row, no matter how high the raw score. Click a score for its
            evidence.{" "}
            <span className="font-medium text-success">RUN</span> = evidence-backed
            (positive net, verified payout, score ≥ 50) ·{" "}
            <span className="font-medium text-warning">WATCH</span> = interesting,
            evidence incomplete ·{" "}
            <span className="font-medium text-destructive">AVOID</span> = negative
            economics, hardware-gated or below your minimum.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Minimum entry rule: net &lt;{" "}
            <span className="font-semibold text-foreground/80">
              ${target.toLocaleString()}/mo
            </span>{" "}
            → forced AVOID ·{" "}
            <span className={cn("font-semibold", passCount > 0 ? "text-success" : "text-destructive")}>
              {passCount} pass
            </span>
            {profConfig?.hardwareMode === "owned"
              ? " · owned-rig electricity basis"
              : " · market-rent basis"}
            {" · "}
            <span className="font-semibold text-foreground/80">
              TAO goal: {profConfig?.targetTaoPerMonth ?? 1} TAO/mo
            </span>{" "}
            (the <span className="font-medium text-primary">TAO / mo</span> column ranks by TAO actually banked at
            realizable α→TAO prices)
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

      {/* VERDICT-UNIFY-1 — the earnPicks chip strip is gone: rent-earn is
          already 40% of conviction, so it was a second mini-ranking. The GPU
          filter ("Rented/Owned rig picks") still covers "what can MY rig run". */}

      {/* WIN-ODDS-1 — the pre-money question: where can a NEW seat earn,
          graded by reward concentration. Sits above the ranked table because
          it answers "should I even enter" before "which RUN is best". */}
      <WinOddsPanel
        rows={opportunities}
        pickFor={(o) => {
          const p = pickMap.get(o.id ?? "");
            return {
              verdict: verdictMap.get(o.id ?? "") ?? p?.verdict,
              netMonthly: p?.rent.expectedNetMonthlyUsd ?? null,
            };
        }}
      />

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
          <CostBasisToggle />
          <span className="h-5 w-px bg-border/60" aria-hidden />
          <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={gpuFilter} onValueChange={applyGpuFilter}>
            <SelectTrigger className="h-8 w-[190px] rounded-full border-border/60 bg-card/30 text-xs">
              <SelectValue placeholder="My GPU" />
            </SelectTrigger>
            <SelectContent>
              {GPU_FILTERS.map((g) => (
                <SelectItem key={g.value} value={g.value} className="text-xs">
                  {g.value === "rented" ? L.gpuFilterLabel : g.label}
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
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Ranked by the Opportunity Score (gated rows sink). Click a row for
            the full breakdown; the ⋯ menu starts the deploy.
          </p>
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
