"use client";

// WEALTH-3 — Engine 01 · INVEST view: written theses with AI research briefs,
// a live-priced watchlist, portfolio allocation, and the asymmetric bet book.
// All rows are operator bookkeeping — the platform never places orders.

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
  useTheses,
  useCreateThesis,
  useUpdateThesis,
  useDeleteThesis,
  useGenerateBrief,
  useWatchlist,
  useAddWatch,
  useDeleteWatch,
  useHoldings,
  useUpsertHolding,
  useDeleteHolding,
  useBets,
  useCreateBet,
  useUpdateBet,
  useDeleteBet,
  type Thesis,
} from "@/hooks/use-invest";
import { cn } from "@/lib/utils";
import {
  Brain,
  Eye,
  Scale,
  Zap,
  Plus,
  X,
  Sparkles,
  TrendingUp,
  TrendingDown,
  TriangleAlert,
  Bell,
  RefreshCw,
  PieChart,
} from "lucide-react";

const usd = (n: number, digits = 0) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const pct = (n: number, digits = 2) => `${n.toFixed(digits)}%`;
const px = (n: number) =>
  n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n >= 1 ? n.toFixed(3) : n.toFixed(6);

function parseList(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

const convictionClass: Record<string, string> = {
  HIGH: "text-success border-success/40",
  MEDIUM: "text-primary border-primary/40",
  LOW: "text-warning border-warning/40",
};

const statusClass: Record<string, string> = {
  active: "text-success",
  monitoring: "text-warning",
  won: "text-success",
  lost: "text-destructive",
  closed: "text-muted-foreground",
};

// ---------------------------------------------------------------------------
// Tab 1 — Theses
// ---------------------------------------------------------------------------

function ThesesTab() {
  const { data, isLoading } = useTheses();
  const [creating, setCreating] = useState(false);
  const [briefFor, setBriefFor] = useState<Thesis | null>(null);

  const theses = data?.theses ?? [];
  const counts = data?.counts;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Active theses" value={String(counts?.active ?? 0)} icon={Brain} />
        <KpiCard label="Monitoring" value={String(counts?.monitoring ?? 0)} icon={Eye} />
        <KpiCard
          label="High conviction"
          value={String(theses.filter((t) => t.conviction === "HIGH" && t.status === "active").length)}
          icon={Zap}
          accent="text-success"
        />
        <KpiCard
          label="Closed W/L"
          value={`${counts?.won ?? 0} / ${counts?.lost ?? 0}`}
          icon={Scale}
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Written judgment records — each thesis pairs your argument with live numbers and an AI
          stress-test. Bookkeeping only; nothing here places orders.
        </p>
        <Button size="sm" className="h-8 shrink-0 text-xs" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-3 w-3" /> New thesis
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : theses.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No theses yet. Write your first one — even two sentences — then let the AI brief
            stress-test it against the numbers.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {theses.map((t) => (
            <ThesisCard key={t.id} thesis={t} onBrief={() => setBriefFor(t)} />
          ))}
        </div>
      )}

      <NewThesisDialog open={creating} onClose={() => setCreating(false)} />
      <BriefDialog thesis={briefFor} onClose={() => setBriefFor(null)} />
    </div>
  );
}

