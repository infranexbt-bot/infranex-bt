"use client";

// ---------------------------------------------------------------------------
// HOST & EARN VIEW — the provider path (SN51 · lium.io).
//
// The mining engine answers "can I COMPETE in a subnet?" — and for GPUs the
// honest answer today is mostly NO-GO (TEE/bare-metal gates, knife-fight
// seats, 80GB+ datacenter requirements). This view answers the DIFFERENT
// question an owned-GPU operator actually has: "what does my card earn as
// a rental provider on SN51?" — measured trailing-30d actuals, exact
// payback math on your own electricity rate, and the USDT-vs-alpha payout
// comparison. Data + math live in lib/infranex/lium-earnings.ts.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  Calculator,
  CircleDollarSign,
  Coins,
  ExternalLink,
  Info,
  Server,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProfitabilityConfig } from "@/hooks/use-profitability";
import { useNetwork } from "@/hooks/use-network";
import { cn } from "@/lib/utils";
import type { ViewKey } from "@/lib/infranex/types";
import {
  ALPHA_SCENARIO,
  LIUM_DOCS,
  LIUM_FLEET_SUMMARY,
  LIUM_GPUS,
  LIUM_MEASURED_AT,
  LIUM_SOURCE,
  LIUM_TIER_STYLE,
  USDT_FEE_PCT,
  USDT_MIN_PAYOUT_USD,
  comparePayouts,
  computePayback,
  electricityMonthlyUsd,
  idlePayEstimate,
  monthlyRevenueAt,
  type LiumGpuRow,
  type LiumTier,
  type PricingStrategy,
} from "@/lib/infranex/lium-earnings";

const usd = (n: number, digits = 0) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;

/** Live fleet tightness badge from rented/listed (lium.io snapshot). */
const tightness = (rented: number | null, listed: number | null) => {
  if (rented == null || listed == null || listed === 0) return null;
  const pct = Math.round((rented / listed) * 100);
  if (pct >= 97)
    return { pct, label: "Tight", cls: "border-success/40 bg-success/10 text-success" };
  if (pct >= 85)
    return { pct, label: "Solid", cls: "border-primary/40 bg-primary/10 text-primary" };
  return { pct, label: "Loose", cls: "border-warning/40 bg-warning/10 text-warning" };
};

const LENS_ROWS: { lens: string; income: string; gate: string; fit: string }[] = [
  {
    lens: "Mining seat (the engine's lens)",
    income: "Chain emissions only — your share of the subnet's incentive vector",
    gate:
      "Must beat incumbents; TEE/bare-metal hosting gates; 80GB+ datacenter classes; whale seats take ~100% of rewards",
    fit: "Every GPU row shows NO-GO — and that is the honest read of the mining market",
  },
  {
    lens: "Hosting / provider (this view)",
    income:
      "Rental fees from real demand + idle-pool pay — neither appears in the emission vector",
    gate:
      "No seats to displace; any tier from a used 3090 to B300 fleets; consumer RTX runs plain Sysbox (no TEE)",
    fit: "Measured $135–$6,238 per card per month (trailing 30d)",
  },
];

