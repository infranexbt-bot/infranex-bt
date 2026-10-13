"use client";

// WEALTH-1 — Engine 02 · EARN view: stablecoin/DeFi yield board, tracked
// positions, and the unified Monthly Income dashboard. All numbers are
// observation-or-manual-entry; the platform never moves funds.

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useYieldPools,
  useYieldPositions,
  useIncomeSummary,
  useTrackYieldPosition,
  useUpdateYieldPosition,
  useDeleteYieldPosition,
  type YieldPool,
} from "@/hooks/use-wealth";
import { cn } from "@/lib/utils";
import {
  Percent,
  Vault,
  Wallet,
  LineChart,
  RefreshCw,
  TrendingUp,
  CircleCheck,
  TriangleAlert,
  X,
  Plus,
  ExternalLink,
} from "lucide-react";

const usd = (n: number, digits = 0) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const pct = (n: number) => `${n.toFixed(2)}%`;

// ---------------------------------------------------------------------------
// Tab 1 — Yield Opportunities
// ---------------------------------------------------------------------------

function YieldBoard({ onTracked }: { onTracked: () => void }) {
  const [stablecoin, setStablecoin] = useState(true);
  const [minTvl, setMinTvl] = useState(25_000_000);
  const [sort, setSort] = useState<"apy" | "tvl">("apy");
  const { data, isLoading, isError, error, isFetching } = useYieldPools({ stablecoin, minTvl, sort });
  const [trackPool, setTrackPool] = useState<YieldPool | null>(null);

  const top = data?.pools ?? [];
  const best = top[0]?.apy ?? 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Best stable APY" value={best ? pct(best) : "—"} icon={Percent} accent="text-success" />
        <KpiCard label="Pools shown" value={top.length ? String(top.length) : "—"} sub={data ? `of ${data.totalPoolsScanned.toLocaleString()} scanned` : ""} icon={Vault} />
        <KpiCard label="Board age" value={data?.cacheAgeMin != null ? `${data.cacheAgeMin} min` : "—"} sub="30-min server cache" icon={RefreshCw} />
        <KpiCard label="Source" value="DeFiLlama" sub="public API · no key" icon={ExternalLink} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold tracking-tight">
              Stablecoin &amp; DeFi pools
            </CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch id="stablecoin-only" checked={stablecoin} onCheckedChange={setStablecoin} />
                <Label htmlFor="stablecoin-only" className="text-xs text-muted-foreground">
                  Stablecoin only
                </Label>
              </div>
              <Select value={String(minTvl)} onValueChange={(v) => setMinTvl(Number(v))}>
                <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Minimum TVL">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5000000">TVL &gt; $5M</SelectItem>
                  <SelectItem value="25000000">TVL &gt; $25M</SelectItem>
                  <SelectItem value="50000000">TVL &gt; $50M</SelectItem>
                  <SelectItem value="250000000">TVL &gt; $250M</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setSort(v as "apy" | "tvl")}>
                <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="Sort pools">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="apy">Sort by APY</SelectItem>
                  <SelectItem value="tvl">Sort by TVL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : isError ? (
            <p className="flex items-center gap-2 py-6 text-sm text-destructive">
              <TriangleAlert className="h-4 w-4" /> Failed to load pools: {(error as Error)?.message ?? "unknown"}
            </p>
          ) : top.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No pools match the current filters.</p>
          ) : (
            <div className="custom-scroll max-h-[520px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Pool</TableHead>
                    <TableHead className="text-right">APY</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Base / Reward</TableHead>
                    <TableHead className="text-right">TVL</TableHead>
                    <TableHead className="hidden lg:table-cell">Risk</TableHead>
                    <TableHead className="text-right">Track</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.protocol}</div>
                        <div className="mono text-[11px] text-muted-foreground">
                          {p.symbol} · {p.chain}
                        </div>
                      </TableCell>
                      <TableCell className="mono text-right font-semibold text-success tabular">
                        {p.apy != null ? pct(p.apy) : "—"}
                      </TableCell>
                      <TableCell className="mono hidden text-right text-[11px] text-muted-foreground tabular md:table-cell">
                        {p.apyBase != null ? pct(p.apyBase) : "—"} / {p.apyReward != null ? pct(p.apyReward) : "—"}
                      </TableCell>
                      <TableCell className="mono text-right tabular">{usd(p.tvlUsd)}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {p.ilRisk === "no" ? (
                          <Badge variant="outline" className="text-[10px] text-success">
                            no IL
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-warning">
                            {p.ilRisk} IL
                          </Badge>
                        )}
                        {p.exposure === "single" && (
                          <Badge variant="outline" className="mono ml-1 text-[10px]">
                            single
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTrackPool(p)}>
                          <Plus className="mr-1 h-3 w-3" /> Track
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {isFetching && !isLoading && (
            <p className="mt-2 text-right text-[11px] text-muted-foreground">Refreshing…</p>
          )}
        </CardContent>
      </Card>

      <TrackDialog pool={trackPool} onClose={() => setTrackPool(null)} onTracked={onTracked} />
    </div>
  );
}

