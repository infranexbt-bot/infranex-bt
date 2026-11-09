"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Flame,
  Loader2,
  Scale,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGpuDecision } from "@/hooks/use-gpu-decision";
import type { DecisionCardRow, DecisionSubnet } from "@/lib/infranex/gpu-decision";

// ---------------------------------------------------------------------------
// GPU BUY DECISION PANEL — "which GPU should I BUY?" with money attached.
//
// Pool ≠ earnings: the engine converts each subnet's chain-measured pool
// into a new-entrant EXPECTED VALUE (P(earning) × payout-if-earning) and
// prices it against street hardware, power and the Vast rental alternative.
// Every assumption is a slider — the table re-ranks instantly.
// ---------------------------------------------------------------------------

interface Assumptions {
  taoUsd: number;
  kwh: number;
  basis: "used" | "new";
  median: number; // medianFactor 0.05–1
  boost: number; // skillBoost 0.25–3
  targetTaoMo: number;
}

interface SubnetEcon {
  s: DecisionSubnet;
  pEarn: number;
  payoutTaoDay: number;
  evTaoMo: number;
  grossUsdMo: number;
  powerUsdMo: number;
  netUsdMo: number;
  capexUsd: number;
  paybackMo: number | null;
  rentUsdMo: number;
  rentMarginUsdMo: number;
}

type VerdictKey = "STRONG BUY" | "BUY" | "MARGINAL" | "RENT, DON'T BUY" | "AVOID" | "NO PATH";

const VERDICT_META: Record<VerdictKey, { chip: string; icon: typeof TrendingUp }> = {
  "STRONG BUY": { chip: "border-success/60 bg-success/10 text-success", icon: Sparkles },
  BUY: { chip: "border-success/40 bg-success/5 text-success", icon: TrendingUp },
  MARGINAL: { chip: "border-warning/50 bg-warning/10 text-warning", icon: AlertTriangle },
  "RENT, DON'T BUY": { chip: "border-primary/50 bg-primary/10 text-primary", icon: CircleDollarSign },
  AVOID: { chip: "border-destructive/50 bg-destructive/10 text-destructive", icon: ShieldAlert },
  "NO PATH": { chip: "border-border bg-card/60 text-muted-foreground", icon: TrendingDown },
};

const VERDICT_ORDER: VerdictKey[] = [
  "STRONG BUY", "BUY", "MARGINAL", "RENT, DON'T BUY", "AVOID", "NO PATH",
];