function ThesisCard({ thesis: t, onBrief }: { thesis: Thesis; onBrief: () => void }) {
  const update = useUpdateThesis();
  const remove = useDeleteThesis();
  const catalysts = parseList(t.catalystsJson);
  const risks = parseList(t.risksJson);
  const long = t.direction === "LONG";

  return (
    <Card className={t.status === "closed" || t.status === "lost" ? "opacity-60" : undefined}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-display text-base font-bold tracking-tight">{t.asset}</span>
            <Badge
              variant="outline"
              className={cn("mono text-[10px]", long ? "text-success border-success/40" : "text-destructive border-destructive/40")}
            >
              {long ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
              {t.direction}
            </Badge>
            <Badge variant="outline" className={cn("text-[10px]", convictionClass[t.conviction])}>
              {t.conviction}
            </Badge>
            <span className={cn("mono text-[10px]", statusClass[t.status])}>{t.status}</span>
          </div>
          <Select value={t.status} onValueChange={(v) => update.mutate({ id: t.id, status: v })}>
            <SelectTrigger className="h-7 w-[120px] text-[11px]" aria-label="Thesis status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="monitoring">Monitoring</SelectItem>
              <SelectItem value="won">Won</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="mono text-[11px] text-muted-foreground">{t.timeframe}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-4 gap-2 rounded-lg border border-border/60 p-2.5">
          <Num label="Entry" value={t.entryPrice != null ? `$${px(t.entryPrice)}` : "—"} />
          <Num
            label="Live"
            value={t.livePrice != null ? `$${px(t.livePrice)}` : "—"}
            accent={
              t.change24h != null ? (t.change24h >= 0 ? "text-success" : "text-destructive") : undefined
            }
            sub={t.change24h != null ? `${t.change24h >= 0 ? "+" : ""}${t.change24h.toFixed(1)}% 24h` : undefined}
          />
          <Num label="Target" value={t.targetPrice != null ? `$${px(t.targetPrice)}` : "—"} accent="text-success"
            sub={t.toTargetPct != null ? `${t.toTargetPct > 0 ? "+" : ""}${t.toTargetPct}%` : undefined} />
          <Num label="Stop" value={t.stopPrice != null ? `$${px(t.stopPrice)}` : "—"} accent="text-destructive"
            sub={t.toStopPct != null ? `${t.toStopPct}%` : undefined} />
        </div>

        {t.thesis && <p className="line-clamp-3 text-xs leading-relaxed text-foreground/85">{t.thesis}</p>}

        {(catalysts.length > 0 || risks.length > 0) && (
          <div className="space-y-1.5">
            {catalysts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {catalysts.slice(0, 4).map((c, i) => (
                  <Badge key={i} variant="outline" className="max-w-full truncate text-[10px] text-success">
                    ▲ {c}
                  </Badge>
                ))}
              </div>
            )}
            {risks.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {risks.slice(0, 4).map((r, i) => (
                  <Badge key={i} variant="outline" className="max-w-full truncate text-[10px] text-warning">
                    ▼ {r}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onBrief}>
            <Sparkles className="mr-1 h-3 w-3 text-primary" />
            {t.hasBrief ? "View AI brief" : "Generate AI brief"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${t.asset} thesis`}
            disabled={remove.isPending}
            onClick={() => remove.mutate(t.id)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Num({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-eyebrow truncate text-muted-foreground">{label}</p>
      <p className={cn("mono truncate text-sm font-semibold tabular", accent)}>{value}</p>
      {sub && <p className="mono truncate text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function NewThesisDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateThesis();
  const [asset, setAsset] = useState("");
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG");
  const [conviction, setConviction] = useState<"HIGH" | "MEDIUM" | "LOW">("MEDIUM");
  const [timeframe, setTimeframe] = useState("6-12 months");
  const [entry, setEntry] = useState("");
  const [target, setTarget] = useState("");
  const [stop, setStop] = useState("");
  const [thesis, setThesis] = useState("");
  const [catalysts, setCatalysts] = useState("");
  const [risks, setRisks] = useState("");

  const submit = () => {
    if (!asset.trim()) return;
    create.mutate(
      {
        asset: asset.trim(),
        direction,
        conviction,
        timeframe,
        entryPrice: entry ? Number(entry) : null,
        targetPrice: target ? Number(target) : null,
        stopPrice: stop ? Number(stop) : null,
        thesis,
        catalysts,
        risks,
      },
      {
        onSuccess: () => {
          setAsset(""); setEntry(""); setTarget(""); setStop(""); setThesis(""); setCatalysts(""); setRisks("");
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New investment thesis</DialogTitle>
          <DialogDescription>
            Entry price left blank is snapshotted from the live feed. Catalysts and risks accept
            comma or newline separated lists.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="th-asset">Asset</Label>
            <Input id="th-asset" placeholder="TAO, BTC, SN82-ALPHA…" value={asset} onChange={(e) => setAsset(e.target.value)} className="h-8 text-xs" />
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
            <Label>Conviction</Label>
            <Select value={conviction} onValueChange={(v) => setConviction(v as "HIGH" | "MEDIUM" | "LOW")}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="th-tf">Timeframe</Label>
            <Input id="th-tf" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="th-entry">Entry (blank = live)</Label>
            <Input id="th-entry" type="number" value={entry} onChange={(e) => setEntry(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="th-target">Target</Label>
            <Input id="th-target" type="number" value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="th-stop">Stop</Label>
            <Input id="th-stop" type="number" value={stop} onChange={(e) => setStop(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="th-body">Core argument</Label>
          <Textarea id="th-body" rows={3} placeholder="Why does this win? What does the market misprice?" value={thesis} onChange={(e) => setThesis(e.target.value)} className="text-xs" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="th-cat">Catalysts</Label>
            <Textarea id="th-cat" rows={2} placeholder="Halving flow…&#10;Emission shift…" value={catalysts} onChange={(e) => setCatalysts(e.target.value)} className="text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="th-risk">Risks</Label>
            <Textarea id="th-risk" rows={2} placeholder="Illiquidity…&#10;Validator concentration…" value={risks} onChange={(e) => setRisks(e.target.value)} className="text-xs" />
          </div>
        </div>
        {create.isError && <p className="text-xs text-destructive">{(create.error as Error)?.message}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || !asset.trim()}>
            {create.isPending ? "Saving…" : "Save thesis"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BriefDialog({ thesis, onClose }: { thesis: Thesis | null; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const brief = useGenerateBrief();
  const text = brief.data?.brief ?? thesis?.aiBrief ?? null;

  const run = () => {
    if (!thesis) return;
    brief.mutate({ id: thesis.id, question: question.trim() || undefined });
  };

  return (
    <Dialog open={!!thesis} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            AI research brief {thesis ? `· ${thesis.asset} ${thesis.direction}` : ""}
          </DialogTitle>
          <DialogDescription>
            One LLM pass over your written thesis plus live numbers. It uses only the data provided
            — treat it as a stress-test, not a forecast.
          </DialogDescription>
        </DialogHeader>
        {text ? (
          <pre className="custom-scroll max-h-[45vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/30 p-4 text-xs leading-relaxed">
            {text}
          </pre>
        ) : (
          <p className="py-4 text-sm text-muted-foreground">No brief yet — generate the first one below.</p>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="brief-q">Ask something specific (optional)</Label>
            <Input
              id="brief-q"
              placeholder="e.g. is my stop too tight for weekly volatility?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <Button size="sm" className="h-8 text-xs" onClick={run} disabled={brief.isPending || !thesis}>
            <RefreshCw className={cn("mr-1 h-3 w-3", brief.isPending && "animate-spin")} />
            {brief.isPending ? "Writing…" : text ? "Regenerate" : "Generate"}
          </Button>
        </div>
        {brief.isError && <p className="text-xs text-destructive">{(brief.error as Error)?.message}</p>}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — Watchlist
// ---------------------------------------------------------------------------

function WatchlistTab() {
  const { data, isLoading } = useWatchlist();
  const add = useAddWatch();
  const remove = useDeleteWatch();
  const [symbol, setSymbol] = useState("");
  const [above, setAbove] = useState("");
  const [below, setBelow] = useState("");

  const submit = () => {
    if (!symbol.trim()) return;
    add.mutate(
      {
        symbol: symbol.trim(),
        alertAbove: above ? Number(above) : null,
        alertBelow: below ? Number(below) : null,
      },
      { onSuccess: () => { setSymbol(""); setAbove(""); setBelow(""); } }
    );
  };

  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Watched" value={String(items.length)} icon={Eye} />
        <KpiCard
          label="Alerts triggered"
          value={String(data?.alerts ?? 0)}
          icon={Bell}
          accent={data?.alerts ? "text-warning" : undefined}
        />
        <KpiCard
          label="Movers 24h"
          value={
            items.some((i) => (i.change24h ?? 0) >= 5)
              ? `+${Math.max(...items.map((i) => i.change24h ?? 0)).toFixed(1)}%`
              : items.length
                ? `${Math.min(...items.map((i) => i.change24h ?? 0)).toFixed(1)}% best`
                : "—"
          }
          icon={TrendingUp}
          sub={items.length ? `worst ${Math.min(...items.map((i) => i.change24h ?? 0)).toFixed(1)}%` : undefined}
        />
        <KpiCard label="Source" value="Binance / CG" sub="key-free public feeds" icon={RefreshCw} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold tracking-tight">Watchlist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-[130px] space-y-1">
              <Label htmlFor="wl-symbol" className="text-[11px] text-muted-foreground">Symbol</Label>
              <Input id="wl-symbol" placeholder="TAO" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="h-8 text-xs" onKeyDown={(e) => e.key === "Enter" && submit()} />
            </div>
            <div className="w-[120px] space-y-1">
              <Label htmlFor="wl-above" className="text-[11px] text-muted-foreground">Alert above</Label>
              <Input id="wl-above" type="number" placeholder="—" value={above} onChange={(e) => setAbove(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="w-[120px] space-y-1">
              <Label htmlFor="wl-below" className="text-[11px] text-muted-foreground">Alert below</Label>
              <Input id="wl-below" type="number" placeholder="—" value={below} onChange={(e) => setBelow(e.target.value)} className="h-8 text-xs" />
            </div>
            <Button size="sm" className="h-8 text-xs" onClick={submit} disabled={add.isPending || !symbol.trim()}>
              <Plus className="mr-1 h-3 w-3" /> {add.isPending ? "Adding…" : "Add"}
            </Button>
            {add.isError && <p className="text-xs text-destructive">{(add.error as Error)?.message}</p>}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Nothing watched yet. Add a symbol — prices refresh live and alerts flag when levels
              are crossed.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">24h</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Alert above</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Alert below</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Remove</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>
                      <div className="font-medium">{w.symbol}</div>
                      {w.name && <div className="text-[11px] text-muted-foreground">{w.name}</div>}
                    </TableCell>
                    <TableCell className="mono text-right tabular">
                      {w.price != null ? `$${px(w.price)}` : "—"}
                      {w.stalePrice && <span className="ml-1 text-[10px] text-warning" title="price stale">≈</span>}
                    </TableCell>
                    <TableCell className={cn("mono text-right tabular", (w.change24h ?? 0) >= 0 ? "text-success" : "text-destructive")}>
                      {w.change24h != null ? `${w.change24h >= 0 ? "+" : ""}${w.change24h.toFixed(2)}%` : "—"}
                    </TableCell>
                    <TableCell className="mono hidden text-right tabular md:table-cell">{w.alertAbove != null ? `$${px(w.alertAbove)}` : "—"}</TableCell>
                    <TableCell className="mono hidden text-right tabular md:table-cell">{w.alertBelow != null ? `$${px(w.alertBelow)}` : "—"}</TableCell>
                    <TableCell>
                      {w.alertStatus === "above" ? (
                        <Badge variant="outline" className="text-[10px] text-warning"><TriangleAlert className="mr-1 h-3 w-3" />above</Badge>
                      ) : w.alertStatus === "below" ? (
                        <Badge variant="outline" className="text-[10px] text-warning"><TriangleAlert className="mr-1 h-3 w-3" />below</Badge>
                      ) : w.alertStatus === "ok" ? (
                        <Badge variant="outline" className="text-[10px] text-success">in range</Badge>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">no price</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" aria-label={`Remove ${w.symbol}`} disabled={remove.isPending} onClick={() => remove.mutate(w.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — Allocation
// ---------------------------------------------------------------------------

function AllocationTab() {
  const { data, isLoading } = useHoldings();
  const upsert = useUpsertHolding();
  const remove = useDeleteHolding();
  const [adding, setAdding] = useState(false);

  const holdings = data?.holdings ?? [];
  const totals = data?.totals;
  const maxWeight = Math.max(...holdings.map((h) => h.weightPct ?? 0), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Portfolio value" value={usd(totals?.valueUsd ?? 0)} icon={PieChart} />
        <KpiCard
          label="Unrealized P&L"
          value={`${(totals?.pnlUsd ?? 0) >= 0 ? "+" : ""}${usd(totals?.pnlUsd ?? 0)}`}
          sub={totals ? pct(totals.pnlPct) : undefined}
          accent={(totals?.pnlUsd ?? 0) >= 0 ? "text-success" : "text-destructive"}
          icon={TrendingUp}
        />
        <KpiCard label="Cost basis" value={usd(totals?.costUsd ?? 0)} icon={Scale} />
        <KpiCard
          label="Top weight"
          value={totals?.topWeights?.[0] ? `${totals.topWeights[0].symbol} ${totals.topWeights[0].weightPct}%` : "—"}
          sub={totals?.unpriced?.length ? `unpriced: ${totals.unpriced.join(", ")}` : "all priced"}
          icon={Eye}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold tracking-tight">Holdings &amp; allocation</CardTitle>
            <Button size="sm" className="h-8 text-xs" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-3 w-3" /> Add holding
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : holdings.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No holdings tracked. Add what you own (quantity + average cost) to see live
              allocation weights and unrealized P&L.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Avg cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                  <TableHead className="hidden w-[140px] lg:table-cell">Weight</TableHead>
                  <TableHead className="text-right">Remove</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>
                      <div className="font-medium">{h.symbol}</div>
                      {h.venue && <div className="text-[11px] text-muted-foreground">{h.venue}</div>}
                    </TableCell>
                    <TableCell className="mono text-right tabular">{h.quantity.toLocaleString("en-US", { maximumFractionDigits: 6 })}</TableCell>
                    <TableCell className="mono hidden text-right tabular md:table-cell">${px(h.avgCostUsd)}</TableCell>
                    <TableCell className="mono text-right tabular">{h.price != null ? `$${px(h.price)}` : <span className="text-warning">no feed</span>}</TableCell>
                    <TableCell className="mono text-right font-semibold tabular">{h.valueUsd != null ? usd(h.valueUsd) : "—"}</TableCell>
                    <TableCell className={cn("mono text-right tabular", h.pnlUsd == null ? "" : h.pnlUsd >= 0 ? "text-success" : "text-destructive")}>
                      {h.pnlUsd != null ? `${h.pnlUsd >= 0 ? "+" : ""}${usd(h.pnlUsd)}` : "—"}
                      {h.pnlPct != null && <span className="ml-1 text-[10px] text-muted-foreground">({h.pnlPct >= 0 ? "+" : ""}{h.pnlPct.toFixed(1)}%)</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {h.weightPct != null ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary/60" style={{ width: `${(h.weightPct / maxWeight) * 100}%` }} />
                          </div>
                          <span className="mono w-10 text-right text-[11px] tabular">{h.weightPct.toFixed(1)}%</span>
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" aria-label={`Remove ${h.symbol}`} disabled={remove.isPending} onClick={() => remove.mutate(h.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <NewHoldingDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function NewHoldingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const upsert = useUpsertHolding();
  const [symbol, setSymbol] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [venue, setVenue] = useState("");

  const submit = () => {
    const q = Number(qty), c = Number(cost);
    if (!symbol.trim() || !Number.isFinite(q) || q <= 0 || !Number.isFinite(c) || c < 0) return;
    upsert.mutate(
      { symbol: symbol.trim(), quantity: q, avgCostUsd: c, venue },
      { onSuccess: () => { setSymbol(""); setQty(""); setCost(""); setVenue(""); onClose(); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add holding</DialogTitle>
          <DialogDescription>
            Adding to a symbol you already track merges the position and re-averages the cost basis.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="h-symbol">Symbol</Label>
            <Input id="h-symbol" placeholder="TAO" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="h-qty">Quantity</Label>
            <Input id="h-qty" type="number" min="0" step="any" placeholder="12.5" value={qty} onChange={(e) => setQty(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="h-cost">Avg cost / unit (USD)</Label>
            <Input id="h-cost" type="number" min="0" step="any" placeholder="240" value={cost} onChange={(e) => setCost(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="h-venue">Venue (optional)</Label>
            <Input id="h-venue" placeholder="cold wallet" value={venue} onChange={(e) => setVenue(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>
        {upsert.isError && <p className="text-xs text-destructive">{(upsert.error as Error)?.message}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={upsert.isPending || !symbol.trim() || !qty || !cost}>
            {upsert.isPending ? "Saving…" : "Add holding"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tab 4 — Asymmetric bets
// ---------------------------------------------------------------------------

function BetsTab() {
  const { data, isLoading } = useBets();
  const create = useCreateBet();
  const update = useUpdateBet();
  const remove = useDeleteBet();
  const [adding, setAdding] = useState(false);

  const bets = data?.bets ?? [];
  const totals = data?.totals;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Open bets" value={String(totals?.openCount ?? 0)} icon={Zap} />
        <KpiCard label="Capital at risk" value={usd(totals?.openCapitalUsd ?? 0)} icon={Scale} />
        <KpiCard
          label="Open expectancy"
          value={`${(totals?.openEvUsd ?? 0) >= 0 ? "+" : ""}${usd(totals?.openEvUsd ?? 0)}`}
          sub="sum of bet-level EV"
          accent={(totals?.openEvUsd ?? 0) >= 0 ? "text-success" : "text-destructive"}
          icon={Brain}
        />
        <KpiCard
          label="Realized (settled)"
          value={`${(totals?.realizedUsd ?? 0) >= 0 ? "+" : ""}${usd(totals?.realizedUsd ?? 0)}`}
          sub={totals?.settledCount ? `${totals.settledCount} settled · ${pct(totals.realizedPct, 1)}` : "nothing settled"}
          accent={(totals?.realizedUsd ?? 0) >= 0 ? "text-success" : "text-destructive"}
          icon={TrendingUp}
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Capped downside, fat right tail. EV and Kelly fraction are computed from your own
          estimates — full Kelly shown; half-Kelly is the usual discipline.
        </p>
        <Button size="sm" className="h-8 shrink-0 text-xs" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-3 w-3" /> New bet
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : bets.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No asymmetric bets logged. Structure one: small capital, hard downside cap, multiple-x
            upside — the EV math keeps you honest.
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bet</TableHead>
              <TableHead className="text-right">Capital</TableHead>
              <TableHead className="hidden text-right md:table-cell">Up / Down</TableHead>
              <TableHead className="text-right">Win p</TableHead>
              <TableHead className="text-right">EV</TableHead>
              <TableHead className="hidden text-right md:table-cell">Kelly</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Remove</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bets.map((b) => (
              <TableRow key={b.id} className={b.status !== "open" ? "opacity-60" : undefined}>
                <TableCell>
                  <div className="font-medium">{b.name}</div>
                  <div className="mono text-[11px] text-muted-foreground">{b.asset} · {b.vehicle}</div>
                </TableCell>
                <TableCell className="mono text-right tabular">{usd(b.capitalUsd)}</TableCell>
                <TableCell className="mono hidden text-right tabular md:table-cell">
                  <span className="text-success">{b.upsideMultiple}x</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-destructive">-{b.downsidePercent}%</span>
                </TableCell>
                <TableCell className="mono text-right tabular">{b.winProbability}%</TableCell>
                <TableCell className={cn("mono text-right font-semibold tabular", b.evUsd >= 0 ? "text-success" : "text-destructive")}>
                  {b.evUsd >= 0 ? "+" : ""}{usd(b.evUsd)}
                </TableCell>
                <TableCell className="mono hidden text-right tabular md:table-cell">{b.kellyPct}%</TableCell>
                <TableCell>
                  {b.status === "open" ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 text-[11px] text-success" disabled={update.isPending} onClick={() => update.mutate({ id: b.id, status: "won" })}>Won</Button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px] text-destructive" disabled={update.isPending} onClick={() => update.mutate({ id: b.id, status: "lost" })}>Lost</Button>
                    </div>
                  ) : (
                    <span className={cn("mono text-[11px]", statusClass[b.status])}>{b.status}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" aria-label={`Remove ${b.name}`} disabled={remove.isPending} onClick={() => remove.mutate(b.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <NewBetDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function NewBetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateBet();
  const [name, setName] = useState("");
  const [asset, setAsset] = useState("");
  const [vehicle, setVehicle] = useState("Spot");
  const [capital, setCapital] = useState("");
  const [upside, setUpside] = useState("5");
  const [downside, setDownside] = useState("100");
  const [prob, setProb] = useState("30");
  const [notes, setNotes] = useState("");

  const submit = () => {
    const cap = Number(capital);
    if (!name.trim() || !asset.trim() || !Number.isFinite(cap) || cap <= 0) return;
    create.mutate(
      {
        name: name.trim(),
        asset: asset.trim(),
        vehicle,
        capitalUsd: cap,
        upsideMultiple: Number(upside) || 5,
        downsidePercent: Number(downside) || 100,
        winProbability: Number(prob) || 30,
        notes,
      },
      {
        onSuccess: () => {
          setName(""); setAsset(""); setCapital(""); setNotes("");
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New asymmetric bet</DialogTitle>
          <DialogDescription>
            Small capital, capped downside, right-tail upside. EV updates server-side the moment
            you save.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="b-name">Bet name</Label>
            <Input id="b-name" placeholder="SN82 pre-registration punt" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="b-asset">Asset</Label>
            <Input id="b-asset" placeholder="TAO" value={asset} onChange={(e) => setAsset(e.target.value.toUpperCase())} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label>Vehicle</Label>
            <Select value={vehicle} onValueChange={setVehicle}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Spot">Spot</SelectItem>
                <SelectItem value="Perp">Perp</SelectItem>
                <SelectItem value="Option">Option</SelectItem>
                <SelectItem value="LP">LP</SelectItem>
                <SelectItem value="Pre-launch">Pre-launch</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="b-capital">Capital (USD)</Label>
            <Input id="b-capital" type="number" min="1" placeholder="500" value={capital} onChange={(e) => setCapital(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="b-up">Upside target (x)</Label>
            <Input id="b-up" type="number" step="any" min="1.1" value={upside} onChange={(e) => setUpside(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="b-down">Downside (% lost)</Label>
            <Input id="b-down" type="number" min="1" max="100" value={downside} onChange={(e) => setDownside(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="b-prob">Win probability (%)</Label>
            <Input id="b-prob" type="number" min="0" max="100" value={prob} onChange={(e) => setProb(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="b-notes">Notes (optional)</Label>
            <Input id="b-notes" placeholder="why this is mispriced…" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>
        {create.isError && <p className="text-xs text-destructive">{(create.error as Error)?.message}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || !name.trim() || !asset.trim() || !capital}>
            {create.isPending ? "Saving…" : "Log bet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  icon: typeof Brain;
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

export function InvestView() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="theses">
        <TabsList className="mb-4">
          <TabsTrigger value="theses" className="gap-1.5">
            <Brain className="h-3.5 w-3.5" /> Theses
          </TabsTrigger>
          <TabsTrigger value="watchlist" className="gap-1.5">
            <Eye className="h-3.5 w-3.5" /> Watchlist
          </TabsTrigger>
          <TabsTrigger value="allocation" className="gap-1.5">
            <PieChart className="h-3.5 w-3.5" /> Allocation
          </TabsTrigger>
          <TabsTrigger value="asymmetric" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Asymmetric
          </TabsTrigger>
        </TabsList>
        <TabsContent value="theses"><ThesesTab /></TabsContent>
        <TabsContent value="watchlist"><WatchlistTab /></TabsContent>
        <TabsContent value="allocation"><AllocationTab /></TabsContent>
        <TabsContent value="asymmetric"><BetsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
