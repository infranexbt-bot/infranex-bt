"use client";

import { cn, formatCurrency, formatPercent, getStatusColor } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TrendingUp, AlertTriangle, Cpu, Wallet, Calculator } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { assessSeatChance, formatBurnTao } from "@/lib/infranex/miner-score";
import { computeMinePick, VERDICT_STYLE } from "@/lib/infranex/mine-pick";
import { costBasisFromConfig } from "@/lib/infranex/rent-earn";
import { RegisterOddsBlock, RegisterOddsInline } from "@/components/cards/register-odds";
import { HostingWarningBlock, HostingChips } from "@/components/cards/hosting-requirements";
import { OfficialMechanicsBlock, MechanicsChips, rampWeeksSourceNote } from "@/components/cards/mechanics-block";
import { DiligencePanel } from "@/components/opportunities/diligence-panel";
import { useOddsTrends } from "@/hooks/use-odds";
import { useProfitabilityConfig } from "@/hooks/use-profitability";
import {
  computeNetEarningsEstimate,
  CONFIDENCE_BAND_STYLE,
  CONSERVATIVE_VERDICT_META,
  type NetEarningsEstimate,
} from "@/lib/infranex/net-earnings";
import type { Opportunity } from "@/lib/infranex/types";

interface OpportunityDetailDialogProps {
  opportunity: Opportunity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** DILIGENCE-1 — provision hand-off (Deployments stepper, preselected). */
  onProvision?: () => void;
}

/** REALIZABILITY-AUDIT — adaptive % for tiny dilution-backed shares. */
function dilutionPct(dilutionRatio: number): string {
  const pct = 100 / dilutionRatio;
  if (pct >= 1) return pct.toFixed(0);
  if (pct >= 0.01) return pct.toFixed(2);
  return "<0.01";
}

