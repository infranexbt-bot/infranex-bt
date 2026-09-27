"use client";

// Active Miners panel — live per-UID metagraph for one subnet, rendered as a
// tab inside the Subnet Requirements dialog. Data comes straight from the
// subtensor chain via GET /api/subnets/[netuid]/neurons (60s server-side
// vector cache). Honest by construction: every number shown is the same
// chain storage validators score against — no cached fabrications.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface NeuronRow {
  uid: number;
  hotkey: string | null;
  active: boolean;
  tier: "earning" | "active" | "stale" | "idle";
  incentive: number;
  consensus: number;
  validatorTrust: number;
  emissionRel: number;
  blocksSinceUpdate: number | null;
}

interface NeuronsResponse {
  netuid: number;
  blockNumber: number;
  registeredUids: number;
  maxAllowedUids: number | null;
  tempo: number | null;
  immunityPeriod: number | null;
  summary: { activeCount: number; earningCount: number; medianRewardedIncentive: number };
  rows: NeuronRow[];
  fetchedAt: number;
}

type SortKey = "incentive" | "uid" | "fresh";

const TIER_STYLE: Record<NeuronRow["tier"], { label: string; className: string }> = {
  earning: { label: "Earning", className: "bg-primary/10 text-primary" },
  active: { label: "Active", className: "bg-success/10 text-success" },
  stale: { label: "Stale", className: "bg-warning/10 text-warning" },
  idle: { label: "Idle", className: "bg-muted text-muted-foreground" },
};

const BLOCK_SECONDS = 12;

