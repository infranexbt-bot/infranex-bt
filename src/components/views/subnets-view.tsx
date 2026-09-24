"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubnetCard } from "@/components/cards/subnet-card";
import { SubnetEditDialog } from "@/components/subnets/subnet-edit-dialog";
import { SubnetRequirementsDialog } from "@/components/subnets/subnet-requirements-dialog";
import { useNetwork, mergeSubnets, mergeOpportunities } from "@/hooks/use-network";
import { useSubnetOverrides, useSyncAllSubnets } from "@/hooks/use-subnet-overrides";
import { useProfitabilityConfig } from "@/hooks/use-profitability";
import { buildProfitRank } from "@/lib/infranex/profit-rank";
import { ProfitRankPanel } from "@/components/subnets/profit-rank-panel";
import {
  resolveCompat,
  matchCompatFilter,
  COMPAT_TIER_META,
  type CompatFilter,
  type SubnetCompat,
} from "@/lib/infranex/compat";
import { CompatLegend } from "@/components/subnets/compat-badge";
import { useToast } from "@/hooks/use-toast";
import { Search, RefreshCw, Network, Info, Github, CheckCircle2, AlertTriangle, ServerCrash } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Subnet } from "@/lib/infranex/types";

export function SubnetsView() {
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState<"all" | "active">("all");
  const [compatFilter, setCompatFilter] = useState<CompatFilter>("all");
  const [editSubnet, setEditSubnet] = useState<Subnet | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [reqSubnet, setReqSubnet] = useState<Subnet | null>(null);
  const [reqOpen, setReqOpen] = useState(false);
  const { data: snap, isFetching, refetch } = useNetwork();
  const { data: overrides } = useSubnetOverrides();
  const { data: profConfig } = useProfitabilityConfig();
  const syncMut = useSyncAllSubnets();
  const { toast } = useToast();
  const didAutoSync = useRef(false);

  const subnets = mergeSubnets(snap, overrides);

  // COMPAT-LAYER — resolve each subnet's GPU hosting compatibility
  // (live GitHub scrape > full-audit seed > structural caveats).
  const compatByNetuid = useMemo(() => {
    const map = new Map<number, SubnetCompat>();
    for (const s of subnets) {
      const ov = overrides?.get(s.netuid);
      map.set(
        s.netuid,
        resolveCompat(s.netuid, ov?.hosting, s.githubUrl ?? null)
      );
    }
    return map;
  }, [subnets, overrides]);

  const compatCounts = useMemo(() => {
    const c = { bareMetal: 0, tee: 0, cloudOk: 0, cpu: 0, caveats: 0 };
    for (const v of compatByNetuid.values()) {
      if (v.tier === "bare-metal-only") c.bareMetal++;
      else if (v.tier === "tee-required") c.tee++;
      else if (v.containerCloudsOk) c.cloudOk++;
      if (v.tier === "cpu-only") c.cpu++;
      if (COMPAT_TIER_META[v.tier].caveat) c.caveats++;
    }
    return c;
  }, [compatByNetuid]);

  // DATA-AUDIT-1 — card scores/ranks come from the LIVE Miner's Ledger run
  // over the current snapshot (the old static fabricated scores are gone).
  // With no snapshot yet there is no honest score to badge. Runs with the
  // user's Profitability config so the P&L matches the Opportunities view.
  const opportunities = useMemo(
    () => mergeOpportunities(snap, profConfig, overrides),
    [snap, profConfig, overrides]
  );

  const scoreByNetuid = useMemo(() => {
    const map = new Map<number, { score: number; rank: number }>();
    for (const o of opportunities) {
      map.set(o.netuid, { score: o.score, rank: o.rank });
    }
    return map;
  }, [opportunities]);

  // PROFIT-RANK — per-subnet emission-vs-rental-cost ranking, computed from
  // the same live P&L rows (per-earning-miner revenue − hosting-aware rig
  // rent − opex) plus the compat tiers for cost-basis flags.
  const profitRows = useMemo(
    () => buildProfitRank(opportunities, subnets, compatByNetuid),
    [opportunities, subnets, compatByNetuid]
  );

  const filtered = useMemo(() => {
    let r = subnets;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          String(s.netuid).includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (activeOnly === "active") r = r.filter((s) => s.status === "active");
    // COMPAT-LAYER — GPU hosting compatibility filter chips
    if (compatFilter !== "all") {
      r = r.filter((s) => {
        const c = compatByNetuid.get(s.netuid);
        return c ? matchCompatFilter(compatFilter, c) : false;
      });
    }
    // DATA-AUDIT-1: the "registration open" filter is gone — the chain scan
    // has no registration-open signal, so the old fabricated flags were
    // removed instead of being presented as data.
    return r;
  }, [search, activeOnly, compatFilter, subnets, compatByNetuid]);

  const handleEdit = (s: Subnet) => {
    setEditSubnet(s);
    setEditOpen(true);
  };

  const handleViewRequirements = (s: Subnet) => {
    setReqSubnet(s);
    setReqOpen(true);
  };

  const handleSyncAll = async (force: boolean = false) => {
    try {
      const result = await syncMut.mutateAsync(force);
      toast({
        title: "GitHub sync complete",
        description: `${result.scraped} scraped, ${result.skipped} skipped, ${result.errors} errors`,
      });
    } catch (e) {
      toast({
        title: "Sync failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  // Auto-sync on first load if no overrides exist
  useEffect(() => {
    if (didAutoSync.current) return;
    if (overrides && overrides.size === 0 && !syncMut.isPending) {
      didAutoSync.current = true;
      // Defer to microtask to avoid setState-in-effect
      void Promise.resolve().then(() => handleSyncAll(false));
    }
  }, [overrides, syncMut.isPending]);

  const overrideCount = overrides?.size ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-eyebrow text-muted-foreground">Section · 03</p>
          <h1 className="animate-rise text-display text-3xl font-bold tracking-tight md:text-4xl">
            Subnets
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {snap?.totalSubnets
              ? `${snap.totalSubnets} subnets on the live Finney chain — scores and ranks are computed live from chain data.`
              : "All Bittensor subnets on the Finney chain — waiting for the first live chain scan."}
            {overrideCount > 0 && ` · ${overrideCount} with user overrides`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => handleSyncAll(true)}
            disabled={syncMut.isPending}
          >
            <Github className={cn("h-3.5 w-3.5", syncMut.isPending && "animate-spin")} />
            {syncMut.isPending ? "Syncing…" : "Sync from GitHub"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            {isFetching ? "Syncing…" : "Refresh chain"}
          </Button>
        </div>
      </header>

      {/* Data source legend + sync status */}
      <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Data sources:</span>
          <Badge variant="outline" className="border-success/30 text-[10px] text-success">
            <span className="mr-1 h-1.5 w-1.5 rounded-full bg-success" />
            Live (chain)
          </Badge>
          <Badge variant="outline" className="border-warning/30 text-[10px] text-warning">
            <span className="mr-1 h-1.5 w-1.5 rounded-full bg-warning" />
            User override
          </Badge>
          <Badge variant="outline" className="border-primary/30 text-[10px] text-primary">
            <Github className="mr-1 h-3 w-3" />
            GitHub (scraped repos)
          </Badge>
          {syncMut.isPending && (
            <Badge variant="outline" className="text-[10px] text-primary">
              <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
              Scraping GitHub…
            </Badge>
          )}
          {overrideCount > 0 && !syncMut.isPending && (
            <Badge variant="outline" className="border-success/30 text-[10px] text-success">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {overrideCount} synced
            </Badge>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">
            Click the ⚙ icon on any card to edit or scrape individually
          </span>
        </CardContent>
      </Card>

      {/* COMPAT-LAYER — tier color legend */}
      <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
        <CardContent className="py-2.5">
          <CompatLegend />
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, category, netuid or tag…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                aria-label="Search subnets"
              />
            </div>
            <div className="flex gap-2">
              {(["all", "active"] as const).map((k) => (
                <Button
                  key={k}
                  variant={activeOnly === k ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveOnly(k)}
                  className="capitalize"
                >
                  {k}
                </Button>
              ))}
            </div>
          </div>
          {/* COMPAT-LAYER — GPU hosting compatibility filter chips */}
          <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
            <ServerCrash className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
            <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              GPU compat
            </span>
            {(
              [
                ["all", `All (${subnets.length})`],
                ["bare-metal-only", `Bare metal only (${compatCounts.bareMetal})`],
                ["tee-required", `TEE required (${compatCounts.tee})`],
                ["cloud-ok", `RunPod/Vast OK (${compatCounts.cloudOk})`],
                ["cpu", `CPU only (${compatCounts.cpu})`],
                ["caveats", `Caveats (${compatCounts.caveats})`],
              ] as Array<[CompatFilter, string]>
            ).map(([k, label]) => (
              <Button
                key={k}
                variant={compatFilter === k ? "default" : "outline"}
                size="sm"
                className="h-7 px-2.5 text-[11px]"
                onClick={() => setCompatFilter(k)}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* PROFIT-RANK — emission vs. rental cost, ranked by net */}
      <ProfitRankPanel
        rows={profitRows}
        taoPriceUsd={snap?.taoPriceUsd ?? 0}
        onViewRequirements={(netuid) => {
          const s = subnets.find((x) => x.netuid === netuid);
          if (s) handleViewRequirements(s);
        }}
      />

      {filtered.length === 0 ? (
        <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <Network className="h-8 w-8" />
            <p className="text-sm">No subnets match your filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s) => {
            const sr = scoreByNetuid.get(s.netuid);
            return (
              <SubnetCard
                key={s.netuid}
                subnet={s}
                score={sr?.score}
                rank={sr?.rank}
                compat={compatByNetuid.get(s.netuid)}
                onEdit={handleEdit}
                onViewRequirements={handleViewRequirements}
              />
            );
          })}
        </div>
      )}

      <SubnetEditDialog
        subnet={editSubnet}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <SubnetRequirementsDialog
        subnet={reqSubnet}
        open={reqOpen}
        onOpenChange={setReqOpen}
      />
    </div>
  );
}