function TrackDialog({
  pool,
  onClose,
  onTracked,
}: {
  pool: YieldPool | null;
  onClose: () => void;
  onTracked: () => void;
}) {
  const [amount, setAmount] = useState("");
  const track = useTrackYieldPosition();

  const submit = () => {
    if (!pool) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    track.mutate(
      {
        poolId: pool.id,
        protocol: pool.protocol,
        chain: pool.chain,
        symbol: pool.symbol,
        stablecoin: pool.stablecoin,
        amountUsd: amt,
        entryApy: pool.apy ?? 0,
        currentApy: pool.apy,
      },
      {
        onSuccess: () => {
          setAmount("");
          onTracked();
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={!!pool} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Track yield position</DialogTitle>
          <DialogDescription>
            {pool ? `${pool.protocol} · ${pool.symbol} on ${pool.chain} · APY ${pool.apy != null ? pct(pool.apy) : "—"}` : ""}
            {" "}Bookkeeping only — the platform never moves funds. Tracking the same pool again adds to the position.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="pos-amount">Position size (USD)</Label>
          <Input
            id="pos-amount"
            type="number"
            min="1"
            placeholder="e.g. 5000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          {track.isError && (
            <p className="text-xs text-destructive">{(track.error as Error)?.message}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={track.isPending || !amount}>
            {track.isPending ? "Saving…" : "Track position"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — My Positions
// ---------------------------------------------------------------------------

function MyPositions() {
  const { data, isLoading } = useYieldPositions();
  const update = useUpdateYieldPosition();
  const remove = useDeleteYieldPosition();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const positions = data?.positions ?? [];
  const totals = data?.totals;

  if (positions.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No tracked positions yet. Pick a pool from the Yield Opportunities tab and press
          &ldquo;Track&rdquo; — your projected income shows up here and in the Income tab.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Deployed capital" value={usd(totals?.totalUsd ?? 0)} icon={Wallet} />
        <KpiCard label="Blended APY" value={pct(totals?.blendedApy ?? 0)} icon={Percent} accent="text-success" />
        <KpiCard label="Projected / month" value={usd(totals?.monthlyUsd ?? 0, 2)} icon={TrendingUp} accent="text-success" />
        <KpiCard label="Active positions" value={String(totals?.activeCount ?? 0)} icon={Vault} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold tracking-tight">Tracked positions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pool</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead className="text-right">Entry APY</TableHead>
                <TableHead className="text-right">Current APY</TableHead>
                <TableHead className="text-right">$/mo</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((p) => {
                const cur = p.currentApy ?? p.entryApy;
                const drift = cur - p.entryApy;
                return (
                  <TableRow key={p.id} className={p.status === "closed" ? "opacity-50" : undefined}>
                    <TableCell>
                      <div className="font-medium">{p.protocol}</div>
                      <div className="mono text-[11px] text-muted-foreground">
                        {p.symbol} · {p.chain}
                      </div>
                    </TableCell>
                    <TableCell className="mono text-right tabular">{usd(p.amountUsd)}</TableCell>
                    <TableCell className="mono text-right tabular">{pct(p.entryApy)}</TableCell>
                    <TableCell className="mono text-right tabular">
                      <span className={drift < -1 ? "text-warning" : drift > 1 ? "text-success" : undefined}>
                        {pct(cur)}
                      </span>
                      {Math.abs(drift) > 1 && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({drift > 0 ? "+" : ""}
                          {drift.toFixed(1)})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="mono text-right tabular text-success">
                      {usd((p.amountUsd * (cur / 100)) / 12, 2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {p.status === "active" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: p.id, status: "closed" })}
                          >
                            Close
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: p.id, status: "active" })}
                          >
                            Reopen
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${p.protocol} position`}
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(p.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — Income dashboard
// ---------------------------------------------------------------------------

function IncomeDashboard() {
  const { data, isLoading } = useIncomeSummary();
  const [source, setSource] = useState("staking");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const sources = [
    { key: "Mining", value: data.mining.monthlyProjectedUsd, note: "trailing 30d realized", color: "text-primary" },
    { key: "Yield", value: data.yield.monthlyUsd, note: `${data.yield.activeCount} active · blended ${pct(data.yield.blendedApy)}`, color: "text-success" },
    { key: "Manual", value: data.manual.currentMonthUsd, note: "staking rewards & other", color: "text-chart-4" },
  ];
  const trend = data.trend.slice().reverse();
  const trendMax = Math.max(...trend.map((t) => t.totalUsd), 1);

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-eyebrow text-muted-foreground">Recurring monthly cashflow</p>
              <p className="mono mt-1 text-4xl font-bold tabular text-gradient">
                {usd(data.totalMonthlyUsd, 2)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.month} · mining run-rate + yield projection + manual entries
              </p>
            </div>
            <div className="grid grid-cols-3 gap-6">
              {sources.map((s) => (
                <div key={s.key} className="text-right">
                  <p className="text-eyebrow text-muted-foreground">{s.key}</p>
                  <p className={cn("mono text-lg font-semibold tabular", s.color)}>{usd(s.value, 2)}</p>
                  <p className="text-[10px] text-muted-foreground">{s.note}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold tracking-tight">6-month trend (monthly run-rate)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-end gap-3">
            {trend.map((t) => (
              <div key={t.month} className="group flex flex-1 flex-col items-center gap-1">
                <span className="mono text-[10px] tabular text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  {usd(t.totalUsd)}
                </span>
                <div className="flex w-full flex-col justify-end gap-0.5" style={{ height: "120px" }}>
                  <div
                    className="w-full rounded-t bg-primary/25"
                    style={{ height: `${(t.miningUsd / trendMax) * 100}%` }}
                    title={`Mining ${usd(t.miningUsd, 2)}`}
                  />
                  <div
                    className="w-full bg-success/50"
                    style={{ height: `${(t.yieldUsd / trendMax) * 100}%` }}
                    title={`Yield ${usd(t.yieldUsd, 2)}`}
                  />
                  <div
                    className="w-full rounded-b bg-chart-4/60"
                    style={{ height: `${(t.manualUsd / trendMax) * 100}%` }}
                    title={`Manual ${usd(t.manualUsd, 2)}`}
                  />
                </div>
                <span className="mono text-[10px] text-muted-foreground">
                  {t.month.slice(5)}
                  {t.partial ? "*" : ""}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-primary/40" /> Mining
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-success/50" /> Yield (current projection)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-chart-4/60" /> Manual
            </span>
            <span>* partial month annualized to 30d</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold tracking-tight">Top mining subnets (trailing 30d)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.mining.topSubnets.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No miner earnings recorded yet — connect a deployment in the Deployments view and
                realized rewards will flow into this dashboard.
              </p>
            ) : (
              <div className="space-y-2">
                {data.mining.topSubnets.map((s) => {
                  const max = data.mining.topSubnets[0].usd || 1;
                  return (
                    <div key={s.netuid} className="flex items-center gap-3">
                      <span className="mono w-12 text-xs tabular">SN{s.netuid}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary/50" style={{ width: `${(s.usd / max) * 100}%` }} />
                      </div>
                      <span className="mono w-20 text-right text-xs tabular">{usd(s.usd, 2)}</span>
                    </div>
                  );
                })}
                <p className="pt-1 text-[11px] text-muted-foreground">
                  Daily avg {usd(data.mining.dailyAvgUsd, 2)} · realized {usd(data.mining.trailing30dUsd, 2)} in the last 30 days
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold tracking-tight">Manual income entries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-[130px]">
                <Label htmlFor="inc-source" className="text-[11px] text-muted-foreground">
                  Source
                </Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger id="inc-source" className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staking">TAO staking</SelectItem>
                    <SelectItem value="yield">DeFi yield</SelectItem>
                    <SelectItem value="mining">Mining</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[120px]">
                <Label htmlFor="inc-label" className="text-[11px] text-muted-foreground">
                  Label (optional)
                </Label>
                <Input id="inc-label" className="h-8 text-xs" placeholder="e.g. root staking" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className="w-[110px]">
                <Label htmlFor="inc-amount" className="text-[11px] text-muted-foreground">
                  USD / month
                </Label>
                <Input id="inc-amount" className="h-8 text-xs" type="number" min="0" placeholder="120" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <ManualEntryButton source={source} label={label} amount={amount} onDone={() => { setAmount(""); setLabel(""); }} />
            </div>
            {data.manual.entries.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                Add staking rewards or any other recurring income here — entries feed the monthly
                total and the trend.
              </p>
            ) : (
              <div className="space-y-1.5">
                {data.manual.entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <CircleCheck className="h-3.5 w-3.5 text-success" />
                      <span className="mono text-muted-foreground">{e.month}</span>
                      <Badge variant="outline" className="mono text-[10px]">
                        {e.source}
                      </Badge>
                      <span>{e.label || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="mono text-xs font-semibold tabular">{usd(e.amountUsd, 2)}</span>
                      <ManualDeleteButton id={e.id} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ManualEntryButton({ source, label, amount, onDone }: { source: string; label: string; amount: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setPending(true);
    setErr(null);
    try {
      const res = await fetch("/api/income/summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, label, amountUsd: amt }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `save failed ${res.status}`);
      }
      await qc.invalidateQueries({ queryKey: ["income-summary"] });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <Button size="sm" className="h-8 text-xs" onClick={save} disabled={pending || !amount}>
        <Plus className="mr-1 h-3 w-3" /> {pending ? "Saving…" : "Add"}
      </Button>
      {err && <p className="mt-1 text-[10px] text-destructive">{err}</p>}
    </div>
  );
}

function ManualDeleteButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
      aria-label="Delete entry"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await fetch(`/api/income/summary?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
        await qc.invalidateQueries({ queryKey: ["income-summary"] });
        setPending(false);
      }}
    >
      <X className="h-3 w-3" />
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof Percent;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-primary/10">
          <Icon className={cn("h-4 w-4", accent ?? "text-primary")} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-eyebrow truncate text-muted-foreground">{label}</p>
          <p className="mono text-lg font-semibold tabular">{value}</p>
          {sub && <p className="truncate text-[10px] text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// View root
// ---------------------------------------------------------------------------

export function EarnView() {
  const { refetch: refetchPositions } = useYieldPositions();
  return (
    <div className="space-y-6">
      <Tabs defaultValue="yield">
        <TabsList className="mb-4">
          <TabsTrigger value="yield" className="gap-1.5">
            <Percent className="h-3.5 w-3.5" /> Yield Opportunities
          </TabsTrigger>
          <TabsTrigger value="positions" className="gap-1.5">
            <Wallet className="h-3.5 w-3.5" /> My Positions
          </TabsTrigger>
          <TabsTrigger value="income" className="gap-1.5">
            <LineChart className="h-3.5 w-3.5" /> Income
          </TabsTrigger>
        </TabsList>
        <TabsContent value="yield">
          <YieldBoard onTracked={() => refetchPositions()} />
        </TabsContent>
        <TabsContent value="positions">
          <MyPositions />
        </TabsContent>
        <TabsContent value="income">
          <IncomeDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