function blocksToHuman(blocks: number | null): string {
  if (blocks === null || blocks <= 0) return "—";
  const s = blocks * BLOCK_SECONDS;
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function shortHotkey(hk: string | null): string {
  if (!hk) return "—";
  return `${hk.slice(0, 6)}…${hk.slice(-4)}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function MiniBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", className ?? "bg-primary")}
          style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
        />
      </div>
      <span className="mono text-[11px] tabular-nums">{pct(value)}</span>
    </div>
  );
}

interface MinersPanelProps {
  netuid: number;
  symbol: string;
  chainMinersCount?: number;
}

export function MinersPanel({ netuid, symbol, chainMinersCount }: MinersPanelProps) {
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "loaded"; data: NeuronsResponse }
    | { phase: "error"; message: string }
  >({ phase: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<SortKey>("incentive");
  const [query, setQuery] = useState("");

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      else setState({ phase: "loading" });
      try {
        const res = await fetch(`/api/subnets/${netuid}/neurons`);
        const j = (await res.json()) as NeuronsResponse | { error: string };
        if (!res.ok || "error" in j) {
          setState({ phase: "error", message: "error" in j ? j.error : `API ${res.status}` });
          return;
        }
        setState({ phase: "loaded", data: j });
      } catch (e) {
        setState({
          phase: "error",
          message: e instanceof Error ? e.message : "Request failed",
        });
      } finally {
        setRefreshing(false);
      }
    },
    [netuid]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const rows = useMemo(() => {
    if (state.phase !== "loaded") return [];
    const q = query.trim().toLowerCase();
    let list = state.data.rows;
    if (q) {
      list = list.filter(
        (r) =>
          String(r.uid).includes(q) ||
          (r.hotkey && r.hotkey.toLowerCase().includes(q))
      );
    }
    const sorted = [...list];
    if (sort === "incentive") {
      sorted.sort((a, b) => b.incentive - a.incentive || a.uid - b.uid);
    } else if (sort === "uid") {
      sorted.sort((a, b) => a.uid - b.uid);
    } else {
      // freshest first — unknown staleness (null) sinks to the bottom
      sorted.sort(
        (a, b) =>
          (a.blocksSinceUpdate ?? Number.MAX_SAFE_INTEGER) -
          (b.blocksSinceUpdate ?? Number.MAX_SAFE_INTEGER)
      );
    }
    return sorted;
  }, [state, sort, query]);

  return (
    <div className="space-y-4">
      {/* Summary strip — what this subnet's miner field looks like right now */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="badge-status bg-primary/10 text-primary">
          <Users className="h-3 w-3" />
          {state.phase === "loaded"
            ? `${state.data.registeredUids}${state.data.maxAllowedUids ? ` / ${state.data.maxAllowedUids}` : ""} registered`
            : state.phase === "error"
              ? `α${netuid} metagraph`
              : `Loading α${netuid} metagraph…`}
        </span>
        {state.phase === "loaded" && (
          <>
            <span className="badge-status bg-success/10 text-success">
              {state.data.summary.activeCount} active (chain flag)
            </span>
            <span className="badge-status bg-primary/10 text-primary">
              {state.data.summary.earningCount} earning
            </span>
            <span className="badge-status bg-muted text-muted-foreground">
              median earning incentive {pct(state.data.summary.medianRewardedIncentive)}
            </span>
            <span className="badge-status bg-muted text-muted-foreground">
              block #{state.data.blockNumber.toLocaleString()}
              {state.data.tempo != null ? ` · tempo ${state.data.tempo}` : ""}
            </span>
          </>
        )}
        {typeof chainMinersCount === "number" && state.phase === "loaded" && (
          <span className="badge-status bg-muted text-muted-foreground">
            snapshot miner count {chainMinersCount.toLocaleString()}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by UID or hotkey…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="incentive" className="text-xs">Sort: incentive</SelectItem>
              <SelectItem value="uid" className="text-xs">Sort: UID</SelectItem>
              <SelectItem value="fresh" className="text-xs">Sort: freshest</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void load(true)}
            disabled={refreshing || state.phase === "loading"}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Body */}
      {state.phase === "loading" && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )}

      {state.phase === "error" && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Could not load the metagraph</p>
          <p className="mt-1 text-xs text-muted-foreground">{state.message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-8 text-xs"
            onClick={() => void load(false)}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )}

      {state.phase === "loaded" && (
        <div className="custom-scroll max-h-[52vh] overflow-y-auto rounded-lg border border-border/60">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 text-[11px]">UID</TableHead>
                <TableHead className="h-8 text-[11px]">Hotkey</TableHead>
                <TableHead className="h-8 text-[11px]">Status</TableHead>
                <TableHead
                  className="h-8 text-[11px]"
                  title="Incentive held in the last epoch — the direct measure of what the subnet's validators currently pay this UID"
                >
                  Incentive
                </TableHead>
                <TableHead
                  className="h-8 text-[11px]"
                  title="Emission relative to the top earner on this subnet"
                >
                  Emission
                </TableHead>
                <TableHead
                  className="h-8 text-[11px]"
                  title="Consensus — how strongly the validator set agrees this UID should be paid"
                >
                  Consensus
                </TableHead>
                <TableHead
                  className="h-8 text-[11px]"
                  title="Validator trust — share of validating stake that trusts this UID"
                >
                  Trust
                </TableHead>
                <TableHead
                  className="h-8 text-[11px]"
                  title="Blocks since this UID's last chain update (~12s per block)"
                >
                  Updated
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-xs text-muted-foreground">
                    No UIDs match “{query}”.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const t = TIER_STYLE[r.tier];
                return (
                  <TableRow key={r.uid} className="text-xs">
                    <TableCell className="mono py-1.5 font-medium">{r.uid}</TableCell>
                    <TableCell className="mono py-1.5 text-muted-foreground" title={r.hotkey ?? undefined}>
                      {shortHotkey(r.hotkey)}
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span className={cn("badge-status", t.className)}>
                        {t.label}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <MiniBar value={r.incentive} className="bg-primary" />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <MiniBar value={r.emissionRel} className="bg-success" />
                    </TableCell>
                    <TableCell className="mono py-1.5 tabular-nums text-muted-foreground">
                      {pct(r.consensus)}
                    </TableCell>
                    <TableCell className="mono py-1.5 tabular-nums text-muted-foreground">
                      {pct(r.validatorTrust)}
                    </TableCell>
                    <TableCell className="py-1.5 text-muted-foreground">
                      {blocksToHuman(r.blocksSinceUpdate)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Live subtensor metagraph for α{netuid} ({symbol}). “Active” is the chain&apos;s own
        activity flag — the UID has recently served validator queries. “Earning” UIDs held
        incentive in the last epoch and are being paid; “stale” UIDs have not updated in
        over a day. Rows come straight from the same chain storage validators score against,
        cached ~60s.
      </p>
    </div>
  );
}