const ONBOARDING: { title: string; body: string }[] = [
  {
    title: "1 · Account decides your payout rail",
    body: "Sign up at lium.io with email/Google and you are paid in USDT on Ethereum automatically. To receive SN51 alpha tokens instead you must register your own Bittensor hotkey AND connect Discord — no hotkey, no alpha.",
  },
  {
    title: "2 · Consumer cards need no TEE",
    body: "RTX 3090 / 4090 / 5090 run inside plain Sysbox containers — no confidential-compute hardware required. The H100 / H200 / B200 / GB200 tiers require an Intel TDX CVM, i.e. a TDX-capable server.",
  },
  {
    title: "3 · Server Edition needs a chassis",
    body: "The RTX PRO 6000 Blackwell SERVER Edition is passively cooled — it only fits a proper server chassis. If your card lives in a tower, you want the Workstation Edition (slightly lower yield).",
  },
  {
    title: "4 · Payout mechanics",
    body: `Payouts settle daily T+2 at 17:00 UTC. USDT rail: min ${usd(USDT_MIN_PAYOUT_USD)}, ~${USDT_FEE_PCT}% conversion fee. Alpha rail: no conversion fee, but you carry alpha price risk (bear scenario here is -${ALPHA_SCENARIO * 100}%).`,
  },
  {
    title: "5 · Rail strategy",
    body: "While recovering capital take USDT — stability beats fees. After payback, alpha is reasonable with house money; if you hold alpha, trim weekly rather than timing.",
  },
  {
    title: "6 · Idle pay is conditional",
    body: "Idle pay only accrues if the node passes the 15-min validator checks, is priced at or under the model's soft limit, has disk ≥ 1.5× total VRAM, runs 1 or 8 GPUs per node (or GPU splitting on), and has Discord connected. Price above the limit and the idle stream goes to zero — that is exactly the Market-ask trade-off in the calculator.",
  },
];

