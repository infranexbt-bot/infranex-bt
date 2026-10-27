"use client";

// WEALTH-4 — Engine 03 · CAPTURE completion: trade journal with R-multiple
// analytics, the Hyperliquid funding scanner, and the AlphaChaser AI signal
// inbox. Decision records only — nothing here executes trades.

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
  useTrades,
  useCreateTrade,
  useUpdateTrade,
  useDeleteTrade,
  useFunding,
  useBotSignals,
  useScanAlphaChaser,
  useUpdateSignal,
  useDeleteSignal,
  fundingToTradeInput,
  type FundingRow,
  type Trade,
} from "@/hooks/use-capture";
import { cn } from "@/lib/utils";
import {
  Crosshair,
  BookOpen,
  Bot,
  Radar,
  Plus,
  X,
  Target,
  Percent,
  Sparkles,
  TriangleAlert,
  CheckCircle2,
  CircleDashed,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

const usd = (n: number, digits = 0) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const usdCompact = (n: number) =>
  Math.abs(n) >= 1e9
    ? `$${(n / 1e9).toFixed(2)}B`
    : Math.abs(n) >= 1e6
      ? `$${(n / 1e6).toFixed(1)}M`
      : Math.abs(n) >= 1e3
        ? `$${(n / 1e3).toFixed(0)}k`
        : `$${n.toFixed(0)}`;
const px = (n: number) =>
  n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n >= 1 ? n.toFixed(4) : n.toPrecision(4);

// ---------------------------------------------------------------------------
// Tab 1 — Trade journal
// ---------------------------------------------------------------------------

function JournalTab() {
  const { data, isLoading } = useTrades();
  const update = useUpdateTrade();
  const remove = useDeleteTrade();
  const [adding, setAdding] = useState(false);

  const trades = data?.trades ?? [];
  const stats = data?.stats;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Win rate"
          value={stats?.closed ? `${stats.winRatePct}%` : "—"}
          sub={stats ? `${stats.closed} closed of ${stats.total}` : ""}
          accent={(stats?.winRatePct ?? 0) >= 50 ? "text-success" : undefined}
          icon={Target}
        />
        <KpiCard
          label="Expectancy"
          value={stats?.closed ? `${stats.expectancyR >= 0 ? "+" : ""}${stats.expectancyR}R` : "—"}
          sub={stats?.closed ? `best ${stats.bestR}R · worst ${stats.worstR}R` : "avg R per trade"}
          accent={(stats?.expectancyR ?? 0) >= 0 ? "text-success" : "text-destructive"}
          icon={Crosshair}
        />
        <KpiCard
          label="Realized P&L"
          value={stats ? `${stats.totalPnlUsd >= 0 ? "+" : ""}${usd(stats.totalPnlUsd, 2)}` : "—"}
          accent={(stats?.totalPnlUsd ?? 0) >= 0 ? "text-success" : "text-destructive"}
          icon={BookOpen}
        />
        <KpiCard
          label="Open / planned"
          value={stats ? `${stats.active} / ${stats.planned}` : "—"}
          sub="active setups in flight"
          icon={CircleDashed}
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          One R = the risk between entry and stop. Log setups before you take them; closing them
          with the achieved R is what makes the expectancy real.
        </p>
        <Button size="sm" className="h-8 shrink-0 text-xs" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-3 w-3" /> Log setup
        </Button>
      </div>

      {stats && stats.byPair.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold tracking-tight">Per-pair edge (closed trades)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.byPair.map((p) => (
                <div key={p.pair} className="rounded-lg border border-border/60 px-3 py-2">
                  <p className="mono text-xs font-semibold">{p.pair}</p>
                  <p className="mono mt-0.5 text-[10px] text-muted-foreground tabular">
                    {p.count} trades · {p.winRatePct}% win · {p.avgR >= 0 ? "+" : ""}{p.avgR}R
                  </p>
                  <p className={cn("mono text-[10px] tabular", p.pnlUsd >= 0 ? "text-success" : "text-destructive")}>
                    {p.pnlUsd >= 0 ? "+" : ""}{usd(p.pnlUsd, 2)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold tracking-tight">Setups</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : trades.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No setups logged. Record the pair, levels and size before entry — the journal scores
              your discipline afterwards.
            </p>
          ) : (
            <div className="custom-scroll max-h-[560px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Pair</TableHead>
                    <TableHead className="text-right">Entry / Stop / Target</TableHead>
                    <TableHead className="text-right">R:R</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Size</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trades.map((t) => (
                    <TradeRow key={t.id} trade={t} onUpdate={(patch) => update.mutate({ id: t.id, ...patch })} onDelete={() => remove.mutate(t.id)} pending={update.isPending || remove.isPending} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <NewTradeDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function TradeRow({
  trade: t,
  onUpdate,
  onDelete,
  pending,
}: {
  trade: Trade;
  onUpdate: (patch: { status?: string; resultR?: number | null; pnlUsd?: number | null }) => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const [closing, setClosing] = useState(false);
  const long = t.direction === "LONG";
  return (
    <TableRow className={t.status === "cancelled" ? "opacity-50" : undefined}>
      <TableCell>
        <div className="flex items-center gap-1.5 font-medium">
          {long ? <ArrowUpRight className="h-3.5 w-3.5 text-success" /> : <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />}
          {t.pair}
        </div>
        <div className="mono text-[11px] text-muted-foreground">
          {t.direction}{t.leverage > 1 ? ` · ${t.leverage}x` : ""}{t.timeframe ? ` · ${t.timeframe}` : ""}
        </div>
      </TableCell>
      <TableCell className="mono text-right text-[11px] tabular">
        {px(t.entry)} / <span className="text-destructive">{px(t.stop)}</span> / <span className="text-success">{px(t.target)}</span>
      </TableCell>
      <TableCell className="mono text-right tabular">
        {t.plannedR != null ? `${t.plannedR}R` : "—"}
        {t.resultR != null && (
          <span className={cn("ml-1 font-semibold", t.resultR >= 0 ? "text-success" : "text-destructive")}>
            → {t.resultR >= 0 ? "+" : ""}{t.resultR}R
          </span>
        )}
      </TableCell>
      <TableCell className="mono hidden text-right tabular md:table-cell">{t.sizeUsd != null ? usd(t.sizeUsd) : "—"}</TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            t.status === "won" ? "text-success border-success/40" :
            t.status === "lost" ? "text-destructive border-destructive/40" :
            t.status === "active" ? "text-primary border-primary/40" :
            "text-muted-foreground"
          )}
        >
          {t.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {t.status === "planned" && (
            <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={pending} onClick={() => onUpdate({ status: "active" })}>
              Activate
            </Button>
          )}
          {(t.status === "active" || t.status === "planned") && (
            <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={pending} onClick={() => setClosing(true)}>
              Close
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" aria-label={`Delete ${t.pair} setup`} disabled={pending} onClick={onDelete}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>

      <Dialog open={closing} onOpenChange={(o) => !o && setClosing(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Close {t.pair}</DialogTitle>
            <DialogDescription>
              Record the achieved R and P&L. Planned risk was {t.plannedR ?? "?"}R.
            </DialogDescription>
          </DialogHeader>
          <CloseForm
            onSubmit={(resultR, pnlUsd) => {
              onUpdate({
                status: resultR > 0 ? "won" : "lost",
                resultR,
                pnlUsd,
              });
              setClosing(false);
            }}
            entry={t.entry}
            stop={t.stop}
            sizeUsd={t.sizeUsd}
          />
        </DialogContent>
      </Dialog>
    </TableRow>
  );
}

function CloseForm({
  onSubmit,
  entry,
  stop,
  sizeUsd,
}: {
  onSubmit: (resultR: number, pnlUsd: number | null) => void;
  entry: number;
  stop: number;
  sizeUsd: number | null;
}) {
  const [exit, setExit] = useState("");
  const riskPerUnit = Math.abs(entry - stop) || 1;
  const r = Number(exit) != null && exit !== "" ? ((Number(exit) - entry) / riskPerUnit) * (entry > stop ? 1 : 1) : null;
  // Direction-agnostic R: (exit-entry)/risk works for LONG (stop below) and,
  // for SHORT, entry>stop makes risk |entry-stop| and profit (entry-exit) —
  // handled below by flipping sign when stop > entry.
  const signedR =
    r != null && Number.isFinite(r) ? (stop > entry ? -r : r) : null;
  const pnl =
    signedR != null && sizeUsd ? (signedR * sizeUsd * (riskPerUnit / entry)) : null;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="cl-exit">Exit price</Label>
        <Input id="cl-exit" type="number" step="any" placeholder="e.g. 310" value={exit} onChange={(e) => setExit(e.target.value)} className="h-8 text-xs" autoFocus />
      </div>
      {signedR != null && (
        <p className={cn("mono text-xs tabular", signedR >= 0 ? "text-success" : "text-destructive")}>
          ≈ {signedR >= 0 ? "+" : ""}{signedR.toFixed(2)}R
          {pnl != null && Number.isFinite(pnl) ? ` · ${pnl >= 0 ? "+" : ""}${usd(pnl, 2)}` : ""}
        </p>
      )}
      <DialogFooter>
        <Button
          onClick={() => {
            if (signedR == null || !Number.isFinite(signedR)) return;
            onSubmit(Math.round(signedR * 100) / 100, pnl != null && Number.isFinite(pnl) ? Math.round(pnl * 100) / 100 : null);
          }}
          disabled={!exit}
          className="text-xs"
        >
          Close trade
        </Button>
      </DialogFooter>
    </div>
  );
}

function NewTradeDialog({ open, onClose, preset }: { open: boolean; onClose: () => void; preset?: Partial<{ pair: string; direction: "LONG" | "SHORT"; entry: string; stop: string; target: string; timeframe: string; notes: string }> }) {
  const create = useCreateTrade();
  const [pair, setPair] = useState(preset?.pair ?? "");
  const [direction, setDirection] = useState<"LONG" | "SHORT">(preset?.direction ?? "LONG");
  const [entry, setEntry] = useState(preset?.entry ?? "");
  const [stop, setStop] = useState(preset?.stop ?? "");
  const [target, setTarget] = useState(preset?.target ?? "");
  const [size, setSize] = useState("");
  const [timeframe, setTimeframe] = useState(preset?.timeframe ?? "");
  const [notes, setNotes] = useState(preset?.notes ?? "");

  const plannedRR =
    Number(entry) > 0 && Number(stop) > 0 && Number(target) > 0
      ? Math.abs(Number(target) - Number(entry)) / Math.abs(Number(entry) - Number(stop))
      : null;

  const submit = () => {
    const e = Number(entry), s = Number(stop), t2 = Number(target);
    if (!pair.trim() || !Number.isFinite(e) || !Number.isFinite(s) || !Number.isFinite(t2)) return;
    create.mutate(
      {
        pair: pair.trim(),
        direction,
        entry: e,
        stop: s,
        target: t2,
        sizeUsd: size ? Number(size) : null,
        timeframe,
        notes,
      },
      {
        onSuccess: () => {
          setPair(""); setEntry(""); setStop(""); setTarget(""); setSize(""); setNotes("");
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log trade setup</DialogTitle>
          <DialogDescription>
            Plan first, execute second. R:R is computed as you type — under 1.5R is usually a pass.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="t-pair">Pair</Label>
            <Input id="t-pair" placeholder="TAO-USDT" value={pair} onChange={(e) => setPair(e.target.value.toUpperCase())} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label>Direction</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as "LONG" | "SHORT")}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LONG">Long</SelectItem>
                <SelectItem value="SHORT">Short</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-entry">Entry</Label>
            <Input id="t-entry" type="number" step="any" value={entry} onChange={(e) => setEntry(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-stop">Stop</Label>
            <Input id="t-stop" type="number" step="any" value={stop} onChange={(e) => setStop(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-target">Target</Label>
            <Input id="t-target" type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-size">Size (USD, optional)</Label>
            <Input id="t-size" type="number" min="0" value={size} onChange={(e) => setSize(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="t-tf">Timeframe (optional)</Label>
            <Input id="t-tf" placeholder="e.g. 3-7 days · funding carry" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="t-notes">Notes (optional)</Label>
            <Textarea id="t-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="text-xs" />
          </div>
        </div>
        {plannedRR != null && (
          <p className={cn("mono text-xs tabular", plannedRR >= 1.5 ? "text-success" : "text-warning")}>
            Planned R:R {plannedRR.toFixed(2)}{plannedRR < 1.5 ? " — below the 1.5R bar" : ""}
          </p>
        )}
        {create.isError && <p className="text-xs text-destructive">{(create.error as Error)?.message}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || !pair.trim() || !entry || !stop || !target}>
            {create.isPending ? "Saving…" : "Log setup"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — Funding scanner
// ---------------------------------------------------------------------------

function FundingTab({ onJournal }: { onJournal: (row: FundingRow) => void }) {
  const [side, setSide] = useState<"all" | "long" | "short">("all");
  const [minOi, setMinOi] = useState(1_000_000);
  const [sort, setSort] = useState<"abs" | "pct">("abs");
  const { data, isLoading, isError, error } = useFunding({ side, minOi, sort });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Best short carry"
          value={data?.extremes.bestShortCarry ? `${data.extremes.bestShortCarry.asset} ${data.extremes.bestShortCarry.annualPct.toFixed(0)}%` : "—"}
          sub="positive funding · shorts collect"
          accent="text-success"
          icon={Percent}
        />
        <KpiCard
          label="Best long carry"
          value={data?.extremes.bestLongCarry ? `${data.extremes.bestLongCarry.asset} ${data.extremes.bestLongCarry.annualPct.toFixed(0)}%` : "—"}
          sub="negative funding · longs collect"
          accent="text-warning"
          icon={Percent}
        />
        <KpiCard label="Assets scanned" value={data ? String(data.universeCount) : "—"} sub={data ? `${data.matching} match filters` : ""} icon={Radar} />
        <KpiCard
          label="Board age"
          value={data ? new Date(data.fetchedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—"}
          sub={data?.stale ? "STALE — source down" : "10-min server cache"}
          accent={data?.stale ? "text-warning" : undefined}
          icon={Crosshair}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold tracking-tight">Hyperliquid perp funding (annualized)</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={side} onValueChange={(v) => setSide(v as "all" | "long" | "short")}>
                <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Carry side">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All carry</SelectItem>
                  <SelectItem value="short">Shorts collect</SelectItem>
                  <SelectItem value="long">Longs collect</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(minOi)} onValueChange={(v) => setMinOi(Number(v))}>
                <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Minimum open interest">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Any OI</SelectItem>
                  <SelectItem value="1000000">OI &gt; $1M</SelectItem>
                  <SelectItem value="10000000">OI &gt; $10M</SelectItem>
                  <SelectItem value="100000000">OI &gt; $100M</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setSort(v as "abs" | "pct")}>
                <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Sort funding">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="abs">Sort by |carry|</SelectItem>
                  <SelectItem value="pct">Sort by rate</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : isError ? (
            <p className="flex items-center gap-2 py-6 text-sm text-destructive">
              <TriangleAlert className="h-4 w-4" /> Failed to load funding: {(error as Error)?.message ?? "unknown"}
            </p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No assets match the current filters.</p>
          ) : (
            <div className="custom-scroll max-h-[520px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead className="text-right">Mark</TableHead>
                    <TableHead className="text-right">Funding 1h</TableHead>
                    <TableHead className="text-right">Annualized</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Open interest</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">24h volume</TableHead>
                    <TableHead className="text-right">Journal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.asset}>
                      <TableCell>
                        <div className="font-medium">{r.asset}</div>
                        <div className="mono text-[11px] text-muted-foreground">
                          {r.change24hPct != null ? `${r.change24hPct >= 0 ? "+" : ""}${r.change24hPct.toFixed(1)}% 24h` : "—"}
                        </div>
                      </TableCell>
                      <TableCell className="mono text-right tabular">{r.markPx != null ? `$${px(r.markPx)}` : "—"}</TableCell>
                      <TableCell className="mono text-right tabular">{(r.funding1hPct * 100).toFixed(4)}%</TableCell>
                      <TableCell className={cn("mono text-right font-semibold tabular", r.fundingAnnualPct >= 0 ? "text-success" : "text-warning")}>
                        {r.fundingAnnualPct >= 0 ? "+" : ""}{r.fundingAnnualPct.toFixed(1)}%
                        <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">{r.carrySide}s collect</span>
                      </TableCell>
                      <TableCell className="mono hidden text-right tabular md:table-cell">{r.openInterestUsd != null ? usdCompact(r.openInterestUsd) : "—"}</TableCell>
                      <TableCell className="mono hidden text-right tabular lg:table-cell">{r.dayVolumeUsd != null ? usdCompact(r.dayVolumeUsd) : "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onJournal(r)}>
                          <Plus className="mr-1 h-3 w-3" /> Setup
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — AlphaChaser bot
// ---------------------------------------------------------------------------

function BotTab() {
  const { data, isLoading } = useBotSignals();
  const scan = useScanAlphaChaser();
  const update = useUpdateSignal();
  const remove = useDeleteSignal();
  const [focus, setFocus] = useState("");

  const signals = data?.signals ?? [];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <Bot className="h-4 w-4 text-primary" /> AlphaChaser scanner
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                One AI pass over funding extremes, live prices and your own journal edge. Produces
                0-3 setups with strict level validation — it never trades.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div className="w-[220px] space-y-1">
                <Label htmlFor="scan-focus" className="text-[11px] text-muted-foreground">Focus (optional)</Label>
                <Input id="scan-focus" placeholder="e.g. only TAO and majors" value={focus} onChange={(e) => setFocus(e.target.value)} className="h-8 text-xs" />
              </div>
              <Button size="sm" className="h-8 text-xs" onClick={() => scan.mutate(focus.trim() || undefined)} disabled={scan.isPending}>
                <Sparkles className={cn("mr-1 h-3 w-3", scan.isPending && "animate-pulse")} />
                {scan.isPending ? "Scanning…" : "Run scan"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {scan.data && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
              <p className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                Scan complete — {scan.data.created} signal{scan.data.created === 1 ? "" : "s"} added
                {scan.data.rejected.length > 0 ? `, ${scan.data.rejected.length} rejected by validation` : ""}
              </p>
              {scan.data.rejected.length > 0 && (
                <ul className="mono mt-1 list-inside list-disc text-[10px] text-muted-foreground">
                  {scan.data.rejected.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
              <p className="mono mt-1 text-[10px] text-muted-foreground">
                digest: {scan.data.digestMeta.fundingRows} funding rows · {scan.data.digestMeta.pricedSymbols} priced symbols ·
                {" "}journal edge {scan.data.digestMeta.journal.winRatePct != null ? `${scan.data.digestMeta.journal.winRatePct}% win / ${scan.data.digestMeta.journal.avgR}R avg` : "no closed trades yet"}
              </p>
            </div>
          )}
          {scan.isError && (
            <p className="text-xs text-destructive">{(scan.error as Error)?.message}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Fresh signals" value={String(data?.counts.fresh ?? 0)} icon={Sparkles} accent="text-success" />
        <KpiCard label="Taken" value={String(data?.counts.taken ?? 0)} icon={CheckCircle2} />
        <KpiCard label="Expired" value={String(data?.counts.expired ?? 0)} icon={CircleDashed} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold tracking-tight">Signal inbox</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : signals.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Inbox empty. Run a scan — setups that pass level validation (R:R ≥ 1.5, entry within
              3% of mark) land here.
            </p>
          ) : (
            <div className="space-y-2.5">
              {signals.map((s) => {
                const long = s.signal === "LONG";
                return (
                  <div key={s.id} className={cn("rounded-lg border border-border/60 p-3.5", s.status === "expired" && "opacity-50")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={cn("mono text-[10px]", long ? "text-success border-success/40" : s.signal === "SHORT" ? "text-destructive border-destructive/40" : "text-muted-foreground")}>
                          {long ? <ArrowUpRight className="mr-0.5 h-3 w-3" /> : s.signal === "SHORT" ? <ArrowDownRight className="mr-0.5 h-3 w-3" /> : null}
                          {s.signal}
                        </Badge>
                        <span className="text-display text-sm font-bold tracking-tight">{s.pair}</span>
                        {s.confidence != null && (
                          <Badge variant="outline" className="text-[10px]">{Math.round(s.confidence)}% conf</Badge>
                        )}
                        {s.timeframe && <span className="mono text-[10px] text-muted-foreground">{s.timeframe}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        {s.status === "new" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={update.isPending} onClick={() => update.mutate({ id: s.id, status: "taken" })}>
                              Taken
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground" disabled={update.isPending} onClick={() => update.mutate({ id: s.id, status: "expired" })}>
                              Expire
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" aria-label={`Delete ${s.pair} signal`} disabled={remove.isPending} onClick={() => remove.mutate(s.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {s.entry != null && (
                      <div className="mono mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] tabular text-muted-foreground">
                        <span>entry <span className="text-foreground">{px(s.entry)}</span></span>
                        {s.stop != null && <span>stop <span className="text-destructive">{px(s.stop)}</span></span>}
                        {s.target != null && <span>target <span className="text-success">{px(s.target)}</span></span>}
                        {s.entry > 0 && s.stop != null && s.target != null && (
                          <span>
                            R:R <span className="text-foreground">{(Math.abs(s.target - s.entry) / Math.max(Math.abs(s.entry - s.stop), 1e-12)).toFixed(2)}</span>
                          </span>
                        )}
                      </div>
                    )}
                    {s.rationale && <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">{s.rationale}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
  icon: typeof Crosshair;
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

export function CaptureView() {
  const [journalPreset, setJournalPreset] = useState<Parameters<typeof NewTradeDialog>[0]["preset"] | undefined>();
  const [journalOpen, setJournalOpen] = useState(false);

  const handleJournal = (row: FundingRow) => {
    const t = fundingToTradeInput(row);
    setJournalPreset({
      pair: t.pair,
      direction: t.direction,
      entry: String(t.entry ?? ""),
      stop: String(t.stop ?? ""),
      target: String(t.target ?? ""),
      timeframe: t.timeframe ?? "",
      notes: t.notes ?? "",
    });
    setJournalOpen(true);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="journal">
        <TabsList className="mb-4">
          <TabsTrigger value="journal" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" /> Trade Journal
          </TabsTrigger>
          <TabsTrigger value="funding" className="gap-1.5">
            <Percent className="h-3.5 w-3.5" /> Funding Scanner
          </TabsTrigger>
          <TabsTrigger value="bot" className="gap-1.5">
            <Bot className="h-3.5 w-3.5" /> AlphaChaser
          </TabsTrigger>
        </TabsList>
        <TabsContent value="journal"><JournalTab /></TabsContent>
        <TabsContent value="funding"><FundingTab onJournal={handleJournal} /></TabsContent>
        <TabsContent value="bot"><BotTab /></TabsContent>
      </Tabs>

      <NewTradeDialog
        key={journalPreset ? JSON.stringify(journalPreset) : "blank"}
        open={journalOpen}
        onClose={() => setJournalOpen(false)}
        preset={journalPreset}
      />
    </div>
  );
}
