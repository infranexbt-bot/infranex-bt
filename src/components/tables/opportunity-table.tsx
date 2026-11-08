"use client";

import { useState, useMemo } from "react";
import { cn, formatCurrency, formatPercent, getStatusColor } from "@/lib/utils";
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, MoreHorizontal, Zap } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/utils";
import { assessSeatChance } from "@/lib/infranex/miner-score";
import {
  computeMinePickMap,
  VERDICT_STYLE,
} from "@/lib/infranex/mine-pick";
import { computeVerdictMapFor } from "@/lib/infranex/verdict";
import {
  computeRentEarnMap,
  costBasisFromConfig,
  RENT_EARN_BAND_STYLE,
  rentEarnLabels,
} from "@/lib/infranex/rent-earn";
import { SeatChanceBadge } from "@/components/subnets/seat-chance-badge";
import { RegisterOddsInline } from "@/components/cards/register-odds";
import { HostingChips } from "@/components/cards/hosting-requirements";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OpportunityScoreCell } from "@/components/opportunities/opportunity-score-cell";
import {
  computeOpportunityScoreMap,
} from "@/lib/infranex/subnet-opportunity";
import {
  computeEntryDifficultyMap,
  DIFFICULTY_META,
} from "@/lib/infranex/entry-difficulty";
import {
  classifyOpportunity,
  ACTION_META,
  type OpportunityClassification,
} from "@/lib/infranex/opportunity-class";
import {
  computeNetEarningsMap,
  CONFIDENCE_BAND_STYLE,
} from "@/lib/infranex/net-earnings";
import {
  computeTaoAccumulationMap,
  type TaoAccumulation,
} from "@/lib/infranex/tao-accumulation";
import { useOddsTrends } from "@/hooks/use-odds";
import { useNetwork } from "@/hooks/use-network";
import { useProfitabilityConfig } from "@/hooks/use-profitability";
import type { RunVerdict } from "@/lib/infranex/opportunity-engine";
import { Swords, AlertTriangle, Ban, ShieldCheck, Coins, Target, TrendingUp } from "lucide-react";
import type { Opportunity } from "@/lib/infranex/types";

interface OpportunityTableProps {
  opportunities: Opportunity[];
  onSelect?: (o: Opportunity) => void;
  onStartMining?: (o: Opportunity) => void;
  className?: string;
  compact?: boolean;
  /** OPPORTUNITY-ENGINE-3 — fused verdict map (row id → RUN/WATCH/AVOID)
   *  from the new-entrant engine, shared with the view's tabs. When absent
   *  the table falls back to its own evidence-derived verdicts. */
  fusedVerdictMap?: Map<string, RunVerdict>;
}

type SortKey =
  | "rank"
  | "opportunity"
  | "conviction"
  | "subnetName"
  | "score"
  | "rentEarn"
  | "estimatedApy"
  | "netMonthlyUsd"
  | "netTaoPerMonth"
  | "grossMonthlyUsd"
  | "requiredStake"
  | "utilization"
  | "riskLevel"
  | "confidence"
  | "minVramGb"
  | "alphaChange24h"
  | "liquidityTao"
  | "burnCostTao"
  | "demandScore"
  // OPPORTUNITY-ENGINE-2 — spec'd sorts: conservative net TAO, lowest GPU
  // cost, easiest entry, lowest competition.
  | "netTaoConservative"
  | "gpuCost"
  | "ease"
  | "competition";

function SortIcon({
  k,
  sortKey,
  dir,
}: {
  k: SortKey;
  sortKey: SortKey;
  dir: "asc" | "desc";
}) {
  if (sortKey !== k)
    return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/60" />;
  return dir === "asc" ? (
    <ChevronUp className="h-3.5 w-3.5" />
  ) : (
    <ChevronDown className="h-3.5 w-3.5" />
  );
}

function SortableTh({
  k,
  children,
  align = "left",
  sortKey,
  dir,
  onSort,
  rowSpan,
}: {
  k: SortKey;
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  sortKey: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  rowSpan?: number;
}) {
  return (
    <TableHead
      rowSpan={rowSpan}
      className={align === "right" ? "text-right" : align === "center" ? "text-center" : ""}
    >
      <button
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex items-center gap-1 select-none hover:text-foreground transition-colors",
          align === "right" && "flex-row-reverse"
        )}
      >
        {children}
        <SortIcon k={k} sortKey={sortKey} dir={dir} />
      </button>
    </TableHead>
  );
}

