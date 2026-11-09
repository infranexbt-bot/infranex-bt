"use client";

import type { ReactNode } from "react";
import { BadgeCheck, KeyRound, MinusCircle, XCircle, TrendingUp, Cpu, Wallet, Zap, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useGpuBuyDecision } from "@/hooks/use-gpu-buy-decision";
import type { BuyDecisionRow, BuyVerdict } from "@/lib/infranex/gpu-buy-decision";

// ---------------------------------------------------------------------------
// GPU BUY DECISION — the answer to "which GPU should I actually buy?".
// Pool ≠ earnings: every row shows the chain-measured pool next to the
// per-earning-UID reality, the platform's own gate-passing entrant plan,
// street capex with payback, the Vast.ai rent alternative and a verdict.
// ---------------------------------------------------------------------------

const VERDICT_META: Record<
  BuyVerdict,
  { label: string; chip: string; icon: typeof BadgeCheck; tip: string }
> = {
  BUY: {
    label: "BUY",
    chip: "border-success/60 bg-success/10 text-success",
    icon: BadgeCheck,
    tip: "Clears the TAO goal and pays the card back inside 12 months.",
  },
  "RENT-FIRST": {
    label: "RENT FIRST",
    chip: "border-warning/60 bg-warning/10 text-warning",
    icon: KeyRound,
    tip: "The profit works, but capex/payback is heavy — validate by renting before buying.",
  },
  MARGINAL: {
    label: "MARGINAL",
    chip: "border-border bg-card/60 text-muted-foreground",
    icon: MinusCircle,
    tip: "Pays the bills but misses the goal line — capital would idle.",
  },
  AVOID: {
    label: "AVOID",
    chip: "border-destructive/50 bg-destructive/10 text-destructive",
    icon: XCircle,
    tip: "The platform's own gates reject every reachable entry — do not buy.",
  },
};

const CLS_CHIP: Record<string, string> = {
  datacenter: "border-primary/50 bg-primary/10 text-primary",
  pro: "border-warning/50 bg-warning/10 text-warning",
  consumer: "border-success/50 bg-success/10 text-success",
};

const CLS_LABEL: Record<string, string> = {
  datacenter: "DC",
  pro: "Pro",
  consumer: "Consumer",
};

function usd(n: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (n == null) return "—";
  const rounded = Math.round(n);
  const body = `$${Math.abs(rounded).toLocaleString()}`;
  if (opts.sign) return rounded < 0 ? `−${body}` : body;
  return body;
}