function fmtUsd(n: number, digits = 0): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: digits })}`;
}
function fmtN(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

/** New-entrant EV economics for one (card, subnet) under the sliders. */
function subnetEcon(card: DecisionCardRow, s: DecisionSubnet, a: Assumptions): SubnetEcon | null {
  const pool = s.poolTaoPerDay ?? 0;
  const rew = s.rewardedMiners ?? 0;
  const reg = s.minersCount ?? 0;
  if (pool <= 0 || rew <= 0 || reg <= 0) return null;
  const pEarn = Math.min(0.9, (s.rewardedRatio ?? 0) * a.boost);
  const payoutTaoDay = (pool * s.realizability) / (rew + 1) * a.median;
  const evTaoMo = pEarn * payoutTaoDay * 30;
  const grossUsdMo = evTaoMo * a.taoUsd;
  const powerUsdMo = (card.tdpW / 1000) * 720 * a.kwh * s.count;
  const netUsdMo = grossUsdMo - powerUsdMo;
  const unitPrice = a.basis === "used" ? card.priceUsedUsd : card.priceNewUsd;
  const capexUsd = unitPrice * s.count;
  const paybackMo = netUsdMo > 0 ? capexUsd / netUsdMo : null;
  const rentUsdMo = card.vastUsdHr * 720 * s.count;
  const rentMarginUsdMo = grossUsdMo - powerUsdMo - rentUsdMo;
  return { s, pEarn, payoutTaoDay, evTaoMo, grossUsdMo, powerUsdMo, netUsdMo, capexUsd, paybackMo, rentUsdMo, rentMarginUsdMo };
}

function verdictFor(e: SubnetEcon, targetTaoMo: number): VerdictKey {
  if (e.evTaoMo <= 0 || e.netUsdMo <= 0) {
    return e.rentMarginUsdMo > 0 ? "RENT, DON'T BUY" : "AVOID";
  }
  if (e.paybackMo != null && e.paybackMo <= 12 && e.evTaoMo >= targetTaoMo) return "STRONG BUY";
  if (e.paybackMo != null && e.paybackMo <= 24) return "BUY";
  if (e.rentMarginUsdMo > 0) return "RENT, DON'T BUY";
  if (e.paybackMo != null && e.paybackMo <= 60) return "MARGINAL";
  return "AVOID";
}

function VerdictChip({ v, className }: { v: VerdictKey; className?: string }) {
  const meta = VERDICT_META[v];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap", meta.chip, className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {v}
    </span>
  );
}

function TeeChip({ tee, locked }: { tee: string; locked: number }) {
  const conf =
    tee === "yes"
      ? "border-success/40 text-success"
      : tee === "unverified"
        ? "border-warning/40 text-warning"
        : "border-border text-muted-foreground";
  const label = tee === "yes" ? "TEE ✓" : tee === "unverified" ? "TEE?" : "no TEE";
  return (
    <span
      title={locked > 0 ? `${locked} TEE-gated subnet${locked > 1 ? "s" : ""} locked out for this card` : "TEE support"}
      className={cn("inline-flex items-center rounded border px-1 py-0.5 text-[9px] font-semibold", conf)}
    >
      {label}{locked > 0 ? ` · −${locked}` : ""}
    </span>
  );
}

function DiffChip({ d }: { d: string | null }) {
  if (!d) return <span className="text-[10px] text-muted-foreground">—</span>;
  const conf =
    d === "EASY" ? "border-success/40 text-success"
      : d === "MODERATE" ? "border-warning/40 text-warning"
        : d === "DIFFICULT" ? "border-destructive/40 text-destructive"
          : "border-border text-muted-foreground";
  return <span className={cn("rounded border px-1 py-0.5 text-[9px] font-semibold", conf)}>{d}</span>;
}

function ClsChip({ c }: { c: string | null }) {
  if (!c) return <span className="text-[10px] text-muted-foreground">—</span>;
  const conf =
    c === "SCALE" ? "border-success/40 text-success"
      : c === "TEST" ? "border-warning/40 text-warning"
        : c === "AVOID" ? "border-destructive/40 text-destructive"
          : "border-border text-muted-foreground";
  return <span className={cn("rounded border px-1 py-0.5 text-[9px] font-semibold", conf)}>{c}</span>;
}

interface CardAgg {
  card: DecisionCardRow;
  rows: SubnetEcon[];
  best: SubnetEcon | null;
  bestVerdict: VerdictKey;
  /** best path that is NOT classified AVOID (fallback for the answer strip). */
  bestSane: SubnetEcon | null;
}

function aggregate(cards: DecisionCardRow[], a: Assumptions): CardAgg[] {
  return cards.map((card) => {
    const rows = card.subnets
      .map((s) => subnetEcon(card, s, a))
      .filter((e): e is SubnetEcon => e !== null)
      .sort((x, y) => y.netUsdMo - x.netUsdMo);
    const best = rows[0] ?? null;
    const bestVerdict = best ? verdictFor(best, a.targetTaoMo) : "NO PATH";
    const sane = rows.filter((r) => r.s.classification !== "AVOID");
    const bestSane = sane[0] ?? best;
    return { card, rows, best, bestVerdict, bestSane };
  });
}

export function GpuDecisionView() {
  const { data, isLoading, isError, error, dataUpdatedAt } = useGpuDecision();
  const [assumedTao, setAssumedTao] = useState<number | null>(null);
  const [kwh, setKwh] = useState<number | null>(null);
  const [basis, setBasis] = useState<"used" | "new">("used");
  const [median, setMedian] = useState(0.35);
  const [boost, setBoost] = useState(1);
  const [targetTaoMo, setTargetTaoMo] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Derived assumption values: user overrides win; otherwise seed from the
  // live platform snapshot. No effect needed — recomputed on every render.
  const effTao = assumedTao ?? (data && data.meta.taoPriceUsd > 0 ? data.meta.taoPriceUsd : 0);
  const effKwh = kwh ?? data?.meta.electricityUsdPerKwh ?? 0.12;
  const effTarget = targetTaoMo ?? (data ? data.meta.targetTaoPerMonth || 2 : 2);

  const a: Assumptions | null = useMemo(() => {
    if (!data || effTao <= 0 || effKwh <= 0) return null;
    return { taoUsd: effTao, kwh: effKwh, basis, median, boost, targetTaoMo: effTarget };
  }, [data, effTao, effKwh, basis, median, boost, effTarget]);

  const aggs = useMemo(
    () => (data && a ? aggregate(data.cards, a) : []),
    [data, a]
  );

  const sorted = useMemo(() => {
    return [...aggs].sort((x, y) => {
      const vx = VERDICT_ORDER.indexOf(x.bestVerdict);
      const vy = VERDICT_ORDER.indexOf(y.bestVerdict);
      if (vx !== vy) return vx - vy;
      return (y.best?.netUsdMo ?? -1) - (x.best?.netUsdMo ?? -1);
    });
  }, [aggs]);

  const strongBuys = sorted.filter((c) => c.bestVerdict === "STRONG BUY");
  const rentInstead = sorted.filter((c) => c.bestVerdict === "RENT, DON'T BUY");
  const avoids = sorted.filter((c) => c.bestVerdict === "AVOID");

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading live chain economics…
        {isError && <span className="text-destructive">({(error as Error)?.message ?? "failed"})</span>}
      </div>
    );
  }

  const meta = data.meta;
  const top = strongBuys[0] ?? sorted[0];

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------- header explainer ---------------- */}
      <div className="rounded-lg border border-border bg-card/60 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Scale className="h-4 w-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold">Pool ≠ earnings — the buy decision, priced honestly</h2>
          <span className="ml-auto text-[10px] text-muted-foreground">
            snapshot blk {meta.blockNumber ?? "—"} · TAO live {fmtUsd(meta.taoPriceUsd, 2)} ·{" "}
            {meta.snapshotAt ? new Date(meta.snapshotAt).toLocaleString() : "—"}
            {dataUpdatedAt ? ` · panel updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ""}
          </span>
        </div>
        <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
          <p>
            <b className="text-foreground">P(earning)</b> = rewarded ÷ registered × your skill boost. On a
            1.6%-rewarded subnet the median registered miner earns <b className="text-foreground">zero</b> —
            a big pool divided by few rewarded UIDs is a lottery ticket, not income.
          </p>
          <p>
            <b className="text-foreground">Payout if you earn</b> = pool × realizability ÷ (rewarded+1) ×
            median factor. Your UID dilutes the pool by one, and a fresh UID lands near the reward{" "}
            <b className="text-foreground">median</b>, not the top-decile mean.
          </p>
          <p>
            <b className="text-foreground">Then hardware</b>: street price × GPUs, power at TDP × 720 h,
            versus renting the same card on Vast. Every number below is chain-measured + slider-adjustable.
          </p>
        </div>
      </div>

      {/* ---------------- assumptions bar ---------------- */}
      <div className="rounded-lg border border-border bg-card/60 p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex items-end gap-3">
            <div className="w-28">
              <Label htmlFor="tao-in" className="text-[10px] uppercase tracking-wide text-muted-foreground">TAO $/unit</Label>
              <Input id="tao-in" type="number" min={1} step={1} value={effTao || ""}
                onChange={(e) => setAssumedTao(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 h-8" />
            </div>
            <div className="w-24">
              <Label htmlFor="kwh-in" className="text-[10px] uppercase tracking-wide text-muted-foreground">$/kWh</Label>
              <Input id="kwh-in" type="number" min={0.01} step={0.01} value={effKwh}
                onChange={(e) => setKwh(Math.max(0.01, Number(e.target.value) || 0.01))}
                className="mt-1 h-8" />
            </div>
            <div className="w-28">
              <Label htmlFor="target-in" className="text-[10px] uppercase tracking-wide text-muted-foreground">Target TAO/mo</Label>
              <Input id="target-in" type="number" min={0.5} step={0.5} value={effTarget}
                onChange={(e) => setTargetTaoMo(Math.max(0.5, Number(e.target.value) || 0.5))}
                className="mt-1 h-8" />
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Median factor</Label>
                <span className="text-[10px] text-muted-foreground" title="Where a fresh UID lands in the reward distribution. 0.35 ≈ median; 1.0 = top-decile mean (optimistic).">{median.toFixed(2)}</span>
              </div>
              <Slider value={[median]} min={0.05} max={1} step={0.05} onValueChange={(v) => setMedian(v[0])} className="mt-2" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Skill boost</Label>
                <span className="text-[10px] text-muted-foreground" title="Multiplier on P(earning) — only raise above 1.0 with evidence you beat the field.">{boost.toFixed(2)}×</span>
              </div>
              <Slider value={[boost]} min={0.25} max={3} step={0.25} onValueChange={(v) => setBoost(v[0])} className="mt-2" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-center gap-1 rounded-md border border-border p-1">
              <Button size="sm" variant={basis === "used" ? "default" : "ghost"} className="h-7 px-3 text-xs"
                onClick={() => setBasis("used")}>Used price</Button>
              <Button size="sm" variant={basis === "new" ? "default" : "ghost"} className="h-7 px-3 text-xs"
                onClick={() => setBasis("new")}>New price</Button>
            </div>
            <span className="text-[10px] text-muted-foreground">
              street prices <b className="text-foreground">{meta.priceAsOf}</b> · rent = Vast median · opportunity day {meta.opportunityDay ?? "—"}
            </span>
          </div>
        </div>
      </div>

      {/* ---------------- verdict strip ---------------- */}
      {a && (
        <div className="rounded-lg border border-border bg-card/60 p-4">
          {top && top.best && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Flame className="h-4 w-4 text-warning" aria-hidden />
              <b>Verdict:</b>
              {top.bestVerdict === "STRONG BUY" ? (
                <span>
                  <b className="text-success">{top.card.label}</b> is the strongest buy under your assumptions —
                  best path SN{top.best.s.netuid} {top.best.s.name} ({top.best.s.count}× card
                  {top.best.s.count > 1 ? "s" : ""}): EV ≈ <b>{fmtN(top.best.evTaoMo)}</b> TAO/mo, net{" "}
                  <b>{fmtUsd(top.best.netUsdMo)}</b>/mo, payback <b>{fmtN(top.best.paybackMo, 1)}</b> mo
                  {top.best.evTaoMo >= a.targetTaoMo ? " — reaches your TAO target" : ""}.
                </span>
              ) : (
                <span>
                  <b className="text-warning">nothing is a clean buy right now</b> — best-ranked card is{" "}
                  {top.card.label} ({top.bestVerdict.toLowerCase()}). Consider renting or the CPU-only subnets.
                </span>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {strongBuys.map((c) => (
              <VerdictChip key={c.card.token} v="STRONG BUY" />
            )).length > 0 && (
              <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">Strong buys:</span>
            )}
            {strongBuys.map((c) => (
              <Badge key={c.card.token} variant="outline" className="text-[10px]">{c.card.label}</Badge>
            ))}
            {rentInstead.length > 0 && (
              <>
                <span className="ml-2 mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">Rent instead of buy:</span>
                {rentInstead.map((c) => (
                  <Badge key={c.card.token} variant="outline" className="text-[10px] border-primary/40 text-primary">{c.card.label}</Badge>
                ))}
              </>
            )}
            {avoids.length > 0 && (
              <>
                <span className="ml-2 mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">Avoid:</span>
                {avoids.map((c) => (
                  <Badge key={c.card.token} variant="outline" className="text-[10px] border-destructive/40 text-destructive">{c.card.label}</Badge>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* ---------------- ranked cards table ---------------- */}
      <div className="rounded-lg border border-border bg-card/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Card</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Paths</TableHead>
              <TableHead>Best path</TableHead>
              <TableHead className="text-right">EV TAO/mo</TableHead>
              <TableHead className="text-right">Net $/mo</TableHead>
              <TableHead className="text-right">Capex</TableHead>
              <TableHead className="text-right">Payback</TableHead>
              <TableHead className="text-right">Rent margin</TableHead>
              <TableHead>Verdict</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((agg) => {
              const { card, best, bestVerdict } = agg;
              const key = card.token;
              const isOpen = expanded.has(key);
              const unitPrice = a ? (a.basis === "used" ? card.priceUsedUsd : card.priceNewUsd) : card.priceUsedUsd;
              const rigMatch = meta.rigGpuVramGb > 0 && card.vramGb === meta.rigGpuVramGb;
              return (
                <TableRow key={key} className={cn("align-top", isOpen && "bg-muted/30")}>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={isOpen ? "collapse" : "expand"}
                      onClick={() => toggle(key)}>
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold">{card.label}</span>
                        <TeeChip tee={card.tee} locked={card.teeLockedOut} />
                        {rigMatch && (
                          <span className="rounded border border-primary/40 bg-primary/10 px-1 py-0.5 text-[9px] font-semibold text-primary">
                            your rig
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground" title={card.priceNote}>
                        {card.vramGb} GB · {card.cls} · {card.tdpW} W · rent ≈ ${card.vastUsdHr.toFixed(2)}/h
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right" title={card.priceNote}>
                    {fmtUsd(unitPrice)}
                    <span className="block text-[9px] text-muted-foreground">{a?.basis ?? "used"}</span>
                  </TableCell>
                  <TableCell className="text-right">{card.subnets.length}</TableCell>
                  {best ? (
                    <>
                      <TableCell>
                        <span className="font-medium">SN{best.s.netuid} {best.s.name}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {best.s.count}× card{best.s.count > 1 ? "s" : ""} · rew {best.s.rewardedMiners}/{best.s.minersCount} ({fmtN((best.s.rewardedRatio ?? 0) * 100, 1)}%) · pool {fmtN(best.s.poolTaoPerDay, 1)} TAO/d
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{fmtN(best.evTaoMo)}</TableCell>
                      <TableCell className={cn("text-right", best.netUsdMo <= 0 && "text-destructive")}>{fmtUsd(best.netUsdMo)}</TableCell>
                      <TableCell className="text-right">{fmtUsd(best.capexUsd)}</TableCell>
                      <TableCell className="text-right">
                        {best.paybackMo != null ? (
                          <span className={cn(best.paybackMo <= 12 && "text-success font-semibold", best.paybackMo > 60 && "text-destructive")}>
                            {fmtN(best.paybackMo, 1)} mo
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className={cn("text-right", best.rentMarginUsdMo <= 0 ? "text-muted-foreground" : "text-success")}>
                        {best.rentMarginUsdMo > 0 ? `+${fmtUsd(best.rentMarginUsdMo)}` : fmtUsd(best.rentMarginUsdMo)}
                      </TableCell>
                    </>
                  ) : (
                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">
                      no eligible subnet with a live reward pool
                    </TableCell>
                  )}
                  <TableCell><VerdictChip v={bestVerdict} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* expanded subnet detail */}
        {sorted.map((agg) => {
          const key = agg.card.token;
          if (!expanded.has(key) || !a) return null;
          return (
            <div key={`${key}-detail`} className="border-t border-border bg-muted/20 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold">{agg.card.label}</span>
                <span className="text-muted-foreground">· {agg.rows.length} paths with a live reward pool</span>
                <span className="text-[10px] text-muted-foreground" title={agg.card.priceNote}>price basis: {agg.card.priceNote}</span>
              </div>
              {agg.rows.length === 0 ? (
                <p className="px-1 py-3 text-xs text-muted-foreground">
                  No subnet this card can mine currently pays rewards. Cheap cards without a path stay cheap.
                </p>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subnet</TableHead>
                        <TableHead>Requirement (scraped)</TableHead>
                        <TableHead className="text-right">×GPU</TableHead>
                        <TableHead className="text-right">Pool TAO/d</TableHead>
                        <TableHead className="text-right">Rew %</TableHead>
                        <TableHead className="text-right">Mean/earner</TableHead>
                        <TableHead className="text-right">P(earn)</TableHead>
                        <TableHead className="text-right">EV TAO/mo</TableHead>
                        <TableHead className="text-right">Net $/mo</TableHead>
                        <TableHead className="text-right">Payback</TableHead>
                        <TableHead className="text-right">Rent margin</TableHead>
                        <TableHead>Flags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agg.rows.map((e) => {
                        const v = verdictFor(e, a.targetTaoMo);
                        return (
                          <TableRow key={e.s.netuid}>
                            <TableCell>
                              <span className="font-medium">SN{e.s.netuid} {e.s.name}</span>
                              <span className="block text-[10px] text-muted-foreground">
                                {e.s.matchReason === "named" ? "named in README" : "VRAM floor"}{e.s.soft ? " · soft (verify)" : ""}
                              </span>
                            </TableCell>
                            <TableCell className="max-w-56">
                              <span className="block truncate text-[11px] text-muted-foreground" title={e.s.reqText}>{e.s.reqText}</span>
                            </TableCell>
                            <TableCell className="text-right">{e.s.count}</TableCell>
                            <TableCell className="text-right">{fmtN(e.s.poolTaoPerDay, 1)}</TableCell>
                            <TableCell className="text-right">{fmtN((e.s.rewardedRatio ?? 0) * 100, 1)}%</TableCell>
                            <TableCell className="text-right" title="Mean TAO/day over today's EARNING UIDs — display only, not your expectation">
                              {fmtN(e.s.meanEarnerTaoPerDay)}
                            </TableCell>
                            <TableCell className="text-right">{fmtN(e.pEarn * 100, 1)}%</TableCell>
                            <TableCell className="text-right font-semibold">{fmtN(e.evTaoMo)}</TableCell>
                            <TableCell className={cn("text-right", e.netUsdMo <= 0 && "text-destructive")}>{fmtUsd(e.netUsdMo)}</TableCell>
                            <TableCell className="text-right">{e.paybackMo != null ? `${fmtN(e.paybackMo, 1)} mo` : "—"}</TableCell>
                            <TableCell className={cn("text-right", e.rentMarginUsdMo <= 0 ? "text-muted-foreground" : "text-success")}>
                              {e.rentMarginUsdMo > 0 ? `+${fmtUsd(e.rentMarginUsdMo)}` : fmtUsd(e.rentMarginUsdMo)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-1">
                                <DiffChip d={e.s.difficulty} />
                                <ClsChip c={e.s.classification} />
                                {e.s.nodeScale && (
                                  <span className="rounded border border-border px-1 py-0.5 text-[9px] text-muted-foreground" title="multi-GPU node required">node</span>
                                )}
                                {e.s.dataConfidence != null && e.s.dataConfidence < 0.7 && (
                                  <span className="rounded border border-border px-1 py-0.5 text-[9px] text-muted-foreground" title="low data confidence">
                                    conf {fmtN(e.s.dataConfidence * 100, 0)}%
                                  </span>
                                )}
                                {e.evTaoMo >= a.targetTaoMo && (
                                  <span className="rounded border border-success/40 px-1 py-0.5 text-[9px] font-semibold text-success" title="EV reaches your TAO/mo target">
                                    <Clock3 className="mr-0.5 inline h-2.5 w-2.5" aria-hidden />target
                                  </span>
                                )}
                                <span className={cn("rounded border px-1 py-0.5 text-[9px] font-semibold", VERDICT_META[v].chip)}>{v}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="px-1 text-[10px] leading-relaxed text-muted-foreground">
        Method: EV = P(earning) × payout-if-earning, where P = rewarded ÷ registered × skill boost and payout =
        pool × realizability ÷ (rewarded+1) × median factor. Hardware: street price × GPUs (menu-aware — a
        "2× 4090 OR 1× L40S" listing bills the 4090 buyer two cards), power = TDP × 720 h × $/kWh, rent = Vast
        median hourly × 720 h. Registration burn, ramp time and α→TAO slippage are NOT modeled — treat
        payback months as a floor, not a promise. Prices {meta.priceAsOf}; see each card's tooltip for the source.
      </p>
    </div>
  );
}