export function OpportunityTable({
  opportunities,
  onSelect,
  onStartMining,
  className,
  compact = false,
  fusedVerdictMap,
}: OpportunityTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("opportunity");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  // OPPORTUNITY-ENGINE-2 — difficulty + action filters (spec §7).
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  // Winner-stability trends for ALL subnets in ONE request — TanStack Query
  // dedupes every table/card mount onto a single cache entry.
  const { data: oddsTrends } = useOddsTrends();
  // RENT-EARN — one pass over all rows: hosting gate + seat reality + EV.
  // Lens labels follow the active cost basis — "Rent earn" under rented,
  // "Earn picks" under owned (same engine, same numbers basis as the ledger).
  const { data: profConfig } = useProfitabilityConfig();
  const L = rentEarnLabels(profConfig?.hardwareMode);
  // OWNED-MODE: the Net-Monthly tooltip must say what the GPU line actually
  // charges — electricity on the owned basis, market rent on the rented one
  // (the NUMBER is already mode-aware via the P&L; keep the WORD honest too).
  const ownedBasis = profConfig?.hardwareMode === "owned";
  // The verdicts themselves are mode-aware too — the gate asks "can a rented
  // container run this?" vs "can YOUR OWNED rig run this?" and the blocked
  // copy never shows rent-source language on the owned basis.
  const rentMap = useMemo(
    () => computeRentEarnMap(opportunities, costBasisFromConfig(profConfig)),
    [opportunities, profConfig]
  );

  // VERDICT-UNIFY-1 — conviction (rent-earn × diligence × confidence, gated)
  // is THE ranking and RUN/WATCH/AVOID the ONLY verdict shown. The Ledger
  // score stays available as a sortable column and inside the detail dialog.
  // OWNED-RIG-1 — the basis carries the rig profile (VRAM + TEE capability)
  // so owned-basis verdicts answer "can MY GPU run it & earn".
  const pickMap = useMemo(
    () => computeMinePickMap(opportunities, costBasisFromConfig(profConfig)),
    [opportunities, profConfig]
  );

  // VERDICT-UNIFY-2 — the verdict chip derives from the evidence engine (the
  // 7-factor score + SCALE/TEST/WATCHLIST/AVOID classification — the same
  // inputs this table already displays), NOT from the legacy conviction
  // bands. Single shared builder so every surface gives the same answer.
  const verdictMap = useMemo(
    () => computeVerdictMapFor(opportunities as never, profConfig),
    [opportunities, profConfig]
  );

  // OPPORTUNITY-SCORE-1 — the core decision score (net 30 / miners 20 /
  // hardware 20 / entry 15 / data 15), hard-gated. Computed in the same
  // single pass pattern as rentMap/pickMap; the score column shows the
  // effective (post-gate) score and the dialog carries the full evidence.
  const scoreMap = useMemo(
    () =>
      computeOpportunityScoreMap(opportunities as never[], {
        hardwareMode: ownedBasis ? "owned" : "rented",
        minNetTargetUsd: profConfig?.minNetProfitTargetUsd,
        weights: profConfig?.opportunityWeights,
      }),
    [opportunities, ownedBasis, profConfig?.minNetProfitTargetUsd, profConfig?.opportunityWeights]
  );

  // OPPORTUNITY-ENGINE-2 — entry difficulty (EASY/MODERATE/DIFFICULT/UNKNOWN)
  // single-pass, keyed by row id like every other map. The action
  // classification follows netEarningsMap below (it consumes estimates).
  const diffMap = useMemo(
    () => computeEntryDifficultyMap(opportunities as never[]),
    [opportunities]
  );

  // NET-EARNINGS-1 — conservative/base/optimistic estimate + confidence for
  // every row, in the same single pass. The column ranks by the BASE month
  // ("expected net earnings, not emissions"); the conservative month is
  // shown beside it so the funding floor is never hidden.
  const netEarningsMap = useMemo(
    () =>
      computeNetEarningsMap(opportunities as never[], {
        minNetTargetUsd: profConfig?.minNetProfitTargetUsd,
        hardwareMode: profConfig?.hardwareMode,
      }),
    [opportunities, profConfig?.minNetProfitTargetUsd, profConfig?.hardwareMode]
  );

  // TAO-ACCUMULATION-1 — the user's actual goal: accumulate TAO (~1/mo).
  // Re-denominates the net-earnings estimate into realizable TAO per month
  // (the ledger top line already carries the chain's realizability haircut)
  // and measures every row against the TAO goal from settings.
  const { data: taoSnap } = useNetwork();
  const taoMap = useMemo(
    () =>
      computeTaoAccumulationMap(
        opportunities as never[],
        netEarningsMap,
        {
          taoPriceUsd: taoSnap?.taoPriceUsd,
          targetTaoPerMonth: profConfig?.targetTaoPerMonth,
          assumedTaoPriceUsd: profConfig?.assumedTaoPriceUsd,
        }
      ),
    [opportunities, netEarningsMap, taoSnap?.taoPriceUsd, profConfig?.targetTaoPerMonth, profConfig?.assumedTaoPriceUsd]
  );

  // OPPORTUNITY-ENGINE-2 — the four-way action classification
  // (TEST/SCALE/WATCHLIST/AVOID) — needs score + estimates + difficulty.
  const classMap = useMemo(
    () =>
      new Map<string, OpportunityClassification>(
        opportunities
          .map((o) => {
            const id = o.id;
            try {
              return [
                id,
                classifyOpportunity(o as never, {
                  score: scoreMap.get(id),
                  est: netEarningsMap.get(id) ?? null,
                  difficulty: diffMap.get(id),
                }),
              ] as const;
            } catch {
              return null;
            }
          })
          .filter((x): x is readonly [string, OpportunityClassification] => x != null)
      ),
    [opportunities, scoreMap, netEarningsMap, diffMap]
  );

  const filtered = useMemo(() => {
    let r = opportunities;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (o) =>
          o.subnetName.toLowerCase().includes(q) ||
          o.subnetSymbol.toLowerCase().includes(q) ||
          String(o.netuid).includes(q) ||
          o.category.toLowerCase().includes(q)
      );
    }
    if (difficultyFilter !== "all") {
      r = r.filter((o) => diffMap.get(o.id)?.difficulty === difficultyFilter);
    }
    if (classFilter !== "all") {
      r = r.filter((o) => classMap.get(o.id)?.action === classFilter);
    }
    const sorted = [...r].sort((a, b) => {
      let av: unknown;
      let bv: unknown;
      if (sortKey === "conviction") {
        av = pickMap.get(a.id)?.conviction ?? -1;
        bv = pickMap.get(b.id)?.conviction ?? -1;
      } else if (sortKey === "rentEarn") {
        av = rentMap.get(a.id)?.score ?? -1;
        bv = rentMap.get(b.id)?.score ?? -1;
      } else if (sortKey === "netTaoPerMonth") {
        av = taoMap.get(a.id)?.netTaoPerMonth ?? -999;
        bv = taoMap.get(b.id)?.netTaoPerMonth ?? -999;
      } else if (sortKey === "netTaoConservative") {
        av = taoMap.get(a.id)?.conservativeNetTaoPerMonth ?? -999;
        bv = taoMap.get(b.id)?.conservativeNetTaoPerMonth ?? -999;
      } else if (sortKey === "gpuCost") {
        av = a.gpuCostMonthlyUsd ?? Number.POSITIVE_INFINITY;
        bv = b.gpuCostMonthlyUsd ?? Number.POSITIVE_INFINITY;
      } else if (sortKey === "ease") {
        // UNKNOWN rows (no ease score) always sink, in both directions.
        av = diffMap.get(a.id)?.easeScore ?? -1;
        bv = diffMap.get(b.id)?.easeScore ?? -1;
      } else if (sortKey === "competition") {
        // "Lowest competition" — rewards broadly shared first (rewardedRatio
        // desc), concentration as tiebreak (top-10 share asc). Miner COUNT is
        // deliberately not the metric: a quiet subnet can be quiet because
        // nobody earns there.
        const ra = (a as never as { rewardedRatio?: number | null }).rewardedRatio ?? -1;
        const rb = (b as never as { rewardedRatio?: number | null }).rewardedRatio ?? -1;
        if (ra !== rb) {
          av = ra;
          bv = rb;
        } else {
          av = (a as never as { top10IncentiveShare?: number | null }).top10IncentiveShare ?? 2;
          bv = (b as never as { top10IncentiveShare?: number | null }).top10IncentiveShare ?? 2;
        }
      } else if (sortKey === "opportunity") {
        // Gated rows ALWAYS sink below ungated ones, regardless of score —
        // the code-level enforcement of "a high score never overrides a
        // failed mandatory requirement". Within each group: effective score.
        const sa = scoreMap.get(a.id);
        const sb = scoreMap.get(b.id);
        const ga = sa?.gated ? 1 : 0;
        const gb = sb?.gated ? 1 : 0;
        if (ga !== gb) return dir === "asc" ? gb - ga : ga - gb;
        av = sa?.effectiveScore ?? -1;
        bv = sb?.effectiveScore ?? -1;
        if (av === bv) return 0;
        return dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
      } else {
        av = a[sortKey];
        bv = b[sortKey];
      }
      if (typeof av === "number" && typeof bv === "number") {
        return dir === "asc" ? av - bv : bv - av;
      }
      return dir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return sorted;
  }, [opportunities, sortKey, dir, search, rentMap, pickMap, scoreMap, taoMap, diffMap, difficultyFilter, classFilter, classMap]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setDir(k === "rank" ? "asc" : "desc");
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search subnets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 rounded-lg border-border/60 bg-card/50 pl-9 focus:border-primary/40"
              aria-label="Search opportunities"
            />
          </div>
          {/* OPPORTUNITY-ENGINE-2 — difficulty + action filters. */}
          <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
            <SelectTrigger className="h-9 w-[10.5rem] rounded-lg border-border/60 bg-card/50 text-xs" aria-label="Filter by entry difficulty">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All difficulties</SelectItem>
              <SelectItem value="EASY" className="text-xs">{DIFFICULTY_META.EASY.label} to earn</SelectItem>
              <SelectItem value="MODERATE" className="text-xs">{DIFFICULTY_META.MODERATE.label} to earn</SelectItem>
              <SelectItem value="DIFFICULT" className="text-xs">{DIFFICULTY_META.DIFFICULT.label} to earn</SelectItem>
              <SelectItem value="UNKNOWN" className="text-xs">{DIFFICULTY_META.UNKNOWN.label}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="h-9 w-[11rem] rounded-lg border-border/60 bg-card/50 text-xs" aria-label="Filter by recommended action">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All actions</SelectItem>
              <SelectItem value="SCALE" className="text-xs">{ACTION_META.SCALE.label} — evidence-backed</SelectItem>
              <SelectItem value="TEST" className="text-xs">{ACTION_META.TEST.label} — validate small</SelectItem>
              <SelectItem value="WATCHLIST" className="text-xs">{ACTION_META.WATCHLIST.label} — research first</SelectItem>
              <SelectItem value="AVOID" className="text-xs">{ACTION_META.AVOID.label} — do not deploy</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="tabular text-foreground/80">{filtered.length}</span> of{" "}
          <span className="tabular">{opportunities.length}</span> opportunities
        </p>
      </div>

      <div className="table-container">
        <Table>
          <TableHeader>
            {/* RANK-BASIS-2 — group header row: the three ranking axes label
                their exact columns (and scroll with them), so the basis of
                the ranking is aligned at a glance instead of floating in the
                card header. # / Subnet / Action span both header rows. */}
            {!compact && (
              <TableRow className="table-header hover:bg-transparent border-b-0">
                <SortableTh k="rank" sortKey={sortKey} dir={dir} onSort={handleSort} rowSpan={2}>
                  #
                </SortableTh>
                <SortableTh k="subnetName" sortKey={sortKey} dir={dir} onSort={handleSort} rowSpan={2}>
                  Subnet
                </SortableTh>
                <TableHead
                  colSpan={3}
                  className="h-7 text-center"
                  title="Decision — Opportunity Score (7 configurable factors: net TAO 30% · miner competitiveness 20% · reward sustainability 15% · validator acceptance 10% · GPU cost efficiency 10% · operational reliability 10% · economic & protocol risk 5%, hard-gated), Conviction (rent-earn × diligence × confidence), and the recommended Action (TEST/SCALE/WATCHLIST/AVOID) with entry difficulty. Click a score for its evidence."
                >
                  <span className="inline-flex items-center gap-1">
                    <Target className="h-3 w-3 text-primary" />
                    Decision
                  </span>
                </TableHead>
                <TableHead
                  className="h-7 text-center"
                  title="Seat safety axis — slot pressure, reward concentration, burn cost, immunity. Detail lives in the seat badge under Score."
                >
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3 text-primary" />
                    Seat safety
                  </span>
                </TableHead>
                <TableHead
                  colSpan={3}
                  className="h-7 text-center"
                  title="NET EARNINGS axis — conservative / base / optimistic monthly net after the full cost stack (electricity, cooling, registration, maintenance, hardware recovery on the owned basis), each with a data-confidence level. Net Monthly sorts by the BASE month. TAO/mo re-denominates the same math into the user's actual goal: TAO accumulated per month at realizable α→TAO prices."
                >
                  <span className="inline-flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-primary" />
                    Net earnings
                  </span>
                </TableHead>
                <TableHead
                  colSpan={2}
                  className="h-7 text-center"
                  title="Alpha hold value axis — price + 24h trend (Alpha) and exit liquidity (Liq.) for converting mined alpha."
                >
                  <span className="inline-flex items-center gap-1">
                    <Coins className="h-3 w-3 text-primary" />
                    Alpha hold value
                  </span>
                </TableHead>
                <TableHead
                  colSpan={2}
                  className="h-7 text-center"
                  title={L.lensesTooltip}
                >
                  Mining lenses
                </TableHead>
                <TableHead
                  colSpan={2}
                  className="h-7 text-center"
                  title="Earning reality — demand backing the rewards (Demand) and share of slots that earned last epoch (Util.)."
                >
                  Earning reality
                </TableHead>
                <TableHead
                  colSpan={2}
                  className="h-7 text-center"
                  title="Hardware & risk — minimum VRAM + recommended GPU (GPU Req.) and the subnet's risk band (Risk)."
                >
                  Hardware &amp; risk
                </TableHead>
                <TableHead rowSpan={2} className="text-right">
                  Action
                </TableHead>
              </TableRow>
            )}
            <TableRow className="table-header hover:bg-transparent">
              {compact && (
                <>
                  <SortableTh k="rank" sortKey={sortKey} dir={dir} onSort={handleSort}>
                    #
                  </SortableTh>
                  <SortableTh k="subnetName" sortKey={sortKey} dir={dir} onSort={handleSort}>
                    Subnet
                  </SortableTh>
                </>
              )}
              {!compact && (
                <SortableTh
                  k="opportunity"
                  sortKey={sortKey}
                  dir={dir}
                  onSort={handleSort}
                >
                  <span title="OPPORTUNITY SCORE — the core ranking. 7 configurable factors: net TAO potential 30% · miner competitiveness 20% · reward sustainability 15% · validator acceptance 10% · GPU cost efficiency 10% · operational reliability 10% · economic & protocol risk 5%. Hard gates (hardware mismatch, unverified payout, negative net) cap the score and sink the row — they are never overridden by a high number. Click for the full evidence.">
                    Score
                  </span>
                </SortableTh>
              )}
              {!compact && (
                <SortableTh
                  k="conviction"
                  sortKey={sortKey}
                  dir={dir}
                  onSort={handleSort}
                >
                  <span title={`CONVICTION — the seat-quality lens (rent-earn × diligence × confidence). ${L.convictionStatTooltip} It ORDERS the list but no longer decides the verdict: RUN/WATCH/AVOID come from the new-entrant Opportunity Engine (entry score 70% × seat safety 30% — the same verdict as the Subnets page); a negative P&L forces AVOID, and the Scale/Test/Watchlist/Avoid chip in Action carries the deployment evidence.`}>
                    Conviction
                  </span>
                </SortableTh>
              )}
              {!compact && (
                <SortableTh
                  k="ease"
                  sortKey={sortKey}
                  dir={dir}
                  onSort={handleSort}
                >
                  <span title="ACTION & DIFFICULTY — the recommended action (SCALE = evidence-backed · TEST = validate small · WATCHLIST = research first · AVOID = do not deploy) over the entry difficulty (how hard a NEW miner finds earning here — measured from rewarded seats, concentration, slots, ramp and hardware, never from miner count alone). Sorting ranks the easiest entry first; filter by either with the toolbar.">
                    Action
                  </span>
                </SortableTh>
              )}
              <SortableTh
                k="netMonthlyUsd"
                align="right"
                sortKey={sortKey}
                dir={dir}
                onSort={handleSort}
              >
                <span title="NET EARNINGS — ranks by the BASE month (expected net after the full cost stack). Shown: base bold, worst/best month beside it, and the data-confidence level. Click a row for the factor-by-factor estimate.">
                  Net / mo
                </span>
              </SortableTh>
              {!compact && (
                <SortableTh
                  k="netTaoPerMonth"
                  align="right"
                  sortKey={sortKey}
                  dir={dir}
                  onSort={handleSort}
                >
                  <span title="TAO ACCUMULATION — the user's actual goal: net TAO banked per month (base month, α converted at realizable pool prices) measured against the TAO goal from Profitability settings. Sorting by this ranks by TAO accumulated, not emission.">
                    TAO / mo
                  </span>
                </SortableTh>
              )}
              {!compact && (
                <SortableTh
                  k="estimatedApy"
                  align="right"
                  sortKey={sortKey}
                  dir={dir}
                  onSort={handleSort}
                >
                  Est. APY
                </SortableTh>
              )}
              {!compact && (
                <SortableTh
                  k="alphaChange24h"
                  align="right"
                  sortKey={sortKey}
                  dir={dir}
                  onSort={handleSort}
                >
                  Alpha (24h)
                </SortableTh>
              )}
              {!compact && (
                <SortableTh
                  k="liquidityTao"
                  align="right"
                  sortKey={sortKey}
                  dir={dir}
                  onSort={handleSort}
                >
                  Liq.
                </SortableTh>
              )}
              {!compact && (
                <SortableTh
                  k="rentEarn"
                  sortKey={sortKey}
                  dir={dir}
                  onSort={handleSort}
                >
                  <span
                    title={L.columnTooltip}
                  >
                    {L.columnLabel}
                  </span>
                </SortableTh>
              )}
              {!compact && (
                <TableHead
                  className="whitespace-nowrap"
                  title="If you register today — first-month earn odds · bond ramp to full weight · winner stability (paid seats across recent scans)"
                >
                  Your odds
                </TableHead>
              )}
              {!compact && (
                <SortableTh
                  k="demandScore"
                  align="right"
                  sortKey={sortKey}
                  dir={dir}
                  onSort={handleSort}
                >
                  <span
                    title="DEMAND REALITY — does real demand back this subnet's rewards, or do emissions alone pay miners? 40% staking inflow vs payout · 25% α price trend (24h) · 20% pool depth vs reward flow · 15% seat productivity. Click a row for the full breakdown."
                  >
                    Demand
                  </span>
                </SortableTh>
              )}
              {!compact && (
                <SortableTh
                  k="utilization"
                  align="right"
                  sortKey={sortKey}
                  dir={dir}
                  onSort={handleSort}
                >
                  Util.
                </SortableTh>
              )}
              {!compact && (
                <SortableTh
                  k="minVramGb"
                  align="right"
                  sortKey={sortKey}
                  dir={dir}
                  onSort={handleSort}
                >
                  GPU Req.
                </SortableTh>
              )}
              {!compact && (
                <SortableTh k="riskLevel" sortKey={sortKey} dir={dir} onSort={handleSort}>
                  Risk
                </SortableTh>
              )}
              {compact && <TableHead className="text-right">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={compact ? 5 : 17}
                  className="py-12 text-center text-muted-foreground"
                >
                  No opportunities match your search.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((o, rowIdx) => {
                const pick = pickMap.get(o.id);
                const est = netEarningsMap.get(o.id);
                const tao: TaoAccumulation | undefined = taoMap.get(o.id);
                // VERDICT-UNIFY-2 + OPPORTUNITY-ENGINE-3 — the chip prefers
                // the fused verdict (new-entrant engine, negative-P&L
                // demotion) passed from the view; falls back to the evidence
                // verdict, then the conviction verdict, for rows the engine
                // can't see (both agree nothing positive is claimed).
                const uVerdict =
                  fusedVerdictMap?.get(o.id) ??
                  verdictMap.get(o.id) ??
                  pick?.verdict ??
                  "WATCH";
                const vs = VERDICT_STYLE[uVerdict];
                const risk = getStatusColor(o.riskLevel);
                const prof = o.profitability;
                return (
                  <TableRow
                    key={o.id}
                    onClick={() => onSelect?.(o)}
                    className={cn(onSelect && "cursor-pointer")}
                  >
                    <TableCell className="mono tabular text-muted-foreground">
                      {String(rowIdx + 1).padStart(2, "0")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">
                              {o.subnetName}
                            </span>
                            <Badge variant="outline" className="mono text-[10px]">
                              {o.subnetSymbol}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            NetUID {o.netuid} · {o.workType ?? o.category}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    {!compact && (
                      <TableCell>
                        <OpportunityScoreCell score={scoreMap.get(o.id)} />
                      </TableCell>
                    )}
                    {!compact && (
                      <TableCell>
                        <div className="flex flex-col items-start gap-0.5">
                          <div className="flex items-center gap-2">
                            <span
                              className="tabular font-semibold"
                              title={
                                pick
                                  ? `Conviction ${pick.conviction}/100 = ${L.convictionFormula}. Ledger score ${o.score.toFixed(1)}. ${pick.reasons.join(". ") || "No gates hit."}`
                                  : "Conviction pending"
                              }
                            >
                              {pick ? pick.conviction : "—"}
                            </span>
                            {vs && (
                              <Badge
                                variant="outline"
                                className={cn("text-[10px] font-semibold", vs.bg, vs.color)}
                              >
                                {vs.label}
                              </Badge>
                            )}
                          </div>
                          {o.totalSlots != null && (() => {
                            const seat = assessSeatChance({
                              minersCount: o.totalSlots != null && o.freeSlots != null ? o.totalSlots - o.freeSlots : null,
                              maxUids: o.totalSlots,
                              freeSlots: o.freeSlots,
                              burnCostTao: o.burnCostTao ?? null,
                              immunityBlocks: o.immunityBlocks ?? null,
                              rewardedRatio: o.rewardedRatio ?? null,
                            });
                            return seat.verdict !== "unknown" ? (
                              <SeatChanceBadge seat={seat} />
                            ) : null;
                          })()}
                        </div>
                      </TableCell>
                    )}
                    {/* OPPORTUNITY-ENGINE-2 — Action (TEST/SCALE/WATCHLIST/
                        AVOID) over the entry difficulty, each with its
                        reasons one hover away. */}
                    {!compact && (
                      <TableCell>
                        {(() => {
                          const cls = classMap.get(o.id);
                          const diff = diffMap.get(o.id);
                          if (!cls && !diff) return <span className="text-xs text-muted-foreground">—</span>;
                          const am = cls ? ACTION_META[cls.action] : null;
                          const dm = diff ? DIFFICULTY_META[diff.difficulty] : null;
                          return (
                            <div className="flex flex-col items-start gap-1">
                              {am && (
                                <span
                                  className={cn("rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide", am.className)}
                                  title={`RECOMMENDED ACTION — ${cls!.headline}\n\n${cls!.reasons.join("\n")}${cls!.upgradePath ? `\n\nUpgrade path: ${cls!.upgradePath}` : ""}`}
                                >
                                  {am.label}
                                </span>
                              )}
                              {dm && (
                                <span
                                  className={cn("rounded border px-1.5 py-0.5 text-[9px] font-medium", dm.className)}
                                  title={`ENTRY DIFFICULTY — ${dm.detail}\n\n${diff!.reasons.join("\n")}`}
                                >
                                  {diff!.difficulty}
                                  {diff!.easeScore != null && (
                                    <span className="ml-1 tabular opacity-70">{diff!.easeScore}</span>
                                  )}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        {est ? (
                          <>
                            <div className="flex items-center justify-end gap-1.5">
                              <span
                                title={`NET EARNINGS (base month) — ${est.base.note}\n\n${est.oneLine}\n\nCosts ${formatCurrency(est.costs.totalUsd)}/mo: GPU/electricity ${formatCurrency(est.costs.gpuOrElectricityUsd)} + cooling ${formatCurrency(est.costs.coolingUsd)} + storage ${formatCurrency(est.costs.storageUsd)} + infra ${formatCurrency(est.costs.infrastructureUsd)} + maintenance ${formatCurrency(est.costs.maintenanceUsd)} + registration ${formatCurrency(est.costs.registrationUsd)} + hardware recovery ${formatCurrency(est.costs.hardwareRecoveryUsd)} + other ${formatCurrency(est.costs.otherUsd)}\n\nBasis: ${est.costBasisNote}`}
                                className={cn(
                                  "tabular font-semibold",
                                  est.base.netMonthlyUsd > 0
                                    ? "text-success"
                                    : est.base.netMonthlyUsd < 0
                                      ? "text-destructive"
                                      : "text-muted-foreground"
                                )}
                              >
                                {formatCurrency(est.base.netMonthlyUsd)}
                              </span>
                              {(() => {
                                const cb = CONFIDENCE_BAND_STYLE[est.base.confidenceBand];
                                return (
                                  <span
                                    title={`Base-month confidence: ${Math.round(est.base.confidence * 100)}% (${est.base.confidenceBand}) — ${est.base.confidenceDrivers.length} data drivers. Click the row for the full factor breakdown.`}
                                    className={cn(
                                      "inline-flex h-4 w-4 items-center justify-center rounded border text-[9px] font-bold",
                                      cb.className
                                    )}
                                  >
                                    {est.base.confidenceBand.charAt(0)}
                                  </span>
                                );
                              })()}
                            </div>
                            <span
                              className="text-[10px] leading-tight text-muted-foreground"
                              title={`Conservative month ${formatCurrency(est.conservative.netMonthlyUsd)}/mo — ${est.conservative.note}.\nOptimistic month ${formatCurrency(est.optimistic.netMonthlyUsd)}/mo — ${est.optimistic.note}.`}
                            >
                              <span
                                className={cn(
                                  "tabular",
                                  est.conservative.netMonthlyUsd < 0 && "text-warning"
                                )}
                              >
                                worst {formatCurrency(est.conservative.netMonthlyUsd)}
                              </span>
                              {" · best "}
                              <span className="tabular">{formatCurrency(est.optimistic.netMonthlyUsd)}</span>
                              {est.conservativeVerdict === "RAMP_LOSS" && (
                                <AlertTriangle
                                  className="ml-1 inline h-3 w-3 text-warning"
                                  aria-label="first month runs at a loss"
                                />
                              )}
                              {est.conservativeVerdict === "LOSS_MAKING" && (
                                <Ban
                                  className="ml-1 inline h-3 w-3 text-destructive"
                                  aria-label="loses money every month"
                                />
                              )}
                            </span>
                            {prof && (
                              <span
                                className={cn(
                                  "text-[10px] font-medium",
                                  prof.meetsMinimum ? "text-success" : "text-destructive"
                                )}
                                title={
                                  prof.meetsMinimum
                                    ? `Base month meets the minimum net-profit target ($${prof.targetUsd.toLocaleString()}/mo) — margin ${prof.profitMarginPct.toFixed(0)}%, ROI ${prof.roiMonthlyPct.toFixed(0)}%/mo`
                                    : `Base month below the minimum net-profit target by ${formatCurrency(prof.shortfallUsd)}/mo — AVOID`
                                }
                              >
                                {prof.meetsMinimum
                                  ? `✓ ≥ $${prof.targetUsd.toLocaleString()} target`
                                  : `✗ < $${prof.targetUsd.toLocaleString()} target`}
                              </span>
                            )}
                          </>
                        ) : (
                          <span
                            title={
                              prof
                                ? `Revenue ${formatCurrency(prof.expectedRevenueUsd)}${o.revenueBasis === "provider-marketplace" ? " (measured provider income — 95% rental share + idle pay; not emission)" : ""} − ${ownedBasis ? "GPU electricity (owned basis — no market rent charged)" : "GPU rent (market rate)"} ${formatCurrency(prof.gpuRentalUsd)} − storage ${formatCurrency(prof.storageUsd)} − infra ${formatCurrency(prof.infrastructureUsd)} − other ${formatCurrency(prof.otherOperatingTotalUsd)} = net ${formatCurrency(prof.netMonthlyUsd)}/mo`
                                : o.gpuCostMonthlyUsd != null
                                  ? `Gross $${(o.grossMonthlyUsd ?? 0).toLocaleString()}${o.revenueBasis === "provider-marketplace" ? " (measured provider income — 95% rental share + idle pay; not emission)" : ""} − GPU ${ownedBasis ? "electricity" : "rent"} $${Math.round(o.gpuCostMonthlyUsd).toLocaleString()} − infra $${Math.round(o.infraCostMonthlyUsd ?? 0).toLocaleString()} — what a median-performing miner keeps per month${o.rewardRealizability != null && o.rewardRealizability < 0.9 ? ` · rewards realizable at ${(o.rewardRealizability * 100).toFixed(0)}% of spot (thin pool)` : ""}`
                                  : "Per-earning-miner monthly revenue"
                            }
                            className={cn(
                              "tabular font-semibold",
                              (o.netMonthlyUsd ?? o.estimatedMonthlyRewardUsd) > 0
                                ? "text-success"
                                : (o.netMonthlyUsd ?? o.estimatedMonthlyRewardUsd) < 0
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                            )}
                          >
                            {formatCurrency(o.netMonthlyUsd ?? o.estimatedMonthlyRewardUsd)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {/* TAO-ACCUMULATION-1 — net TAO banked per month (base
                        month, realizable α→TAO) vs the user's goal. */}
                    {!compact && (
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          {tao ? (
                            <>
                              <div className="flex items-center justify-end gap-1.5">
                                <span
                                  title={`TAO ACCUMULATION (base month, realizable prices) — gross ${tao.grossTaoPerMonth.toFixed(2)} TAO (α→TAO after the pool haircut) − costs ${tao.costsTaoPerMonth.toFixed(2)} TAO = net ${tao.netTaoPerMonth.toFixed(2)} TAO/mo.\nGoal: ${tao.targetTaoPerMonth} TAO/mo${tao.goalRatio != null ? ` → ${tao.goalRatio >= 1 ? "met" : `${Math.round(tao.goalRatio * 100)}% of goal`}` : ""}.\nAt $${tao.taoPriceUsd.toFixed(2)}/TAO. Worst month ${tao.conservativeNetTaoPerMonth.toFixed(2)} TAO · best ${tao.optimisticNetTaoPerMonth.toFixed(2)} TAO.${tao.conversionHaircutPct != null ? `\nPool haircut already charged: ${tao.conversionHaircutPct.toFixed(1)}% below spot.` : ""}${tao.thinPool ? `\n⚠ Thin pool (${Math.round(tao.poolDepthTao ?? 0).toLocaleString()} TAO side) — large conversions realize worse.` : ""}${tao.assumedTaoPriceUsd != null && tao.valueAtAssumedYearlyUsd != null ? `\nYour long-term bet: at $${tao.assumedTaoPriceUsd.toFixed(0)}/TAO this row's banked TAO is worth $${tao.valueAtAssumedMonthlyUsd?.toFixed(0)}/mo · $${tao.valueAtAssumedYearlyUsd.toFixed(0)}/yr (re-valued equally — ranking unchanged).` : ""}\nHORIZONS (net · conservative): 7d ${tao.horizons[0].netTao.toFixed(2)} · ${tao.horizons[0].conservativeNetTao.toFixed(2)} | 30d ${tao.horizons[1].netTao.toFixed(2)} · ${tao.horizons[1].conservativeNetTao.toFixed(2)} | 90d ${tao.horizons[2].netTao.toFixed(2)} · ${tao.horizons[2].conservativeNetTao.toFixed(2)} TAO`}
                                  className={cn(
                                    "tabular font-semibold",
                                    tao.netTaoPerMonth > 0
                                      ? "text-success"
                                      : tao.netTaoPerMonth < 0
                                        ? "text-destructive"
                                        : "text-muted-foreground"
                                  )}
                                >
                                  {tao.netTaoPerMonth.toFixed(2)} TAO
                                </span>
                                {tao.goalRatio != null && (
                                  <span
                                    className={cn(
                                      "mono inline-flex items-center rounded border px-1 py-px text-[9px] font-bold",
                                      tao.goalRatio >= 1
                                        ? "border-success/40 bg-success/10 text-success"
                                        : tao.goalRatio > 0
                                          ? "border-warning/40 bg-warning/10 text-warning"
                                          : "border-destructive/40 bg-destructive/10 text-destructive"
                                    )}
                                    title={`Goal ${tao.targetTaoPerMonth} TAO/mo — this row banks ${tao.goalRatio >= 1 ? "the full goal" : `${Math.round(tao.goalRatio * 100)}% of it`}`}
                                  >
                                    {tao.goalRatio >= 1 ? "✓ goal" : `${Math.round(tao.goalRatio * 100)}%`}
                                  </span>
                                )}
                                {tao.thinPool && (
                                  <AlertTriangle
                                    className="h-3 w-3 text-warning"
                                    aria-label="thin exit pool"
                                  />
                                )}
                              </div>
                              <span className="text-[10px] leading-tight text-muted-foreground">
                                worst{" "}
                                <span
                                  className={cn(
                                    "tabular",
                                    tao.conservativeNetTaoPerMonth < 0 && "text-warning"
                                  )}
                                >
                                  {tao.conservativeNetTaoPerMonth.toFixed(2)}
                                </span>{" "}
                                · best <span className="tabular">{tao.optimisticNetTaoPerMonth.toFixed(2)}</span>
                                {tao.conversionHaircutPct != null && (
                                  <> · α→TAO −{tao.conversionHaircutPct.toFixed(1)}%</>
                                )}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground" title="No P&L or TAO price — no honest TAO re-denomination">
                              —
                            </span>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {!compact && (
                      <TableCell className="text-right tabular font-medium text-success">
                        {formatPercent(o.estimatedApy)}
                      </TableCell>
                    )}
                    {!compact && (
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="mono tabular text-muted-foreground">
                            {o.alphaPriceUsd != null && o.alphaPriceUsd > 0
                              ? `$${o.alphaPriceUsd < 1 ? o.alphaPriceUsd.toFixed(4) : o.alphaPriceUsd.toFixed(2)}`
                              : "—"}
                          </span>
                          {o.alphaChange24h != null && (
                            <span
                              className={cn(
                                "tabular text-[10px]",
                                o.alphaChange24h >= 0 ? "text-success" : "text-destructive"
                              )}
                            >
                              {o.alphaChange24h >= 0 ? "▲" : "▼"} {Math.abs(o.alphaChange24h).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {!compact && (
                      <TableCell
                        className="text-right mono tabular text-muted-foreground"
                        title="TAO-side pool depth — exit liquidity for converting mined alpha"
                      >
                        {o.liquidityTao != null ? formatNumber(o.liquidityTao) : "—"}
                      </TableCell>
                    )}
                    {!compact && (() => {
                      const rent = rentMap.get(o.id);
                      if (!rent) return <TableCell className="text-xs text-muted-foreground">—</TableCell>;
                      const st = RENT_EARN_BAND_STYLE[rent.band];
                      const tip = [
                        rent.rentBlock ??
                          (ownedBasis
                            ? "Runs on your owned rig — hosting gates (TEE-class restrictions) still apply"
                            : "Rentable on Akash/Vast-class GPU/CPU"),
                        rent.earnChancePct != null
                          ? `${rent.earnChancePct}% of slots earned last epoch`
                          : null,
                        rent.top10TakePct != null
                          ? `top 10% of UIDs take ${rent.top10TakePct}% of rewards`
                          : null,
                        rent.expectedNetMonthlyUsd != null
                          ? `new-entrant EV ≈ $${rent.expectedNetMonthlyUsd.toLocaleString()}/mo`
                          : null,
                        ...rent.notes,
                      ]
                        .filter(Boolean)
                        .join("\n");
                      return (
                        <TableCell>
                          <div
                            className="flex flex-col items-start gap-1"
                            title={tip}
                          >
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={cn("text-[10px] font-semibold", st.bg, st.color)}
                              >
                                {rent.rentable ? <>{rent.band} {rent.score}</> : <>{rent.band}</>}
                              </Badge>
                              {rent.knifeFight && (
                                <Swords className="h-3 w-3 text-destructive" aria-label="knife-fight seat" />
                              )}
                              {rent.whaleMean && !rent.knifeFight && (
                                <AlertTriangle className="h-3 w-3 text-warning" aria-label="whale-mean $ figures" />
                              )}
                              {!rent.rentable && (
                                <Ban
                                  className="h-3 w-3 text-destructive"
                                  aria-label={ownedBasis ? "blocked by hosting gate" : "not rentable"}
                                />
                              )}
                            </div>
                            <span className="text-[10px] leading-tight text-muted-foreground">
                              {rent.earnChancePct != null
                                ? `${rent.earnChancePct}% earn · top10 ${rent.top10TakePct ?? "?"}%`
                                : "earn ?"}
                              {rent.expectedNetMonthlyUsd != null && (
                                <> · EV ${rent.expectedNetMonthlyUsd.toLocaleString()}/mo</>
                              )}
                            </span>
                          </div>
                        </TableCell>
                      );
                    })()}
                    {!compact && (
                      <TableCell className="align-top">
                        {(() => {
                          const trend = oddsTrends?.[o.netuid] ?? null;
                          const hasAny =
                            o.earnChance != null || o.rampWeeks != null || trend != null;
                          return hasAny ? (
                            <RegisterOddsInline
                              row={o}
                              trend={trend}
                              className="max-w-[170px]"
                            />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          );
                        })()}
                      </TableCell>
                    )}
                    {!compact && (
                      <TableCell className="text-right">
                        {o.demandScore != null && o.demandBand ? (
                          <span
                            title={
                              o.demandBand === "real-demand"
                                ? "Demand reality: on-chain signals point to real demand backing the rewards"
                                : o.demandBand === "mixed"
                                  ? "Demand reality: mixed — rewards partly backed by staking inflow, partly by dilution"
                                  : "Demand reality: emission-funded — staking inflow backs only a small share of what miners are paid"
                            }
                            className={cn(
                              "mono tabular inline-flex items-center justify-end gap-1.5",
                              o.demandBand === "real-demand"
                                ? "text-success"
                                : o.demandBand === "mixed"
                                  ? "text-warning"
                                  : "text-destructive"
                            )}
                          >
                            {o.demandScore.toFixed(0)}
                            <span
                              className={cn(
                                "inline-block h-2 w-2 rounded-full",
                                o.demandBand === "real-demand"
                                  ? "bg-success"
                                  : o.demandBand === "mixed"
                                    ? "bg-warning"
                                    : "bg-destructive"
                              )}
                            />
                          </span>
                        ) : (
                          <span className="text-muted-foreground" title="Not enough on-chain data for a demand score">—</span>
                        )}
                      </TableCell>
                    )}
                    {!compact && (
                      <TableCell className="text-right tabular">
                        <span
                          title="Share of registered slots that earned reward last epoch — low means rewards are concentrated in few miners"
                          className={cn(
                            o.utilization < 0.05
                              ? "text-warning"
                              : "text-muted-foreground"
                          )}
                        >
                          {(o.utilization * 100).toFixed(0)}%
                        </span>
                      </TableCell>
                    )}
                    {!compact && (
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span
                            className={cn(
                              "mono tabular font-medium",
                              o.minVramGb >= 80
                                ? "text-primary"
                                : o.minVramGb >= 40
                                  ? "text-foreground"
                                  : "text-muted-foreground"
                            )}
                          >
                            {/* RIDGES-FIX: mark revenue-estimated figures so a
                                guessed GPU is never read as a documented spec. */}
                            {o.minVramGb} GB
                            {!o.requirementsSource && !o.hardwareClassified && (
                              <span className="ml-1 text-[10px] font-normal text-muted-foreground" title="Revenue-based estimate — not documented by the subnet">est.</span>
                            )}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {o.recommendedGpu.replace("NVIDIA ", "").replace(" 80GB", "").replace(" 40GB", "")}
                          </span>
                          {o.hosting && (
                            <HostingChips hosting={o.hosting} source={o.requirementsSource} className="justify-end" />
                          )}
                        </div>
                      </TableCell>
                    )}
                    {!compact && (
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn("capitalize", risk.bg, risk.text)}
                        >
                          {o.riskLevel}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onSelect?.(o)}>
                            View breakdown
                          </DropdownMenuItem>
                          {onStartMining && (
                            <DropdownMenuItem
                              onClick={() => onStartMining(o)}
                              className="gap-2 text-primary focus:text-primary"
                            >
                              <Zap className="h-3.5 w-3.5" />
                              Start mining (needs {o.minVramGb}GB)
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem>Recommend GPU</DropdownMenuItem>
                          <DropdownMenuItem>Register miner</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