function tao(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function paybackLabel(months: number | null): string {
  if (months == null) return "—";
  if (months > 900) return "never";
  if (months >= 24) return `${Math.round(months)} mo`;
  return `${months.toFixed(1)} mo`;
}

function VerdictBadge({ verdict }: { verdict: BuyVerdict }) {
  const meta = VERDICT_META[verdict];
  const Icon = meta.icon;
  return (
    <span
      title={meta.tip}
      className={cn(
        "mono inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em]",
        meta.chip
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function GpuBuyDecisionPanel() {
  const { data, isFetching, error } = useGpuBuyDecision();

  if (error) {
    return (
      <section className="rounded-xl border border-border/70 bg-card/60 p-5">
        <h3 className="text-display text-base font-bold tracking-tight">GPU Buy Decision</h3>
        <p className="mono mt-2 text-[11px] text-destructive">
          decision engine unavailable — {error instanceof Error ? error.message : "unknown error"} · the 60s poll
          keeps retrying
        </p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-xl border border-border/70 bg-card/60 p-5">
        <h3 className="text-display text-base font-bold tracking-tight">GPU Buy Decision</h3>
        <p className="mono mt-2 text-[11px] text-muted-foreground">
          computing buckets from the live chain snapshot…
        </p>
      </section>
    );
  }

  const { rows, meta } = data;
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
    return acc;
  }, {});
  // The strongest honest GPU entry vs the CPU-only baseline — the "is any
  // purchase even worth it" ratio. Guarded against a CPU anchor of ≤ 0.
  const gpuBestRow = rows.reduce<BuyDecisionRow | null>((m, r) => {
    if (r.entrantMonthlyUsd == null) return m;
    if (!m || (r.entrantMonthlyUsd ?? 0) > (m.entrantMonthlyUsd ?? 0)) return r;
    return m;
  }, null);
  const gpuVsCpuPct =
    gpuBestRow?.entrantMonthlyUsd != null &&
    meta.cpuBest?.netMonthlyUsd != null &&
    meta.cpuBest.netMonthlyUsd > 0
      ? (gpuBestRow.entrantMonthlyUsd / meta.cpuBest.netMonthlyUsd) * 100
      : null;

  return (
    <section className="rounded-xl border border-border/70 bg-card/60 p-5">
      {/* --- Header --------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 text-primary">
          <Wallet className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-display text-base font-bold tracking-tight">GPU Buy Reality Check</h3>
          <p className="mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            which card earns its capex · goal {tao(meta.goalTaoPerMonth, 0)} TAO/mo = {usd(meta.goalMonthlyUsd)} ·
            TAO spot {usd(meta.taoUsd)} · block {meta.blockNumber ?? "—"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <a
            href="/?view=gpu-decision"
            title="Open the interactive decision lab (Section 05h) — EV model with skill/median/price sliders"
            className="mono inline-flex items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-primary hover:bg-primary/20"
          >
            decision lab →
          </a>
          {(["BUY", "RENT-FIRST", "MARGINAL", "AVOID"] as BuyVerdict[]).map((v) => (
            <span
              key={v}
              title={VERDICT_META[v].tip}
              className={cn(
                "mono inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em]",
                VERDICT_META[v].chip
              )}
            >
              {VERDICT_META[v].label}
              <span className="tabular opacity-80">{counts[v] ?? 0}</span>
            </span>
          ))}
          {isFetching && (
            <span className="mono inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/40 px-2 py-1 text-[10px] text-muted-foreground">
              <Zap className="h-3 w-3 animate-pulse text-primary" aria-hidden="true" />
              live · 60s
            </span>
          )}
        </div>
      </div>

      {/* --- Reality banner --------------------------------------------------- */}
      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <div
          className="rounded-lg border border-warning/40 bg-warning/[0.06] p-4"
          title={meta.poolNote}
        >
          <p className="mono flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-warning">
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            pool ≠ earnings
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/90">
            The biggest pools sit behind the worst odds:{" "}
            <span className="mono text-foreground">{meta.avoidCount}/{meta.classifiedCount}</span> subnets are
            platform-classified <span className="font-semibold text-destructive">AVOID</span> today. H100 owns the
            largest emission pool (~1,484 TAO/d) yet only ~9.9% of its registered miners earn anything, and its best
            headline (SN51&apos;s $48,952/mo) is itself gate-rejected. Judge a card by the{" "}
            <span className="font-semibold">per-earning-UID</span> column and the gate-passing entrant plan — never
            by pool size.
          </p>
        </div>
        <div className="rounded-lg border border-success/40 bg-success/[0.06] p-4">
          <p className="mono flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-success">
            <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
            buy-nothing baseline
          </p>
          {meta.cpuBest ? (
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/90">
              The best gate-passing subnet needs <span className="font-semibold">no GPU at all</span>: SN
              {meta.cpuBest.netuid} {meta.cpuBest.name} —{" "}
              <span className="mono font-bold text-success">{usd(meta.cpuBest.netMonthlyUsd)}/mo</span> (
              {tao(meta.cpuBest.netTaoPerMonth)} TAO) · {meta.cpuBest.classification}/{meta.cpuBest.difficulty} ·
              CPU-only. Every GPU row below is judged against that line
              {goalShortfallLine(gpuBestRow, meta.cpuBest, gpuVsCpuPct)}
              .
            </p>
          ) : (
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/90">
              No gate-passing CPU-only subnet in today&apos;s snapshot.
            </p>
          )}
        </div>
      </div>

      {/* --- Decision table ---------------------------------------------------- */}
      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="table-header hover:bg-transparent">
              <TableHead className="w-[250px]">GPU</TableHead>
              <TableHead className="w-[110px]">Verdict</TableHead>
              <TableHead className="w-[120px]">Demand → reach</TableHead>
              <TableHead className="w-[130px]">Live pool</TableHead>
              <TableHead className="w-[150px]">Reality check</TableHead>
              <TableHead className="w-[220px]">Gate-passing entrant</TableHead>
              <TableHead className="w-[150px]">Capex → payback</TableHead>
              <TableHead className="w-[110px]">Rent 24/7</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <BuyRow key={r.model} row={r} />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* --- Footnotes ---------------------------------------------------------- */}
      <div className="editorial-rule my-4" />
      <div className="grid gap-3 text-[11.5px] leading-relaxed text-muted-foreground md:grid-cols-2">
        <p>
          <span className="font-semibold text-foreground/90">Entrant plan.</span> The best subnet in each bucket that
          survives the platform&apos;s own Opportunity gates (never an AVOID-classified headline), valued on the
          owned basis — electricity ({usd(meta.electricityUsdPerKwh)}/kWh, +150 W host, +15% cooling),
          maintenance, storage and opex already netted. Payback = street capex ÷ that monthly net.
        </p>
        <p>
          <span className="font-semibold text-foreground/90">Prices &amp; rents as of {meta.capexAsOf}.</span>{" "}
          {meta.priceSources}. TAO-valued figures move with the live spot every poll; capex is a one-time street
          number — always re-check listings before wiring money.
        </p>
      </div>
    </section>
  );
}

function goalShortfallLine(
  gpuBestRow: BuyDecisionRow | null,
  cpuBest: { netuid: number; netMonthlyUsd: number | null } | null,
  gpuVsCpuPct: number | null
): React.ReactNode {
  if (!gpuBestRow || !cpuBest || gpuVsCpuPct == null) return null;
  return (
    <>
      {" "}— the strongest honest GPU entry ({gpuBestRow.label} → SN{gpuBestRow.bestSubnet?.netuid}) reaches
      just <span className="mono font-semibold">{gpuVsCpuPct < 1 ? gpuVsCpuPct.toFixed(1) : gpuVsCpuPct.toFixed(0)}%</span> of it
    </>
  );
}

function BuyRow({ row }: { row: BuyDecisionRow }) {
  const vm = VERDICT_META[row.verdict];
  return (
    <TableRow className="align-top">
      <TableCell>
        <p className="flex items-center gap-2 text-sm font-semibold">
          {row.label}
          <span
            className={cn(
              "mono rounded border px-1 py-px text-[9px] font-bold uppercase",
              CLS_CHIP[row.cls]
            )}
            title={`${row.cls}-class card · ${row.vramGb} GB VRAM · ${row.powerW} W`}
          >
            {CLS_LABEL[row.cls]}
          </span>
        </p>
        <p className="mono mt-1 text-[10px] text-muted-foreground" title={row.capexNote}>
          {row.capexUsd != null
            ? `street ${usd(row.capexUsd)}${
                row.capexLowUsd != null && row.capexHighUsd != null
                  ? ` (${usd(row.capexLowUsd)}–${usd(row.capexHighUsd)})`
                  : ""
              }`
            : "not retail"}
          {` · ${row.powerW} W ≈ ${usd(row.powerMonthlyUsd)}/mo power`}
        </p>
        {row.reasons.length > 0 && (
          <ul className="mt-1.5 space-y-1" title={row.reasons.join("\n")}>
            {row.reasons.slice(0, 2).map((why) => (
              <li key={why} className="flex gap-1 text-[11px] leading-snug text-muted-foreground">
                <span className="text-primary">·</span>
                <span className="min-w-0">{why}</span>
              </li>
            ))}
            {row.reasons.length > 2 && (
              <li className="text-[10px] italic text-muted-foreground/70">
                +{row.reasons.length - 2} more (hover the list)
              </li>
            )}
          </ul>
        )}
      </TableCell>
      <TableCell>
        <VerdictBadge verdict={row.verdict} />
        {row.entrantMonthlyUsd != null && (
          <p className="mono mt-1.5 text-[10px] text-muted-foreground">
            {row.entrantMonthlyTao != null ? `${tao(row.entrantMonthlyTao, 2)} TAO/mo` : ""}
          </p>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <p className="mono text-[11px] tabular">
          {row.reachableSubnets.length}/{row.demandSubnets.length} subnets
        </p>
        {row.teeBlockedSubnets.length > 0 && (
          <p
            className="mono mt-0.5 text-[10px] text-warning"
            title={`TEE-gated and unreachable for this card: SN${row.teeBlockedSubnets.join(", SN")}`}
          >
            −{row.teeBlockedSubnets.length} TEE-gated
          </p>
        )}
        <p className="mono mt-0.5 text-[10px] text-muted-foreground" title={row.demandSubnets.map((n) => `SN${n}`).join(", ")}>
          {row.demandSubnets.slice(0, 6).map((n) => `SN${n}`).join(" ")}
          {row.demandSubnets.length > 6 ? ` +${row.demandSubnets.length - 6}` : ""}
        </p>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <p className="mono flex items-center gap-1 text-[11px] tabular font-semibold" title="Sum of miner-side emissions across the reachable subnets naming this card (chain-measured, live)">
          <TrendingUp className="h-3 w-3 text-primary" aria-hidden="true" />
          {tao(row.poolTaoPerDay)} TAO/d
        </p>
        <p className="mono mt-0.5 text-[10px] text-muted-foreground">≈ {usd(row.poolUsdPerDay)}/d at spot</p>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <p
          className="mono text-[11px] tabular font-semibold"
          title="Realizability-weighted emission ÷ rewarded UIDs — what ONE winning UID captures per day on average in these subnets (UIDs often run multi-GPU rigs)."
        >
          {row.perEarningUsdPerDay != null ? `${usd(row.perEarningUsdPerDay)}/d per earning UID` : "no reward vector"}
        </p>
        <p
          className="mono mt-0.5 text-[10px] tabular text-muted-foreground"
          title="Rewarded UIDs ÷ registered miners across the bucket — the odds a fresh UID earns at all."
        >
          {row.rewardedRatioPct != null
            ? `${row.rewardedRatioPct.toFixed(1)}% of ${row.registeredMiners.toLocaleString()} miners rewarded`
            : "rewarded ratio unknown"}
        </p>
      </TableCell>
      <TableCell>
        {row.bestSubnet ? (
          <>
            <p className="text-[12px] font-semibold">
              SN{row.bestSubnet.netuid} {row.bestSubnet.name}
            </p>
            <p className="mono mt-0.5 text-[11px] tabular">
              <span
                className={cn(
                  "font-bold",
                  (row.entrantMonthlyUsd ?? 0) >= row.goalMonthlyUsd ? "text-success" : "text-foreground/90"
                )}
              >
                {usd(row.entrantMonthlyUsd, { sign: true })}/mo
              </span>
              <span className="ml-1 text-muted-foreground">({tao(row.entrantMonthlyTao, 2)} TAO)</span>
            </p>
            <p className="mono mt-0.5 text-[10px] text-muted-foreground">
              {row.bestSubnet.classification}/{row.bestSubnet.difficulty}
              {row.bestSubnet.reference === "multi-gpu" ? " · node-class build" : " · single-GPU"}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground/70">no honest entry</p>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap" title={vm.tip}>
        <p className="mono text-[11px] tabular font-semibold">
          {row.capexUsd != null ? usd(row.capexUsd) : "n/a"}
          <span className="mx-1 text-muted-foreground">→</span>
          {row.paybackMonths != null ? paybackLabel(row.paybackMonths) : "—"}
        </p>
        <p className="mono mt-0.5 text-[10px] text-muted-foreground">
          {row.paybackMonths != null && row.paybackMonths <= 12
            ? "recovers capex inside a year"
            : row.paybackMonths != null && row.paybackMonths > 900
              ? "net ≤ $0 — never pays back"
              : row.paybackMonths != null
                ? "slow capital recovery"
                : row.capexUsd == null
                  ? "rent from clouds instead"
                  : "no profit to pay back"}
        </p>
      </TableCell>
      <TableCell className="whitespace-nowrap" title={row.rentNote ?? undefined}>
        <p className="mono text-[11px] tabular">
          {row.rentMonthlyUsd != null ? `${usd(row.rentMonthlyUsd)}/mo` : "—"}
        </p>
        <p className="mono mt-0.5 text-[10px] text-muted-foreground">
          {row.rentHourlyUsd != null ? `$${row.rentHourlyUsd.toFixed(2)}/hr on Vast.ai` : row.rentNote ?? "no market rate"}
        </p>
      </TableCell>
    </TableRow>
  );
}