export function OpportunityDetailDialog({
  opportunity,
  open,
  onOpenChange,
  onProvision,
}: OpportunityDetailDialogProps) {
  // OWNED-MODE: the P&L's GPU line label must reflect the active cost basis.
  // Hook lives above the early return (Rules of Hooks).
  const { data: profConfig } = useProfitabilityConfig();
  const owned = profConfig?.hardwareMode === "owned";
  if (!opportunity) return null;
  const o = opportunity;
  const risk = getStatusColor(o.riskLevel);
  const prof = o.profitability;

  // PNL-RECONCILE-1 — recompute this row's conviction with the SAME pure
  // engine the Opportunities list and Dashboard use (computeMinePickMap →
  // computeMinePick), so the dialog's verdict is identical by construction.
  // Pure function — safe after the early return (not a hook).
  const pick = computeMinePick(o, costBasisFromConfig(profConfig));

  // NET-EARNINGS-1 — the conservative/base/optimistic estimate with per-
  // scenario confidence, computed with the SAME pure engine the table uses
  // so cell, dialog and rank can never disagree.
  const estimate: NetEarningsEstimate | null = prof
    ? computeNetEarningsEstimate(o as never, {
        minNetTargetUsd: profConfig?.minNetProfitTargetUsd,
        hardwareMode: profConfig?.hardwareMode,
      })
    : null;

  // VERDICT-UNIFY-1 / PNL-RECONCILE-1 — the dialog's headline badge + score
  // must speak the ONE conviction vocabulary. Before this change the badge
  // read the ledger score band (score 67 → "RUN") directly above a
  // "P&L passed ≠ verdict AVOID" reconciliation — a contradiction in one
  // view. The ledger composite stays visible in the score's tooltip.
  const band = VERDICT_STYLE[pick.verdict];

  // The gates / seat facts that explain a non-RUN verdict despite a passed
  // P&L — ordered hardest-first (hard gate → seat reality → entry).
  const reconcileGates: string[] = [];
  if (!pick.rent.rentable && pick.rent.rentBlock)
    reconcileGates.push(`Hosting/rig gate — ${pick.rent.rentBlock}`);
  if (pick.diligence.verdict === "DO NOT PROVISION") {
    const fail = pick.diligence.stages.find((s) => s.status === "fail");
    reconcileGates.push(
      `Diligence hard fail — ${
        fail
          ? `stage #${fail.n} ${fail.label}: ${fail.value}`
          : `${pick.diligence.failCount} stage${pick.diligence.failCount === 1 ? "" : "s"} failed`
      } (verdict capped at 30)`
    );
  }
  if (pick.rent.knifeFight)
    reconcileGates.push(
      `Knife-fight seat — only ${pick.rent.earnChancePct ?? "?"}% of slots earned and the top 10% of UIDs take ${pick.rent.top10TakePct ?? "?"}% of all rewards`
    );
  else if (pick.rent.whaleMean)
    reconcileGates.push(
      `Whale-mean — just ${pick.rent.earnChancePct ?? "?"}% of slots earned; the headline $/mo is a mean over few earners`
    );
  if (pick.rent.entry === "displace")
    reconcileGates.push(
      "Subnet full — a new seat must displace an incumbent (0 free seats)"
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto custom-scroll">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="mono">
              {o.subnetSymbol}
            </Badge>
            <Badge variant="outline" className={cn(band.bg, band.color)}>
              {band.label}
            </Badge>
            {prof && (
              <Badge
                variant="outline"
                className={cn(
                  prof.verdict === "PROFITABLE" && "bg-success/10 text-success",
                  prof.verdict === "MARGINAL" && "bg-warning/10 text-warning",
                  prof.verdict === "AVOID" && "bg-destructive/10 text-destructive"
                )}
              >
                {prof.verdict === "PROFITABLE" && "✓ Profitable"}
                {prof.verdict === "MARGINAL" && "≈ Marginal"}
                {prof.verdict === "AVOID" && "✗ Below target"}
              </Badge>
            )}
            <Badge variant="outline" className={cn(risk.bg, risk.text, "capitalize")}>
              {o.riskLevel} risk
            </Badge>
          </div>
          <DialogTitle className="text-display text-2xl">
            {o.subnetName}
            <span
              className="ml-2 tabular text-primary"
              title={`Conviction — the decision score (earn pick × seat reality + diligence + confidence, hard-gated). Ledger composite: ${o.score.toFixed(1)}`}
            >
              {pick.conviction}
            </span>
          </DialogTitle>
          <DialogDescription>
            NetUID {o.netuid} · {o.category} · rank #{o.rank} · updated{" "}
            {new Date(o.updatedAt).toLocaleTimeString()}
          </DialogDescription>
        </DialogHeader>

        {/* --- Profitability Engine: P&L waterfall + minimum entry rule --- */}
        {prof && (
          <div
            className={cn(
              "rounded-lg border p-4",
              prof.meetsMinimum
                ? "border-success/30 bg-success/5"
                : "border-destructive/40 bg-destructive/5"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-display flex items-center gap-2 text-base font-semibold">
                <Calculator className="h-4 w-4 text-primary" />
                Profitability engine
              </h3>
              <span className="text-eyebrow text-muted-foreground">
                monthly USD · per mid-pack miner
              </span>
            </div>

            {!prof.meetsMinimum && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-xs text-destructive">
                  <span className="font-bold">AVOID</span> — expected net profit{" "}
                  {formatCurrency(prof.netMonthlyUsd)}/mo is below the minimum target of{" "}
                  {formatCurrency(prof.targetUsd)}/mo (shortfall{" "}
                  {formatCurrency(prof.shortfallUsd)}). Raise the bar or skip this subnet.
                </p>
              </div>
            )}

            {/* Waterfall: revenue − cost lines = net */}
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span
                  className="text-muted-foreground"
                  title={
                    o.revenueBasis === "provider-marketplace"
                      ? o.revenueBasisSource ??
                        "Measured off-chain provider income (95% rental share + idle pay) — replaces the emission estimate"
                      : undefined
                  }
                >
                  Expected revenue
                  {o.revenueBasis === "provider-marketplace" && (
                    <span className="ml-1.5 rounded border border-success/30 bg-success/10 px-1 py-px text-[10px] font-medium uppercase tracking-wide text-success">
                      measured provider income
                    </span>
                  )}
                </span>
                <span className="tabular font-semibold">{formatCurrency(prof.expectedRevenueUsd)}</span>
              </div>
              <div className="flex items-center justify-between pl-4 text-muted-foreground">
                {/* DATA-AUDIT-1 (H4) — the rate behind this line is a modeled
                    market estimate, not a live provider quote. OWNED-MODE: the
                    line is electricity instead of rent (hardwareMode toggle). */}
                <span
                  title={
                    owned
                      ? `Owned hardware — power draw × $${(profConfig?.electricityUsdPerKwh ?? 0.12).toFixed(2)}/kWh (Profitability settings)`
                      : "Modeled market rate (survey estimate), not a live provider quote"
                  }
                >
                  − GPU {owned ? `electricity (owned · $${(profConfig?.electricityUsdPerKwh ?? 0.12).toFixed(2)}/kWh)` : "rental (modeled rate)"}
                  {prof.gpuRentalUsd === 0 && " (none)"}
                </span>
                <span className="tabular">−{formatCurrency(prof.gpuRentalUsd)}</span>
              </div>
              <div className="flex items-center justify-between pl-4 text-muted-foreground">
                <span>− Storage</span>
                <span className="tabular">−{formatCurrency(prof.storageUsd)}</span>
              </div>
              <div className="flex items-center justify-between pl-4 text-muted-foreground">
                <span>− Infrastructure</span>
                <span className="tabular">−{formatCurrency(prof.infrastructureUsd)}</span>
              </div>
              {/* NET-EARNINGS-1 — the owned-basis reality lines MUST appear in
                  the waterfall or the net won't add up for anyone doing the
                  math by hand (cooling + maintenance were silently absorbed). */}
              {(prof.coolingUsd ?? 0) > 0 && (
                <div className="flex items-center justify-between pl-4 text-muted-foreground">
                  <span
                    title={`Cooling uplift ${profConfig?.coolingUpliftPct ?? 15}% on the electricity line (Profitability settings)`}
                  >
                    − Cooling
                  </span>
                  <span className="tabular">−{formatCurrency(prof.coolingUsd)}</span>
                </div>
              )}
              {(prof.maintenanceUsd ?? 0) > 0 && (
                <div className="flex items-center justify-between pl-4 text-muted-foreground">
                  <span title="Cleaning, fans, thermal paste, misc repairs (Profitability settings)">
                    − Maintenance
                  </span>
                  <span className="tabular">−{formatCurrency(prof.maintenanceUsd)}</span>
                </div>
              )}
              {(prof.hardwareRecoveryUsd ?? 0) > 0 && (
                <div className="flex items-center justify-between pl-4 text-muted-foreground">
                  <span
                    title={`Rig capex ${formatCurrency((profConfig?.rigCapexUsd ?? 0))} ÷ ${profConfig?.rigAmortizeMonths ?? 24} months — the hardware itself is a cost`}
                  >
                    − Hardware recovery
                  </span>
                  <span className="tabular">−{formatCurrency(prof.hardwareRecoveryUsd)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pl-4 text-muted-foreground">
                <span
                  title={
                    prof.amortizedBurnUsd > 0
                      ? `Includes ${formatCurrency(prof.amortizedBurnUsd)}/mo amortized registration burn`
                      : "Bandwidth, fees, misc operating costs"
                  }
                >
                  − Other operating
                  {prof.amortizedBurnUsd > 0 && (
                    <span className="ml-1 text-[10px]">(incl. reg burn)</span>
                  )}
                </span>
                <span className="tabular">−{formatCurrency(prof.otherOperatingTotalUsd)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border/60 pt-1.5">
                <span className="font-semibold">= Net profit</span>
                <span
                  className={cn(
                    "tabular text-lg font-bold",
                    prof.netMonthlyUsd >= 0 ? "text-success" : "text-destructive"
                  )}
                >
                  {formatCurrency(prof.netMonthlyUsd)}
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">/mo</span>
                </span>
              </div>
              <p className="text-right text-[10px] text-muted-foreground">
                minimum target {formatCurrency(prof.targetUsd)}/mo ·{" "}
                {prof.meetsMinimum ? (
                  <span className="text-success">PASSED</span>
                ) : (
                  <span className="text-destructive">FAILED</span>
                )}
              </p>
            </div>

            {/* PNL-RECONCILE-1 — "PASSED but not RUN?" — the P&L prices a
                mid-pack miner who is ALREADY earning; the verdict prices what
                a NEW seat can win. When the two disagree, show the seat math
                and the hard gates right here so the reconciliation is
                visible, not a support question. Hidden when the P&L itself
                fails the minimum rule (the red AVOID note above covers it). */}
            {prof.meetsMinimum && pick.verdict !== "RUN" && (
              <div
                className={cn(
                  "mt-3 rounded-md border px-3 py-2.5",
                  pick.verdict === "AVOID"
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-warning/40 bg-warning/5"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-display flex items-center gap-1.5 text-xs font-semibold">
                    <AlertTriangle
                      className={cn(
                        "h-3.5 w-3.5",
                        pick.verdict === "AVOID" ? "text-destructive" : "text-warning"
                      )}
                    />
                    P&amp;L passed ≠ verdict {pick.verdict}
                  </p>
                  <span
                    className="text-[10px] text-muted-foreground"
                    title="Conviction = earn pick × seat reality + diligence pipeline + model confidence, gated by hard rules — see the Opportunities ranking"
                  >
                    conviction {pick.conviction}/100
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  This P&amp;L prices a{" "}
                  <span className="font-medium text-foreground">mid-pack miner who is already earning</span>
                  . The verdict prices{" "}
                  <span className="font-medium text-foreground">what a NEW seat can win</span>
                  {" "}— seat competition and hard gates a cost sheet can&apos;t see.
                </p>

                {/* Seat reality — the chain facts behind the verdict */}
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-4">
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Slots earning</p>
                    <p className="tabular font-semibold">
                      {pick.rent.earnChancePct != null ? `${pick.rent.earnChancePct}%` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Top-10% take</p>
                    <p className="tabular font-semibold">
                      {pick.rent.top10TakePct != null ? `${pick.rent.top10TakePct}%` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Free seats</p>
                    <p className="tabular font-semibold">
                      {o.freeSlots != null ? `${o.freeSlots}/${o.totalSlots ?? "?"}` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Month-1 earn chance</p>
                    <p className="tabular font-semibold">
                      {o.earnChance?.pct != null ? `${o.earnChance.pct}%` : "—"}
                    </p>
                  </div>
                </div>

                {/* The EV math — what a new seat can actually expect */}
                {pick.rent.expectedNetMonthlyUsd != null && (
                  <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                    New-seat EV = {formatCurrency(prof.netMonthlyUsd)} net ×{" "}
                    {o.rewardedRatio != null ? (o.rewardedRatio * 100).toFixed(1) : "—"}% rewarded ×{" "}
                    {o.rewardMedianShare != null ? o.rewardMedianShare.toFixed(2) : "—"} median share ≈{" "}
                    <span
                      className={cn(
                        "font-bold",
                        pick.rent.expectedNetMonthlyUsd >= prof.targetUsd
                          ? "text-success"
                          : "text-destructive"
                      )}
                    >
                      {formatCurrency(pick.rent.expectedNetMonthlyUsd)}/mo
                    </span>{" "}
                    — the honest expectation for registering today.
                  </p>
                )}

                {/* Gates that fired — hardest first */}
                {reconcileGates.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {reconcileGates.map((g, i) => (
                      <li key={i} className="text-[11px] leading-snug text-muted-foreground">
                        <span className="mr-1 font-bold text-destructive">•</span>
                        {g}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Metrics grid */}
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-[10px] text-muted-foreground">ROI (monthly)</p>
                <p
                  className={cn(
                    "tabular font-semibold",
                    prof.roiMonthlyPct >= 0 ? "text-success" : "text-destructive"
                  )}
                  title={`Net profit ÷ total operating cost — annualized ≈ ${prof.roiAnnualPct.toFixed(0)}%`}
                >
                  {prof.roiMonthlyPct.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Daily profit</p>
                <p
                  className={cn(
                    "tabular font-semibold",
                    prof.netDailyUsd >= 0 ? "text-success" : "text-destructive"
                  )}
                >
                  {formatCurrency(prof.netDailyUsd)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Weekly profit</p>
                <p
                  className={cn(
                    "tabular font-semibold",
                    prof.netWeeklyUsd >= 0 ? "text-success" : "text-destructive"
                  )}
                >
                  {formatCurrency(prof.netWeeklyUsd)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Monthly profit</p>
                <p
                  className={cn(
                    "tabular font-semibold",
                    prof.netMonthlyUsd >= 0 ? "text-success" : "text-destructive"
                  )}
                >
                  {formatCurrency(prof.netMonthlyUsd)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Break-even</p>
                <p className="tabular font-semibold">
                  {prof.breakEvenDays != null ? `${prof.breakEvenDays} days` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Profit margin</p>
                <p
                  className={cn(
                    "tabular font-semibold",
                    prof.profitMarginPct >= 15 ? "text-success" : prof.profitMarginPct >= 0 ? "text-warning" : "text-destructive"
                  )}
                >
                  {prof.profitMarginPct.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground" title={`Risk haircut ${(prof.riskFactor * 100).toFixed(0)}% from seat safety, alpha economics and earning reality`}>
                  Risk-adjusted
                </p>
                <p
                  className={cn(
                    "tabular font-semibold",
                    prof.riskAdjustedMonthlyUsd >= prof.targetUsd ? "text-success" : "text-warning"
                  )}
                >
                  {formatCurrency(prof.riskAdjustedMonthlyUsd)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Total opex</p>
                <p className="tabular font-semibold">{formatCurrency(prof.totalCostsUsd)}</p>
              </div>
            </div>

            {/* NET-EARNINGS-1 — conservative / base / optimistic, each with a
                confidence level. Replaces the old bare Bear/Base/Bull strip:
                the rewards side now decomposes into ramp × uptime ×
                competition × alpha, the cost side shows every line, and the
                confidence chip says how much data stands behind the number. */}
            {estimate && (
              <div className="mt-3 border-t border-border/60 pt-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Net earnings estimate
                  </p>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[10px] font-semibold",
                        CONSERVATIVE_VERDICT_META[estimate.conservativeVerdict].className
                      )}
                      title={CONSERVATIVE_VERDICT_META[estimate.conservativeVerdict].detail}
                    >
                      worst month: {CONSERVATIVE_VERDICT_META[estimate.conservativeVerdict].label}
                    </span>
                    <p className="text-[10px] text-muted-foreground">
                      planning range — earnings are not guaranteed
                    </p>
                  </div>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {estimate.oneLine}
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {([
                    estimate.conservative,
                    estimate.base,
                    estimate.optimistic,
                  ] as const).map((sc) => {
                    const cb = CONFIDENCE_BAND_STYLE[sc.confidenceBand];
                    const isCons = sc.key === "conservative";
                    const factorEntries: [string, number][] = [
                      ["ramp", sc.factors.ramp],
                      ["uptime", sc.factors.uptime],
                      ["competition", sc.factors.competition],
                      ["alpha price", sc.factors.alpha],
                    ];
                    return (
                      <div
                        key={sc.key}
                        className={cn(
                          "rounded-md border px-3 py-2",
                          sc.key === "optimistic"
                            ? "border-primary/30"
                            : sc.key === "conservative" && sc.netMonthlyUsd < 0
                              ? "border-warning/40"
                              : "border-border/60"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-[10px] font-bold tracking-widest text-muted-foreground">
                            {sc.label.toUpperCase()}
                            {sc.key === "base" && (
                              <span className="ml-1 font-normal normal-case tracking-normal">
                                (gates use this)
                              </span>
                            )}
                          </p>
                          <span
                            className={cn(
                              "rounded border px-1 py-px text-[9px] font-bold",
                              cb.className
                            )}
                            title={`${Math.round(sc.confidence * 100)}% confidence — drivers:\n${sc.confidenceDrivers.join("\n")}`}
                          >
                            {sc.confidenceBand} {Math.round(sc.confidence * 100)}%
                          </span>
                        </div>
                        <p
                          className={cn(
                            "tabular text-lg font-bold",
                            sc.netMonthlyUsd > 0
                              ? "text-success"
                              : sc.netMonthlyUsd < 0
                                ? "text-destructive"
                                : "text-warning"
                          )}
                        >
                          {formatCurrency(sc.netMonthlyUsd)}
                          <span className="ml-1 text-[10px] font-normal text-muted-foreground">/mo</span>
                        </p>
                        <p className="tabular text-[10px] text-muted-foreground">
                          gross {formatCurrency(sc.grossMonthlyUsd)} − costs{" "}
                          {formatCurrency(estimate.costs.totalUsd)}
                          {sc.meetsTarget ? " · ✓ target" : " · ✗ under target"}
                        </p>
                        {isCons && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {factorEntries
                              .filter(([, f]) => f !== 1)
                              .map(([k, f]) => (
                                <span
                                  key={k}
                                  className="mono rounded bg-muted/60 px-1 py-px text-[9px] text-muted-foreground"
                                  title={`Conservative factor: ${k} ×${f.toFixed(2)}`}
                                >
                                  {k} ×{f.toFixed(2)}
                                </span>
                              ))}
                          </div>
                        )}
                        <p className="mt-1 text-[10px] leading-tight text-muted-foreground" title={sc.note}>
                          {sc.note}
                        </p>
                      </div>
                    );
                  })}
                </div>
                {/* Confidence evidence — the base month's drivers, in one line */}
                <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                  <span className="font-semibold">Base confidence {estimate.base.confidenceBand.toLowerCase()} ({Math.round(estimate.base.confidence * 100)}%):</span>{" "}
                  {estimate.base.confidenceDrivers.join(" ")}
                </p>
                {/* Cost stack + upfront cash — the full ownership bill */}
                <p
                  className="mt-1.5 text-[10px] leading-snug text-muted-foreground"
                  title={`Every scenario carries the same monthly bill — costs run whether or not rewards arrive. Basis: ${estimate.costBasisNote}`}
                >
                  <span className="font-semibold">Costs {formatCurrency(estimate.costs.totalUsd)}/mo:</span>{" "}
                  {owned ? "electricity" : "GPU rent"} {formatCurrency(estimate.costs.gpuOrElectricityUsd)} · cooling{" "}
                  {formatCurrency(estimate.costs.coolingUsd)} · storage {formatCurrency(estimate.costs.storageUsd)} · infra{" "}
                  {formatCurrency(estimate.costs.infrastructureUsd)} · maintenance {formatCurrency(estimate.costs.maintenanceUsd)} · registration{" "}
                  {formatCurrency(estimate.costs.registrationUsd)} · hardware recovery {formatCurrency(estimate.costs.hardwareRecoveryUsd)} · other{" "}
                  {formatCurrency(estimate.costs.otherUsd)}
                  {prof.hardwareRecoveryIncomplete && (
                    <span className="ml-1 text-warning">
                      (set your rig cost in settings to charge hardware recovery)
                    </span>
                  )}
                </p>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  <span className="font-semibold">Upfront cash {formatCurrency(estimate.upfrontCashUsd)}</span>{" "}
                  (registration burn + first-month costs) · break-even ≈{" "}
                  {estimate.breakEvenMonths != null ? `${estimate.breakEvenMonths} months` : "never at current base net"}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="bg-card/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Wallet className="h-4 w-4" />
                <span className="text-xs font-medium">Net monthly (after GPU)</span>
              </div>
              <p
                className={cn(
                  "mt-1 tabular text-xl font-bold",
                  (o.netMonthlyUsd ?? o.estimatedMonthlyRewardUsd) >= 0
                    ? "text-success"
                    : "text-destructive"
                )}
              >
                {formatCurrency(o.netMonthlyUsd ?? o.estimatedMonthlyRewardUsd)}
              </p>
              {o.gpuCostMonthlyUsd != null && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  gross {formatCurrency(o.grossMonthlyUsd ?? o.estimatedMonthlyRewardUsd)} − GPU{" "}
                  {formatCurrency(o.gpuCostMonthlyUsd)}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="bg-card/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs font-medium">Est. APY</span>
              </div>
              <p className="mt-1 tabular text-xl font-bold text-success">
                {formatPercent(o.estimatedApy)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                vs {o.requiredStake.toLocaleString()} TAO required stake
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Cpu className="h-4 w-4" />
                <span className="text-xs font-medium">Daily reward</span>
              </div>
              <p className="mt-1 tabular text-xl font-bold">
                {o.estimatedDailyReward.toFixed(3)}{" "}
                <span className="text-sm font-normal text-muted-foreground">TAO</span>
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                newcomer mid-pack estimate
                {o.rewardMedianShare != null && o.rewardMedianShare < 0.9 && (
                  <span title="A top UID (whale) captures most of this subnet's rewards — the estimate is discounted by the median earner's share of the mean">
                    {" "}· {Math.round(o.rewardMedianShare * 100)}% spread
                  </span>
                )}{" "}
                · {(o.rewardedRatio != null ? (o.rewardedRatio * 100).toFixed(0) : "—")}% of slots rewarded
                {o.perEarningMeanDailyTao != null && o.perEarningMeanDailyTao > o.estimatedDailyReward * 3 && (
                  <span title="Mean over currently rewarded UIDs — what top performers earn today (upside if you outcompete)">
                    {" "}· mean earner {o.perEarningMeanDailyTao.toFixed(2)} TAO/d
                  </span>
                )}
              </p>
              {o.earnChance && (
                <div
                  className={cn(
                    "mt-2 rounded-md border px-2 py-1.5",
                    o.earnChance.level === "high"
                      ? "border-success/30 bg-success/5"
                      : o.earnChance.level === "medium"
                        ? "border-warning/30 bg-warning/5"
                        : "border-destructive/30 bg-destructive/5"
                  )}
                  title={`Chance to earn · month 1 — ${o.earnChance.note}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Chance to earn · month 1
                    </span>
                    <span
                      className={cn(
                        "text-xs font-bold uppercase tracking-wide",
                        o.earnChance.level === "high"
                          ? "text-success"
                          : o.earnChance.level === "medium"
                            ? "text-warning"
                            : "text-destructive"
                      )}
                    >
                      {o.earnChance.level}
                      {o.earnChance.pct > 0 && (
                        <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground">
                          ~{o.earnChance.pct}%
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                    {o.earnChance.note}. Uptime keeps the seat — performance fills
                    the wallet.
                  </p>
                </div>
              )}
              <RegisterOddsBlock row={o} className="mt-2" />
            </CardContent>
          </Card>
        </div>

        <Separator />

        <div>
          <h3 className="text-eyebrow mb-2 text-muted-foreground">Miner's ledger</h3>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Work type</p>
              <p className="font-medium">{o.workType ?? o.category}</p>
            </div>
            <div>
              {/* RIDGES-FIX: honest GPU sourcing — repo-documented requirement,
                  work-type typical, or a revenue-based estimate (not a spec). */}
              {(() => {
                const gpuSource = o.minVramGb === 0
                  ? o.requirementsSource
                    ? { label: "Hardware (repo)", title: `Documented by the subnet's repo: ${o.requirementsSource}` }
                    : { label: "Typical hardware", title: "Typical hardware for this work type — derived from the subnet's description, not official docs" }
                  : o.requirementsSource
                    ? { label: "GPU required", title: `Documented by the subnet's repo: ${o.requirementsSource}` }
                    : o.hardwareClassified
                      ? { label: "Typical GPU", title: "Typical GPU for this work type — derived from the subnet's description, not official docs" }
                      : { label: "GPU (revenue est.)", title: "Not documented by the subnet — estimated from what per-miner revenue could fund. Check the subnet's docs before buying hardware." };
                return (
                  <>
                    <p className="text-xs text-muted-foreground" title={gpuSource.title}>{gpuSource.label}</p>
                    <p className="mono text-xs font-medium">{o.recommendedGpu.replace("NVIDIA ", "")}</p>
                  </>
                );
              })()}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Alpha price</p>
              <p className="tabular font-medium">
                {o.alphaPriceUsd != null && o.alphaPriceUsd > 0
                  ? `$${o.alphaPriceUsd < 1 ? o.alphaPriceUsd.toFixed(4) : o.alphaPriceUsd.toFixed(2)}`
                  : "—"}
                {o.alphaChange24h != null && (
                  <span className={cn("ml-1.5 text-xs", o.alphaChange24h >= 0 ? "text-success" : "text-destructive")}>
                    {o.alphaChange24h >= 0 ? "▲" : "▼"}
                    {Math.abs(o.alphaChange24h).toFixed(1)}%
                  </span>
                )}
              </p>
              {o.rewardRealizability != null && o.rewardRealizability < 0.9 && (
                <p
                  className="mt-0.5 text-[10px] leading-tight text-muted-foreground"
                  title="Selling the subnet's whole daily reward flow into its own pool realizes less than the spot quote (balancer curve). Dollar figures here use the realizable price."
                >
                  realizable ${o.realizableAlphaPriceUsd != null && o.realizableAlphaPriceUsd > 0 ? (o.realizableAlphaPriceUsd < 1 ? o.realizableAlphaPriceUsd.toFixed(4) : o.realizableAlphaPriceUsd.toFixed(2)) : "—"}
                  {" "}· {(o.rewardRealizability * 100).toFixed(0)}% of spot
                </p>
              )}
              {o.dilutionRatio != null && o.dilutionRatio > 2 && (
                <p
                  className={cn(
                    "mt-0.5 text-[10px] leading-tight",
                    o.dilutionRatio > 50
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground"
                  )}
                  title="New TAO entering the subnet pool per day backs only a fraction of the α rewards valued at spot — the excess is dilution-subsidized and depends on fresh staking demand."
                >
                  TAO inflow backs {dilutionPct(o.dilutionRatio)}% of paper value
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pool liquidity</p>
              <p className="mono tabular text-xs font-medium">
                {o.liquidityTao != null ? `${formatNumber(o.liquidityTao)} TAO` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Seat availability</p>
              <p className="tabular font-medium">
                {o.freeSlots != null && o.totalSlots ? `${o.freeSlots} / ${o.totalSlots}` : "—"}
                {(() => {
                  const seat = assessSeatChance({
                    minersCount: o.totalSlots != null && o.freeSlots != null ? o.totalSlots - o.freeSlots : null,
                    maxUids: o.totalSlots ?? null, // WINDUP-1: totalSlots also undefined-able here
                    freeSlots: o.freeSlots,
                    burnCostTao: o.burnCostTao ?? null,
                    immunityBlocks: o.immunityBlocks ?? null,
                    rewardedRatio: o.rewardedRatio ?? null,
                  });
                  if (seat.verdict === "unknown") return null;
                  const cls =
                    seat.verdict === "open"
                      ? "text-success"
                      : seat.verdict === "burn-entry"
                        ? "text-warning"
                        : "text-destructive";
                  return (
                    <span className={cn("ml-1.5 text-xs font-medium", cls)} title={seat.detail}>
                      · {seat.verdict === "open" ? "open" : seat.verdict === "burn-entry" ? "burn-entry" : "competitive"}
                    </span>
                  );
                })()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Burn entry</p>
              <p className="mono tabular text-xs font-medium" title="Pay this TAO to register immediately — when the subnet is full it replaces the worst-performing non-immune UID">
                {o.burnCostTao != null ? `~${formatBurnTao(o.burnCostTao)} TAO` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Top-10% take</p>
              <p
                className={cn(
                  "tabular font-medium",
                  o.top10IncentiveShare != null && o.top10IncentiveShare > 0.7
                    ? "text-warning"
                    : ""
                )}
                title="Share of last-epoch incentive captured by the top 10% of UIDs — near 100% means a knife fight for rewards"
              >
                {o.top10IncentiveShare != null
                  ? `${Math.round(o.top10IncentiveShare * 100)}% of emissions`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Registration burn</p>
              <p className="mono tabular text-xs font-medium">
                {o.burnCostTao != null ? `${formatBurnTao(o.burnCostTao)} TAO` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ramp-up estimate</p>
              <p className="tabular font-medium">
                {o.rampWeeks != null
                  ? `~${o.rampWeeks.toFixed(0)} week${o.rampWeeks >= 1.5 ? "s" : ""}`
                  : "—"}
                {o.immunityBlocks != null && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {Math.round((o.immunityBlocks * 12) / 3600)}h immunity
                  </span>
                )}
              </p>
              {rampWeeksSourceNote(o.mechanics ?? null) && (
                <p className="text-[10px] text-muted-foreground">
                  {rampWeeksSourceNote(o.mechanics ?? null)}
                </p>
              )}
            </div>
          </div>
          {o.hosting && (
            <div className="mt-3">
              <HostingWarningBlock hosting={o.hosting} source={o.requirementsSource} />
            </div>
          )}
          {o.mechanics && (
            <div className="mt-3">
              <OfficialMechanicsBlock mechanics={o.mechanics} />
            </div>
          )}
        </div>

        <Separator />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-display text-lg font-semibold">
              Demand reality
            </h3>
            {o.demandBand && (
              <Badge
                variant="outline"
                className={cn(
                  "capitalize",
                  o.demandBand === "real-demand"
                    ? "border-success/40 bg-success/10 text-success"
                    : o.demandBand === "mixed"
                      ? "border-warning/40 bg-warning/10 text-warning"
                      : "border-destructive/40 bg-destructive/10 text-destructive"
                )}
                title={
                  o.demandBand === "real-demand"
                    ? "On-chain signals point to real demand backing the rewards"
                    : o.demandBand === "mixed"
                      ? "Rewards are partly backed by staking inflow, partly by dilution"
                      : "Emissions alone pay miners — staking inflow backs only a small share"
                }
              >
                {o.demandBand === "real-demand"
                  ? "real demand signals"
                  : o.demandBand === "mixed"
                    ? "mixed — emission-assisted"
                    : "emission-funded"}
              </Badge>
            )}
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Does real demand back the rewards, or do emissions alone pay miners?
            On-chain signals only — off-chain product usage (API customers,
            client contracts) is invisible here and must be checked at the
            subnet's own product.
          </p>
          {o.demandScore != null ? (
            <>
              <div className="mb-2 flex items-baseline gap-2">
                <span
                  className={cn(
                    "mono tabular text-2xl font-semibold",
                    o.demandBand === "real-demand"
                      ? "text-success"
                      : o.demandBand === "mixed"
                        ? "text-warning"
                        : "text-destructive"
                  )}
                >
                  {o.demandScore.toFixed(0)}
                </span>
                <span className="text-xs text-muted-foreground">/ 100 demand score</span>
              </div>
              <div className="space-y-3">
                {(o.demandParts ?? []).map((p) => (
                  <div key={p.key}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{p.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="mono text-[10px] text-muted-foreground">
                          w {Math.round(p.weight * 100)}%
                        </span>
                        <span
                          className={cn(
                            "tabular text-sm font-semibold",
                            p.score == null
                              ? "text-muted-foreground"
                              : p.score >= 60
                                ? "text-success"
                                : p.score <= 40
                                  ? "text-destructive"
                                  : "text-foreground"
                          )}
                        >
                          {p.score == null ? "—" : p.score.toFixed(0)}
                        </span>
                      </div>
                    </div>
                    <Progress
                      value={p.score ?? 0}
                      className="mt-1.5 h-1.5"
                      indicatorClassName={cn(
                        p.score == null
                          ? "bg-muted-foreground/30"
                          : p.score >= 60
                            ? "bg-success"
                            : p.score <= 40
                              ? "bg-destructive"
                              : "bg-warning"
                      )}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{p.detail}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not enough on-chain data yet for a demand score — no price
              history, pool or reward signals recorded for this subnet.
            </p>
          )}
        </div>

        <Separator />

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-display text-lg font-semibold">
              Score breakdown
            </h3>
            <span className="text-eyebrow text-muted-foreground">
              Miner's Ledger · 5 pillars
            </span>
          </div>
          <div className="space-y-4">
            {o.factors.map((f) => (
              <div key={f.name}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{f.name}</span>
                    {f.impact === "negative" && (
                      <AlertTriangle className="h-3 w-3 text-warning" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="mono text-[10px] text-muted-foreground">
                      w {Math.round(f.weight * 100)}%
                    </span>
                    <span
                      className={cn(
                        "tabular text-sm font-semibold",
                        f.raw >= 60
                          ? "text-success"
                          : f.raw <= 40
                            ? "text-destructive"
                            : "text-foreground"
                      )}
                    >
                      {f.raw.toFixed(0)}
                    </span>
                  </div>
                </div>
                <Progress
                  value={f.raw}
                  className="mt-1.5 h-1.5"
                  indicatorClassName={cn(
                    f.raw >= 60
                      ? "bg-success"
                      : f.raw <= 40
                        ? "bg-destructive"
                        : "bg-warning"
                  )}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Required stake</p>
            <p className="mono tabular font-medium">
              {o.requiredStake.toLocaleString()} TAO
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Utilization</p>
            <p className="tabular font-medium">
              {(o.utilization * 100).toFixed(0)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Confidence</p>
            <p className="tabular font-medium text-success">
              {formatPercent(o.confidence * 100)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="font-medium capitalize">{o.status}</p>
          </div>
        </div>

        {/* --- DILIGENCE-1: 14-stage pipeline → verdict → approve → provision --- */}
        <DiligencePanel o={o} onProvision={onProvision ?? (() => {})} />
      </DialogContent>
    </Dialog>
  );
}

/** Compact card for grid layouts. */
export function OpportunityCard({ opportunity: o }: { opportunity: Opportunity }) {
  // VERDICT-UNIFY-1 / PNL-RECONCILE-1 — same ONE verdict vocabulary as the
  // table and the dialog: conviction number + conviction verdict badge.
  const { data: profConfig } = useProfitabilityConfig();
  const pick = computeMinePick(o, costBasisFromConfig(profConfig));
  const band = VERDICT_STYLE[pick.verdict];
  const risk = getStatusColor(o.riskLevel);
  const prof = o.profitability;
  // Batch winner-stability trends — one request shared by every card.
  const { data: oddsTrends } = useOddsTrends();
  const oddsTrend = oddsTrends?.[o.netuid] ?? null;
  const hasOdds = o.earnChance != null || o.rampWeeks != null || oddsTrend != null;
  return (
    <Card className="editorial-card transition-all hover:border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-display truncate text-lg">
                {o.subnetName}
              </CardTitle>
              <Badge variant="outline" className="mono text-[10px]">
                {o.subnetSymbol}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              NetUID {o.netuid} · {o.category}
            </p>
          </div>
          <div className="text-right">
            <p
              className="tabular text-2xl font-bold text-primary"
              title={`Conviction — the decision score, hard-gated. Ledger composite: ${o.score.toFixed(1)}`}
            >
              {pick.conviction}
            </p>
            <Badge variant="outline" className={cn("text-[10px]", band.bg, band.color)}>
              {band.label}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Est. APY</p>
            <p className="tabular font-medium text-success">
              {formatPercent(o.estimatedApy)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net monthly</p>
            <p
              className={cn(
                "tabular font-medium",
                (o.netMonthlyUsd ?? o.estimatedMonthlyRewardUsd) >= 0
                  ? "text-success"
                  : "text-destructive"
              )}
            >
              {formatCurrency(o.netMonthlyUsd ?? o.estimatedMonthlyRewardUsd)}
            </p>
            {prof && (
              <p
                className={cn(
                  "text-[10px] font-medium",
                  prof.meetsMinimum ? "text-success" : "text-destructive"
                )}
              >
                {prof.meetsMinimum
                  ? `✓ ≥ $${prof.targetUsd.toLocaleString()} target`
                  : `✗ AVOID · < $${prof.targetUsd.toLocaleString()}`}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">GPU</p>
            <p className="mono truncate text-xs text-muted-foreground">
              {o.recommendedGpu.replace("NVIDIA ", "")}
            </p>
            {o.hosting && (
              <HostingChips hosting={o.hosting} source={o.requirementsSource} className="mt-1" />
            )}
            {o.mechanics && (
              <MechanicsChips mechanics={o.mechanics} className="mt-1" />
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Risk</p>
            <span
              className={cn(
                "badge-status capitalize",
                risk.bg,
                risk.text
              )}
            >
              {o.riskLevel}
            </span>
          </div>
        </div>
        {hasOdds && (
          <div className="rounded-lg border border-border/40 bg-background/50 px-2.5 py-1.5">
            <p className="text-eyebrow text-[9px] text-muted-foreground">
              If you register today
            </p>
            <RegisterOddsInline row={o} trend={oddsTrend} className="mt-1" />
          </div>
        )}
        <Progress
          value={o.score}
          className="h-1"
          indicatorClassName={cn(band.color.replace("text-", "bg-"))}
        />
      </CardContent>
    </Card>
  );
}
