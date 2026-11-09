"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownUp,
  CircuitBoard,
  Cpu,
  ExternalLink,
  Microchip,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useGpuSubnets } from "@/hooks/use-gpu-subnets";
import type { ExplorerFamily, ExplorerSubnet } from "@/lib/infranex/gpu-subnet-explorer";

// ---------------------------------------------------------------------------
// GPU → SUBNETS EXPLORER — "click a card, see every subnet where it mines."
// One chip per catalog GPU; selecting one lists every subnet whose audited
// requirement names it, TEE-reachability flagged per row, with the live
// chain pool and the per-earning-UID reality next to each requirement line.
// Vocabulary and gating are identical to the GPU Buy Decision panel.
// ---------------------------------------------------------------------------

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

const CLS_DOT: Record<string, string> = {
  datacenter: "bg-primary",
  pro: "bg-warning",
  consumer: "bg-success",
};

function usd(n: number | null | undefined, digits = 0): string {
  if (n == null) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}

function tao(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function TeeBadge({ family }: { family: ExplorerFamily }) {
  if (family.tee === "yes")
    return (
      <span
        className="mono inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-success/50 bg-success/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-success"
        title={family.teeNote}
      >
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        TEE ok
      </span>
    );
  if (family.tee === "server-edition-only")
    return (
      <span
        className="mono inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-warning/50 bg-warning/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-warning"
        title={family.teeNote}
      >
        <ShieldAlert className="h-3 w-3" aria-hidden="true" />
        TEE · SE only
      </span>
    );
  return (
    <span
      className="mono inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border/70 bg-background/40 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
      title={family.teeNote}
    >
      <ShieldAlert className="h-3 w-3" aria-hidden="true" />
      no TEE
    </span>
  );
}

function FamilySummary({ family }: { family: ExplorerFamily }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <div className="rounded-lg border border-border/70 bg-background/40 p-3">
        <p className="mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Subnets</p>
        <p className="mono mt-1 text-sm font-bold tabular">
          {family.reachableCount}
          <span className="text-xs font-medium text-muted-foreground">/{family.demandCount} usable</span>
        </p>
        {family.teeBlockedCount > 0 && (
          <p className="mono mt-0.5 text-[10px] text-warning" title="Subnets naming this card but demanding TEE attestation it cannot provide.">
            −{family.teeBlockedCount} TEE-gated
          </p>
        )}
      </div>
      <div className="rounded-lg border border-border/70 bg-background/40 p-3">
        <p className="mono flex items-center gap-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <TrendingUp className="h-3 w-3 text-primary" aria-hidden="true" />
          Live pool
        </p>
        <p className="mono mt-1 text-sm font-bold tabular" title="Sum of miner-side emissions across the USABLE subnets naming this card.">
          {tao(family.poolTaoPerDay)} TAO/d
        </p>
        <p className="mono mt-0.5 text-[10px] text-muted-foreground">≈ {usd(family.poolUsdPerDay)}/d at spot</p>
      </div>
      <div className="rounded-lg border border-border/70 bg-background/40 p-3">
        <p className="mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Rewarded UIDs</p>
        <p className="mono mt-1 text-sm font-bold tabular">{family.rewardedSlots.toLocaleString()}</p>
        <p className="mono mt-0.5 text-[10px] text-muted-foreground" title="Rewarded UIDs ÷ registered miners across the usable subnets.">
          {family.rewardedRatioPct != null ? `${family.rewardedRatioPct.toFixed(1)}% of ${family.registeredMiners.toLocaleString()}` : "ratio unknown"}
        </p>
      </div>
      <div className="rounded-lg border border-border/70 bg-background/40 p-3">
        <p className="mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Per earning UID</p>
        <p
          className={cn(
            "mono mt-1 text-sm font-bold tabular",
            (family.perEarningUsdPerDay ?? 0) > 500 ? "text-success" : ""
          )}
          title="Realizability-weighted emission ÷ rewarded UIDs — what ONE winning UID captures per day on average (UIDs often run multi-GPU rigs)."
        >
          {family.perEarningTaoPerDay != null ? `${tao(family.perEarningTaoPerDay, 2)} TAO/d` : "—"}
        </p>
        <p className="mono mt-0.5 text-[10px] text-muted-foreground">
          {family.perEarningUsdPerDay != null ? `≈ ${usd(family.perEarningUsdPerDay)}/d` : "no reward vector"}
        </p>
      </div>
      <div className="rounded-lg border border-border/70 bg-background/40 p-3">
        <p className="mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Street capex</p>
        <p className="mono mt-1 text-sm font-bold tabular" title={family.capexNote}>
          {family.capexUsd != null ? usd(family.capexUsd) : family.retail ? "varies" : "not retail"}
        </p>
        <p className="mono mt-0.5 text-[10px] text-muted-foreground">
          {family.capexLowUsd != null && family.capexHighUsd != null
            ? `${usd(family.capexLowUsd)}–${usd(family.capexHighUsd)} range`
            : family.rentHourlyUsd != null
              ? `rent ${usd(family.rentHourlyUsd, 2)}/hr`
              : "rent from clouds"}
        </p>
      </div>
      <div className="rounded-lg border border-border/70 bg-background/40 p-3">
        <p className="mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Card</p>
        <p className="mono mt-1 text-sm font-bold tabular" title={`${family.vramGb} GB VRAM · ${family.powerW} W`}>
          {family.vramGb} GB
        </p>
        <p className="mono mt-0.5 text-[10px] text-muted-foreground">{family.powerW} W · {CLS_LABEL[family.cls]}</p>
      </div>
    </div>
  );
}