export function HostEarnView({
  onNavigate,
}: {
  onNavigate?: (v: ViewKey) => void;
}) {
  const { data: profConfig } = useProfitabilityConfig();
  const { data: snap } = useNetwork();

  // Live alpha price straight from the chain snapshot (SN51 movingPrice × TAO).
  const liveAlphaPriceUsd = useMemo(() => {
    const s51 = snap?.subnets.find((s) => s.netuid === 51);
    if (s51?.movingPrice && snap?.taoPriceUsd)
      return Math.round(s51.movingPrice * snap.taoPriceUsd * 100) / 100;
    return 28.95;
  }, [snap]);

  // Inputs — electricity + alpha price default to config/live, overridable.
  const [elecOverride, setElecOverride] = useState<number | null>(null);
  const elecRate =
    elecOverride ??
    Math.round((profConfig?.electricityUsdPerKwh ?? 0.12) * 1000) / 1000;

  const [tierFilter, setTierFilter] = useState<"all" | LiumTier>("all");
  const [gpuName, setGpuName] = useState("RTX 4090");
  const gpu = LIUM_GPUS.find((g) => g.gpu === gpuName) ?? LIUM_GPUS[0];
  const [capex, setCapex] = useState<number>(gpu.streetPriceUsd);
  const [demandPct, setDemandPct] = useState(100);
  const [strategy, setStrategy] = useState<PricingStrategy>("soft_limit");
  const [alphaOverride, setAlphaOverride] = useState<number | null>(null);
  const alphaPrice = alphaOverride ?? liveAlphaPriceUsd;

  const selectGpu = (name: string) => {
    const row = LIUM_GPUS.find((g) => g.gpu === name);
    setGpuName(name);
    if (row) setCapex(row.streetPriceUsd);
  };

  const filtered = useMemo(
    () => (tierFilter === "all" ? LIUM_GPUS : LIUM_GPUS.filter((g) => g.tier === tierFilter)),
    [tierFilter]
  );

  const rev = monthlyRevenueAt(gpu, strategy, demandPct);
  const revenue = rev.usd;
  const softRevenue = gpu.monthlyUsd * (demandPct / 100);
  const marketDelta = revenue - softRevenue;
  const marketDeltaPct =
    softRevenue > 0 ? Math.round((marketDelta / softRevenue) * 100) : 0;
  const idleEst = idlePayEstimate(gpu);
  const idleEstScaled = idleEst != null ? Math.round((idleEst * demandPct) / 100) : null;
  const pb = computePayback({
    capexUsd: capex,
    monthlyRevenueUsd: revenue,
    powerWatts: gpu.powerWatts,
    usdPerKwh: elecRate,
  });
  const payouts = comparePayouts({ monthlyUsd: revenue, alphaPriceUsd: alphaPrice });

  const paybackLabel = (months: number | null, never: boolean) =>
    never ? "never" : months != null ? `${months.toFixed(1)} mo` : "never";

  return (
    <div className="space-y-8">
      {/* Hero */}
      <header className="animate-rise space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 backdrop-blur">
          <Server className="h-3.5 w-3.5 text-primary" />
          <span className="text-eyebrow text-muted-foreground">
            Provider path · SN51 lium.io · measured {LIUM_MEASURED_AT}
          </span>
        </div>
        <h1 className="text-display mt-2 text-3xl font-bold leading-tight md:text-4xl">
          Host &amp; Earn — rent your GPUs out instead of fighting for seats
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          The mining engine is honest: GPU mining seats are mostly whale knife-fights behind
          hardware gates. Hosting is the other way a GPU earns on Bittensor — someone pays you
          rent to use it, and idle cards still accrue validator idle-pool pay. Below: measured
          earnings, live demand per model, exact payback on your electricity rate under two
          pricing strategies, and the USDT-vs-alpha payout choice.
        </p>
      </header>

      {/* Mining lens vs hosting lens */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Info className="h-4 w-4 text-primary" />
            Why every GPU shows NO-GO in the picker — and why hosting is different
          </CardTitle>
          <CardDescription>
            Same GPU, two different businesses. The engine scores the first one; this page prices the second.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {LENS_ROWS.map((r, i) => (
            <div
              key={r.lens}
              className={cn(
                "rounded-xl border p-4",
                i === 1 ? "border-success/30 bg-success/5" : "border-border/50 bg-card/30"
              )}
            >
              <p className={cn("text-sm font-semibold", i === 1 && "text-success")}>{r.lens}</p>
              <dl className="mt-3 space-y-2 text-xs leading-relaxed">
                <div>
                  <dt className="text-muted-foreground">Income stream</dt>
                  <dd className="font-medium">{r.income}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Gate</dt>
                  <dd className="font-medium">{r.gate}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Verdict</dt>
                  <dd className="font-medium">{r.fit}</dd>
                </div>
              </dl>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Measured earnings table */}
      <Card className="glass">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">Measured provider earnings per card</CardTitle>
            <CardDescription>{LIUM_SOURCE}</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="elec-rate" className="whitespace-nowrap text-[11px] text-muted-foreground">
              Electricity {usd(elecRate, 3)}/kWh
            </Label>
            <Input
              id="elec-rate"
              type="number"
              step="0.005"
              min="0"
              value={elecRate}
              onChange={(e) => setElecOverride(Math.max(0, Number(e.target.value) || 0))}
              className="h-8 w-24 text-xs"
            />
            <div className="flex items-center gap-1">
              {(["all", "consumer", "pro", "datacenter"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTierFilter(t)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    tierFilter === t
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/60 bg-card/30 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t === "all" ? "All" : LIUM_TIER_STYLE[t].label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>GPU</TableHead>
                  <TableHead>VRAM</TableHead>
                  <TableHead
                    className="text-right"
                    title="Fleet snapshot 2026-10-23: units rented / listed on lium.io right now, plus the official trailing-30d average time-rented."
                  >
                    Demand
                  </TableHead>
                  <TableHead className="text-right">Measured /mo</TableHead>
                  <TableHead className="text-right" title="Validator idle-pool weight — idle cards still accrue pay where a weight exists">
                    Idle wgt
                  </TableHead>
                  <TableHead className="text-right">Elec /mo</TableHead>
                  <TableHead className="text-right">Net /mo</TableHead>
                  <TableHead className="text-right" title={`Payback at the default street price (${usd(gpu.streetPriceUsd)} for the selected card) and 100% demand`}>
                    Payback
                  </TableHead>
                  <TableHead className="min-w-[240px]">Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((g: LiumGpuRow) => {
                  const elec = electricityMonthlyUsd(g.powerWatts, elecRate);
                  const net = g.monthlyUsd - elec;
                  const rowPb = computePayback({
                    capexUsd: g.streetPriceUsd,
                    monthlyRevenueUsd: g.monthlyUsd,
                    powerWatts: g.powerWatts,
                    usdPerKwh: elecRate,
                  });
                  const sel = g.gpu === gpuName;
                  return (
                    <TableRow
                      key={g.gpu}
                      onClick={() => selectGpu(g.gpu)}
                      className={cn("cursor-pointer", sel && "bg-primary/5")}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{g.gpu}</span>
                          <span
                            className={cn(
                              "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                              LIUM_TIER_STYLE[g.tier].className
                            )}
                          >
                            {LIUM_TIER_STYLE[g.tier].label}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="mono tabular text-xs">{g.vramGb} GB</TableCell>
                      <TableCell className="text-right">
                        {(() => {
                          const t = tightness(g.rentedCount, g.listedCount);
                          if (!t)
                            return <span className="text-xs text-muted-foreground">—</span>;
                          return (
                            <div className="space-y-0.5">
                              <p className="mono tabular text-xs font-semibold">
                                {g.rentedCount}/{g.listedCount}
                              </p>
                              <div className="flex items-center justify-end gap-1">
                                <span
                                  className={cn(
                                    "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                                    t.cls
                                  )}
                                >
                                  {t.label}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  30d {g.avgRentedPct30d ?? "?"}%
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="mono tabular text-right text-sm font-semibold text-success">
                        {usd(g.monthlyUsd)}
                      </TableCell>
                      <TableCell className="mono tabular text-right text-xs">
                        {g.idleWeight != null ? g.idleWeight.toFixed(3) : "—"}
                      </TableCell>
                      <TableCell className="mono tabular text-right text-xs text-muted-foreground">
                        {usd(elec)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "mono tabular text-right text-sm font-semibold",
                          net > 0 ? "" : "text-destructive"
                        )}
                      >
                        {usd(net)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "mono tabular text-right text-xs",
                          rowPb.neverPays ? "text-destructive" : rowPb.paybackMonths != null && rowPb.paybackMonths <= 12 ? "text-success" : ""
                        )}
                      >
                        {paybackLabel(rowPb.paybackMonths, rowPb.neverPays)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {g.note}
                        <span className="block text-[10px] opacity-70">{g.priceNote}</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Elec/mo = board watts × 24/7 × {usd(elecRate, 3)}/kWh. Payback column uses each card&apos;s
            default street price — click a row to load it into the calculator with your own capex.
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {LIUM_FLEET_SUMMARY} Demand column = that snapshot&apos;s rented/listed per model, with the
            official trailing-30d average time-rented. Tight ≥97% · Solid ≥85% · Loose below.
          </p>
        </CardContent>
      </Card>

      {/* Calculator + payout comparator */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calculator className="h-4 w-4 text-primary" />
              Payback calculator
            </CardTitle>
            <CardDescription>
              Your card, your capex, your electricity — exact math, no promises.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">GPU</Label>
                <Select value={gpuName} onValueChange={selectGpu}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LIUM_GPUS.map((g) => (
                      <SelectItem key={g.gpu} value={g.gpu}>
                        {g.gpu}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Capex (USD)</Label>
                <Input
                  type="number"
                  min="0"
                  value={capex}
                  onChange={(e) => setCapex(Math.max(0, Number(e.target.value) || 0))}
                  className="h-9 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Default: {gpu.priceNote}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Electricity (USD/kWh)</Label>
                <Input
                  type="number"
                  step="0.005"
                  min="0"
                  value={elecRate}
                  onChange={(e) => setElecOverride(Math.max(0, Number(e.target.value) || 0))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Board power</Label>
                <div className="flex h-9 items-center text-sm">
                  {gpu.powerWatts} W
                  <span className="ml-2 text-[10px] text-muted-foreground">24/7 draw</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">Pricing strategy</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {([
                  { key: "soft_limit" as const, label: "Soft limit · keeps idle pay" },
                  { key: "market_ask" as const, label: "Market ask · forfeits idle pay" },
                ]).map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setStrategy(s.key)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors",
                      strategy === s.key
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/60 bg-card/30 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {strategy === "soft_limit"
                  ? `Price at/below the model's soft limit${
                      gpu.softLimitUsdPerHr != null
                        ? ` (~$${gpu.softLimitUsdPerHr.toFixed(2)}/hr)`
                        : ""
                    } — idle hours keep earning idle-pool pay. Measured actuals already include it.`
                  : rev.fellBack
                    ? "No above-limit ask observed for this model — market mode unavailable, showing soft-limit actuals."
                    : `Price at the observed ask (~$${
                        gpu.marketAskUsdPerHr != null ? gpu.marketAskUsdPerHr.toFixed(2) : "?"
                      }/hr) — more per rented hour, but idle pay is forfeited and above-limit demand is thinner.`}
              </p>
              {strategy === "market_ask" && !rev.fellBack && (
                <p className="text-[11px] leading-relaxed">
                  vs soft-limit at this demand:{" "}
                  <span
                    className={cn(
                      "mono tabular font-semibold",
                      marketDelta >= 0 ? "text-success" : "text-destructive"
                    )}
                  >
                    {marketDelta >= 0 ? "+" : ""}
                    {usd(marketDelta)}/mo ({marketDeltaPct >= 0 ? "+" : ""}
                    {marketDeltaPct}%)
                  </span>
                  {idleEstScaled != null && (
                    <span className="text-muted-foreground">
                      {" "}· forfeits ≈{usd(idleEstScaled)}/mo idle pay
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">Demand assumption</Label>
                <span className="mono tabular text-xs font-semibold">
                  {demandPct}% {strategy === "market_ask" ? "of 30d rented time" : "of trailing 30d"}
                </span>
              </div>
              <Slider
                value={[demandPct]}
                onValueChange={(v) => setDemandPct(v[0] ?? 100)}
                min={50}
                max={100}
                step={5}
              />
              <p className="text-[10px] text-muted-foreground">
                Trailing actuals are not a contract — stress the number before you buy hardware.
              </p>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: "Revenue /mo",
                  value: usd(revenue),
                  icon: CircleDollarSign,
                  cls: "",
                },
                {
                  label: "Electricity /mo",
                  value: usd(pb.monthlyElectricityUsd),
                  icon: Zap,
                  cls: "text-muted-foreground",
                },
                {
                  label: "Net /mo",
                  value: usd(pb.monthlyNetUsd),
                  icon: Banknote,
                  cls: pb.monthlyNetUsd > 0 ? "text-success" : "text-destructive",
                },
                {
                  label: "Payback",
                  value: paybackLabel(pb.paybackMonths, pb.neverPays),
                  icon: Calculator,
                  cls: pb.neverPays ? "text-destructive" : pb.paybackMonths != null && pb.paybackMonths <= 12 ? "text-success" : "",
                },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-border/40 bg-card/30 p-3">
                  <p className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
                    <s.icon className="h-3 w-3" />
                    {s.label}
                  </p>
                  <p className={cn("mono tabular mt-1 text-sm font-bold", s.cls)}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border/40 bg-card/30 p-3 text-xs leading-relaxed">
              <p className="font-semibold">Cumulative net after capex</p>
              <p className="mt-1">
                12 months:{" "}
                <span className={cn("mono tabular font-semibold", pb.net12MoUsd >= 0 ? "text-success" : "")}>
                  {pb.net12MoUsd >= 0 ? "+" : ""}
                  {usd(pb.net12MoUsd)}
                </span>{" "}
                · 24 months:{" "}
                <span className={cn("mono tabular font-semibold", pb.net24MoUsd >= 0 ? "text-success" : "text-destructive")}>
                  {pb.net24MoUsd >= 0 ? "+" : ""}
                  {usd(pb.net24MoUsd)}
                </span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {pb.neverPays
                  ? "This configuration never clears capex inside 24 months — change the capex, the card, or the demand assumption."
                  : `At ${demandPct}% demand this setup is capital-recovered in ${paybackLabel(pb.paybackMonths, pb.neverPays)} and everything after is profit, priced on your own electricity.`}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Payout comparator */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Coins className="h-4 w-4 text-primary" />
              Payout comparator — USDT vs SN51 alpha
            </CardTitle>
            <CardDescription>
              Same earnings, two rails. Live alpha price from the chain snapshot: {usd(alphaPrice, 2)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Monthly payout (USD)</Label>
                <div className="flex h-9 items-center rounded-md border border-border/60 bg-card/30 px-3 text-sm font-semibold">
                  {usd(revenue)}
                  <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                    from calculator ({demandPct}%)
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">SN51 alpha price (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={alphaPrice}
                  onChange={(e) => setAlphaOverride(Math.max(0, Number(e.target.value) || 0))}
                  className="h-9 text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Default: live chain ({usd(liveAlphaPriceUsd, 2)}) — edit for scenarios.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-success/30 bg-success/5 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                  <CircleDollarSign className="h-4 w-4" /> USDT rail
                </p>
                <p className="mono tabular mt-2 text-2xl font-bold">
                  {usd(payouts.usdt.netMonthlyUsd)}
                  <span className="text-xs font-normal text-muted-foreground"> /mo net</span>
                </p>
                <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                  <li>· ~{USDT_FEE_PCT}% conversion fee ({usd(payouts.usdt.feeUsd)}/mo at this rate)</li>
                  <li>· Daily T+2 at 17:00 UTC, min {usd(USDT_MIN_PAYOUT_USD)}</li>
                  <li>· Stable while you recover capex — recommended first</li>
                </ul>
              </div>
              <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
                  <Coins className="h-4 w-4" /> Alpha rail
                </p>
                <p className="mono tabular mt-2 text-2xl font-bold">
                  {payouts.alpha.tokensMonthly.toLocaleString("en-US", { maximumFractionDigits: 1 })}
                  <span className="text-xs font-normal text-muted-foreground"> α /mo</span>
                </p>
                <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                  <li>· No conversion fee — full emission</li>
                  <li>
                    · Value range: {usd(payouts.alpha.valueBearUsd)} (−{ALPHA_SCENARIO * 100}%) … {usd(payouts.alpha.valueBullUsd)} (+
                      {ALPHA_SCENARIO * 100}%)
                  </li>
                  <li>· Needs your own Bittensor hotkey + Discord connected</li>
                </ul>
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              The measured earnings already reflect the provider&apos;s ~95% rental share — the fee
              line here is only the alpha→USDT conversion, not the platform take.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Onboarding + honesty */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Onboarding checklist
            </CardTitle>
            <CardDescription>
              Six things that decide your real payout. The full install path — host prep, wallet,
              SN51 registration, node install — lives in the Setup Guide.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ONBOARDING.map((s) => (
              <div key={s.title} className="rounded-lg border border-border/40 bg-card/30 p-3">
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => onNavigate?.("lium-setup")}
            >
              Open the full setup guide — GPU to earning node
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-lg">Honesty footer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            <p>
              Earnings are trailing-30-day actuals measured on {LIUM_MEASURED_AT}. They move with
              rental demand, fleet growth and validator idle-pool weights — treat them as evidence,
              not a forecast, and stress-test with the demand slider before buying hardware.
            </p>
            <p>
              The mining engine&apos;s NO-GO verdicts on this platform remain correct for the
              compete-as-miner lens; this module deliberately prices a different income stream.
            </p>
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href={LIUM_DOCS} target="_blank" rel="noreferrer">
                Provider docs <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