function SubnetRow({ s }: { s: ExplorerSubnet }) {
  const gated = !s.reachable;
  return (
    <TableRow className={cn("align-top", gated && "opacity-55")}>
      <TableCell className="mono tabular text-muted-foreground">{s.netuid}</TableCell>
      <TableCell>
        <p className="text-[12.5px] font-semibold leading-snug">
          {s.name}
          {s.teeRequired && (
            <span
              className="mono ml-1.5 inline-flex items-center rounded border border-warning/50 bg-warning/10 px-1 py-px text-[9px] font-bold uppercase text-warning"
              title="This subnet demands TEE (Confidential Computing) attestation."
            >
              TEE
            </span>
          )}
        </p>
        {s.repo && (
          <a
            href={s.repo}
            target="_blank"
            rel="noreferrer"
            className="mono mt-0.5 flex max-w-[240px] items-center gap-1 truncate text-[10px] text-muted-foreground hover:text-primary"
            title={s.repo}
          >
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
            {s.repo.replace(/^https?:\/\/(www\.)?github\.com\//, "")}
          </a>
        )}
      </TableCell>
      <TableCell className="whitespace-normal">
        <p className="text-[12px] leading-relaxed text-foreground/90" title={s.evidence ?? s.headline}>
          {s.headline.length > 160 ? `${s.headline.slice(0, 160)}…` : s.headline}
        </p>
        <p className="mono mt-1 text-[10px] text-muted-foreground">
          {s.gpuCount != null ? `${s.gpuCount}× GPU` : "GPU count n/a"}
          {s.vramFloor != null ? ` · ≥${s.vramFloor} GB VRAM` : ""}
        </p>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {gated ? (
          <p
            className="mono text-[11px] font-semibold text-warning"
            title="This subnet demands TEE attestation and this card cannot provide it — listed for completeness only."
          >
            TEE-gated
          </p>
        ) : (
          <>
            <p className="mono text-[11px] tabular font-semibold" title="Chain-measured miner-side emission of this subnet (live).">
              {tao(s.poolTaoPerDay)} TAO/d
            </p>
            <p className="mono mt-0.5 text-[10px] text-muted-foreground">
              {s.rewardedMiners != null ? `${s.rewardedMiners.toLocaleString()} rewarded / ${s.minersCount?.toLocaleString() ?? "—"} miners` : "reward vector n/a"}
            </p>
          </>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {gated ? (
          <p className="mono text-[11px] text-muted-foreground">—</p>
        ) : (
          <p
            className={cn(
              "mono text-[11px] tabular font-semibold",
              (s.perEarningUsdPerDay ?? 0) > 500 ? "text-success" : ""
            )}
            title={
              s.estimated
                ? "≈ estimate — no reward vector; per-registered × 0.6 fallback."
                : "Realizability-weighted emission ÷ rewarded UIDs × TAO spot."
            }
          >
            {s.estimated ? "≈ " : ""}
            {s.perEarningUsdPerDay != null ? `${usd(s.perEarningUsdPerDay)}/d` : "—"}
          </p>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {s.classification ? (
          <span
            className={cn(
              "mono inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em]",
              s.classification === "AVOID"
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : s.classification === "SCALE" || s.classification === "EASY"
                  ? "border-success/50 bg-success/10 text-success"
                  : "border-border/70 bg-background/40 text-muted-foreground"
            )}
            title={`Platform opportunity classification: ${s.classification}/${s.difficulty ?? "—"}${s.netMonthlyUsd != null ? ` · net ${usd(s.netMonthlyUsd)}/mo` : ""}`}
          >
            {s.classification}
          </span>
        ) : (
          <span className="mono text-[10px] text-muted-foreground">unclassified</span>
        )}
        {s.netMonthlyUsd != null && (
          <p className="mono mt-1 text-[10px] tabular text-muted-foreground">{usd(s.netMonthlyUsd)}/mo net</p>
        )}
      </TableCell>
    </TableRow>
  );
}

export function GpuSubnetExplorer() {
  const { data, isFetching, error } = useGpuSubnets();
  const [selected, setSelected] = useState<string | null>(null);

  const families = data?.families ?? [];
  const family: ExplorerFamily | null = useMemo(() => {
    if (families.length === 0) return null;
    return families.find((f) => f.model === selected) ?? families[0];
  }, [families, selected]);

  if (error) {
    return (
      <section className="rounded-xl border border-border/70 bg-card/60 p-5">
        <h3 className="text-display text-base font-bold tracking-tight">GPU → Subnets explorer</h3>
        <p className="mono mt-2 text-[11px] text-destructive">
          explorer unavailable — {error instanceof Error ? error.message : "unknown error"} · the 60s poll keeps
          retrying
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border/70 bg-card/60 p-5">
      {/* --- Header --------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 text-primary">
          <Microchip className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-display text-base font-bold tracking-tight">GPU → Subnets explorer</h3>
          <p className="mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            click a card · list every subnet where it can mine · audited {data?.meta.auditedAt ?? "…"} · block{" "}
            {data?.meta.blockNumber ?? "—"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span
            className="mono inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/40 px-2 py-1 text-[10px] text-muted-foreground"
            title="TAO spot from the latest chain snapshot — every USD figure below moves with it."
          >
            TAO {usd(data?.meta.taoPriceUsd, 2)}
          </span>
          {isFetching && (
            <span className="mono inline-flex items-center gap-1.5 rounded-md border border-success/50 bg-success/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-success">
              <Zap className="h-3 w-3 animate-pulse" aria-hidden="true" />
              live · 60s
            </span>
          )}
        </div>
      </div>

      {/* --- GPU chips -------------------------------------------------------- */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!data &&
          Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              className="mono inline-flex h-8 w-40 animate-pulse items-center rounded-full border border-border/70 bg-muted/40 px-3"
            />
          ))}
        {families.map((f) => {
          const active = family?.model === f.model;
          return (
            <button
              key={f.model}
              type="button"
              onClick={() => setSelected(f.model)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border/70 bg-card/50 text-muted-foreground hover:text-foreground"
              )}
              title={`${f.label} · ${f.reachableCount}/${f.demandCount} usable subnets · pool ${tao(f.poolTaoPerDay)} TAO/d${f.tee === "no" ? " · no TEE" : ""}`}
            >
              <span className={cn("h-2 w-2 shrink-0 rounded-full", CLS_DOT[f.cls])} aria-hidden="true" />
              <span className="font-semibold">{f.label.replace(/ · \d+ GB$/, "")}</span>
              <span className="mono tabular text-[10px] opacity-80">
                {f.reachableCount}/{f.demandCount}
              </span>
            </button>
          );
        })}
      </div>

      {/* --- Selected family --------------------------------------------------- */}
      {family && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="flex items-center gap-2 text-sm font-bold">
              {family.label}
              <span
                className={cn(
                  "mono rounded border px-1 py-px text-[9px] font-bold uppercase",
                  CLS_CHIP[family.cls]
                )}
                title={`${family.cls}-class card`}
              >
                {CLS_LABEL[family.cls]}
              </span>
            </p>
            <TeeBadge family={family} />
            {!family.retail && (
              <span
                className="mono inline-flex items-center rounded-md border border-border/70 bg-background/40 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground"
                title="HGX/rack SKU — sold as multi-GPU nodes, not single cards. Rent cloud capacity instead."
              >
                node-class
              </span>
            )}
            <span className="mono text-[10.5px] text-muted-foreground" title={family.capexNote}>
              {family.capexNote}
            </span>
          </div>

          <FamilySummary family={family} />

          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="table-header hover:bg-transparent">
                  <TableHead className="w-[52px]">SN</TableHead>
                  <TableHead className="w-[200px]">Subnet</TableHead>
                  <TableHead className="min-w-[320px]">Requirement (what the repo asks for)</TableHead>
                  <TableHead className="w-[150px]">
                    <span className="inline-flex items-center gap-1">
                      <ArrowDownUp className="h-3 w-3" aria-hidden="true" />
                      Pool · miners
                    </span>
                  </TableHead>
                  <TableHead className="w-[120px]">Per earning UID</TableHead>
                  <TableHead className="w-[130px]">Platform view</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {family.subnets.map((s) => (
                  <SubnetRow key={`${family.model}-${s.netuid}`} s={s} />
                ))}
                {family.subnets.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <p className="mono flex items-center gap-1.5 py-2 text-[11px] text-muted-foreground">
                        <CircuitBoard className="h-3.5 w-3.5" aria-hidden="true" />
                        no audited subnet names this card — the GPU Research table below is the ground truth
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* --- Footnotes --------------------------------------------------------- */}
          <div className="editorial-rule my-4" />
          <div className="grid gap-3 text-[11.5px] leading-relaxed text-muted-foreground md:grid-cols-2">
            <p>
              <span className="inline-flex items-center gap-1 font-semibold text-foreground/90">
                <Cpu className="h-3 w-3" aria-hidden="true" />
                Usable vs demand.
              </span>{" "}
              A subnet is listed when its audited requirement names the card; rows marked{" "}
              <span className="mono text-warning">TEE-gated</span> demand Confidential Computing this card cannot
              provide and are excluded from the pool and per-earner stats. Miners are paid in subnet α —
              realizability (0.86–0.999) is already netted in the per-earner figures.
            </p>
            <p>
              <span className="font-semibold text-foreground/90">Per earning UID ≠ your income.</span> It is the
              average across UIDs that actually earned in the last epoch — most registered miners earn nothing.
              Validate by renting before wiring capex, and cross-check the platform verdict in the Buy Reality
              Check panel above.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
