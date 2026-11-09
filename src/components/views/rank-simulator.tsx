"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownUp,
  Crosshair,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
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
import { useRankSimulator } from "@/hooks/use-rank-simulator";
import type { RankSimRow } from "@/lib/infranex/rank-simulator";

// ---------------------------------------------------------------------------
// RANK SIMULATOR — "where should THIS rig mine?" The honest answer to the
// new-entrant question: EV = realized pool ÷ ALL seats is what an average
// entrant can expect; the flashy per-earner numbers elsewhere belong to the
// winning cohort. Every column is chain-measured, nothing invented.
// ---------------------------------------------------------------------------

const TIER_CHIP: Record<string, { label: string; cls: string; tip: string }> = {
  OPEN_FIELD: {
    label: "Open field",
    cls: "border-success/50 bg-success/10 text-success",
    tip: "New seats actually earn here (≥50% of seats rewarded, top-10% <50% share).",
  },
  FIGHTABLE: {
    label: "Fightable",
    cls: "border-primary/50 bg-primary/10 text-primary",
    tip: "Real odds but not easy — month-1 odds <50%, or the subnet is full, or whales take ≥50%.",
  },
  KNIFE_FIGHT: {
    label: "Knife fight",
    cls: "border-warning/50 bg-warning/10 text-warning",
    tip: "Pro farms take most of the pot (<20% of seats earn or top-10% ≥85%) — expect scraps.",
  },
  DONT_ENTER: {
    label: "Winner-take-all",
    cls: "border-destructive/50 bg-destructive/10 text-destructive",
    tip: "Winner-take-all spread (<5% of seats earn or top-10% ≥95%) — a new seat earns ≈ $0.",
  },
};

function usd(n: number | null | undefined, digits = 0): string {
  if (n == null) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function SeatTierChip({ tier }: { tier: string | null }) {
  if (!tier || !TIER_CHIP[tier]) return <span className="mono text-[10px] text-muted-foreground">no data</span>;
  const t = TIER_CHIP[tier];
  return (
    <span
      className={cn(
        "mono inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em]",
        t.cls
      )}
      title={t.tip}
    >
      {t.label}
    </span>
  );
}

function VerdictChip({ s }: { s: RankSimRow }) {
  if (!s.classification) return <span className="mono text-[10px] text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "mono inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em]",
        s.classification === "AVOID"
          ? "border-destructive/50 bg-destructive/10 text-destructive"
          : s.classification === "SCALE" || s.classification === "TEST"
            ? "border-success/50 bg-success/10 text-success"
            : "border-border/70 bg-background/40 text-muted-foreground"
      )}
      title={`Platform verdict ${s.classification}/${s.difficulty ?? "—"}${s.netMonthlyUsd != null ? ` · net ${usd(s.netMonthlyUsd)}/mo` : ""} — measures the whole deployment case, not just the odds`}
    >
      {s.classification}
    </span>
  );
}

function RankRow({ s, rank }: { s: RankSimRow; rank: number }) {
  return (
    <TableRow className="align-top">
      <TableCell className="mono tabular text-muted-foreground">{rank}</TableCell>
      <TableCell>
        <p className="text-[12.5px] font-semibold leading-snug">
          SN{s.netuid} · {s.name}
          {s.teeRequired && (
            <span
              className="mono ml-1.5 inline-flex items-center rounded border border-warning/50 bg-warning/10 px-1 py-px text-[9px] font-bold uppercase text-warning"
              title="Demands TEE attestation."
            >
              TEE
            </span>
          )}
        </p>
        <p className="mono mt-0.5 max-w-[220px] truncate text-[10px] text-muted-foreground" title={s.headline}>
          {s.headline}
        </p>
      </TableCell>
      <TableCell>
        <SeatTierChip tier={s.seatTier} />
        <p className="mono mt-1 text-[10px] tabular text-muted-foreground">
          {s.rewardedMiners?.toLocaleString() ?? "—"} earn
          {" · "}
          {pct(s.rewardedRatio)} seats
          {s.top10IncentiveShare != null ? ` · top-10% take ${pct(s.top10IncentiveShare)}` : ""}
        </p>
      </TableCell>
      <TableCell>
        <p
          className="mono text-[13px] font-bold tabular text-primary"
          title="EV = realized pool ÷ ALL registered seats — your expected $/d if you are exactly average among entrants. This is base rate × winner income, never the whale average."
        >
          {usd(s.evUsdPerDay)}
          <span className="text-[10px] font-medium text-muted-foreground">/d</span>
        </p>
        <p className="mono mt-0.5 text-[10px] tabular text-muted-foreground">
          pool {s.poolTaoPerDay != null ? `${s.poolTaoPerDay.toFixed(1)} τ/d` : "—"}
        </p>
      </TableCell>
      <TableCell>
        <p
          className="mono text-[11.5px] tabular"
          title="Median entrant outcome: what the middle seat gets — zero unless ≥50% of seats earn."
        >
          {usd(s.medianUsdPerDay)}
          <span className="text-[10px] text-muted-foreground">/d</span>
        </p>
      </TableCell>
      <TableCell>
        <p
          className="mono text-[11.5px] tabular"
          title="Mean income across the rewarded cohort — what you get IF you crack the paid cohort."
        >
          {usd(s.winnerUsdPerDay)}
          <span className="text-[10px] text-muted-foreground">/d</span>
        </p>
      </TableCell>
      <TableCell>
        <p
          className="mono text-[11.5px] tabular text-warning"
          title="Mean income across the top-10% cohort — the 'top 10%' goal line, chain-measured."
        >
          {usd(s.topDecileUsdPerDay)}
          <span className="text-[10px] text-muted-foreground">/d</span>
        </p>
      </TableCell>
      <TableCell>
        <p className="mono text-[11px] tabular text-muted-foreground" title="Registration burn per attempt (τ)">
          {s.burnTao != null ? `${s.burnTao.toFixed(2)} τ` : "—"}
        </p>
      </TableCell>
      <TableCell>
        <VerdictChip s={s} />
        {s.netMonthlyUsd != null && (
          <p className="mono mt-1 text-[10px] tabular text-muted-foreground">{usd(s.netMonthlyUsd)}/mo net</p>
        )}
      </TableCell>
    </TableRow>
  );
}

export function RankSimulator() {
  // Card selector state lives here and IS the query input — changing it
  // refetches /api/gpu-rank-simulator?gpu=… (null = configured rig default).
  const [gpu, setGpu] = useState<string | null>(null);
  const { data, isFetching, error } = useRankSimulator(gpu);

  // Keep the selector in sync with the rig default once loaded.
  useEffect(() => {
    if (!gpu && data?.rig?.model) setGpu(data.rig.model);
  }, [data, gpu]);

  if (error) {
    return (
      <section className="rounded-xl border border-border/70 bg-card/60 p-5">
        <h3 className="text-display text-base font-bold tracking-tight">Rank simulator</h3>
        <p className="mono mt-2 text-[11px] text-destructive">
          simulator unavailable — {error instanceof Error ? error.message : "unknown error"} · the 60s poll keeps
          retrying
        </p>
      </section>
    );
  }

  const cards = data?.cards ?? [];

  return (
    <section className="rounded-xl border border-border/70 bg-card/60 p-5">
      {/* --- Header --------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-warning/40 bg-warning/10 text-warning">
          <Crosshair className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-display text-base font-bold tracking-tight">Rank simulator — where should this rig mine?</h3>
          <p className="mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            honest new-entrant math · EV = realized pool ÷ all seats · audited {data?.meta.auditedAt ?? "…"} · TAO{" "}
            {usd(data?.meta.taoPriceUsd, 2)}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            className="mono h-8 rounded-md border border-border/70 bg-background/60 px-2 text-[11px] text-foreground"
            value={gpu ?? ""}
            onChange={(e) => setGpu(e.target.value || null)}
            title="Card to simulate — defaults to your configured rig"
          >
            {cards.map((c) => (
              <option key={c.model} value={c.model}>
                {c.label}
              </option>
            ))}
          </select>
          {isFetching && (
            <span className="mono inline-flex items-center gap-1.5 rounded-md border border-success/50 bg-success/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-success">
              <Zap className="h-3 w-3 animate-pulse" aria-hidden="true" />
              live · 60s
            </span>
          )}
        </div>
      </div>

      {/* --- Rig line --------------------------------------------------------- */}
      {data && (
        <p className="mono mt-3 text-[11px] text-muted-foreground" title={data.rig.teeNote}>
          simulating <span className="font-bold text-foreground">{data.rig.label}</span>
          {" · "}
          {data.rig.teeCapable ? (
            <span className="inline-flex items-center gap-1 text-success">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" /> TEE capable
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-warning">
              <ShieldAlert className="h-3 w-3" aria-hidden="true" /> no TEE — attestation subnets excluded
            </span>
          )}
          {" · "}
          {data.ranked.length} runnable subnets
          {data.clusterOnly.length > 0 ? ` · ${data.clusterOnly.length} cluster-only excluded` : ""}
        </p>
      )}

      {/* --- Ranked table ------------------------------------------------------- */}
      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="table-header hover:bg-transparent">
              <TableHead className="w-[44px]">#</TableHead>
              <TableHead className="w-[210px]">Subnet</TableHead>
              <TableHead className="min-w-[230px]">
                <span className="inline-flex items-center gap-1">
                  Seat odds
                  <ArrowDownUp className="h-3 w-3" aria-hidden="true" />
                </span>
              </TableHead>
              <TableHead className="w-[120px]">
                <span title="EV = realized pool ÷ ALL registered seats — your expected $/d as an average entrant. Base rate × winner income.">
                  EV (avg entrant)
                </span>
              </TableHead>
              <TableHead className="w-[92px]" title="Median entrant outcome — zero unless ≥50% of seats earn.">
                Median
              </TableHead>
              <TableHead className="w-[96px]" title="Mean income of the rewarded cohort — what you get IF you crack it.">
                Winners
              </TableHead>
              <TableHead className="w-[96px]" title="Mean income of the top-10% cohort — the goal line for out-scoring 90% of seats.">
                Top-10%
              </TableHead>
              <TableHead className="w-[80px]" title="Registration burn per attempt.">
                Burn
              </TableHead>
              <TableHead className="w-[120px]">Verdict</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.ranked.map((s, i) => (
              <RankRow key={`${s.netuid}`} s={s} rank={i + 1} />
            ))}
            {data && data.ranked.length === 0 && (
              <TableRow>
                <TableCell colSpan={9}>
                  <p className="mono py-2 text-[11px] text-muted-foreground">
                    no runnable subnets for this card — try another card in the selector
                  </p>
                </TableCell>
              </TableRow>
            )}
            {!data &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={9}>
                    <span className="mono block h-6 animate-pulse rounded bg-muted/40" />
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* --- Footnotes --------------------------------------------------------- */}
      <div className="editorial-rule my-4" />
      <div className="grid gap-3 text-[11.5px] leading-relaxed text-muted-foreground md:grid-cols-2">
        <p>
          <span className="font-semibold text-foreground/90">Read the four columns as one sentence.</span> EV is what
          an <em>average</em> entrant earns per day (realized miner pool ÷ all registered seats — base rate × winner
          income). Median is the middle entrant&apos;s outcome — $0 unless most seats earn. Winners is what the paid
          cohort gets <em>if</em> you crack it. Top-10% is the chain-measured goal line: out-score 90% of seats and
          that cohort&apos;s average is yours. A subnet can flash huge Winners numbers and still rank low on EV —
          that is exactly the winner-take-all trap.
        </p>
        <p>
          <span className="font-semibold text-foreground/90">Excluded rows are listed, never hidden.</span>
          {" "}Cluster-only subnets name this card but demand a multi-GPU node or more VRAM than one card provides.
          TEE-gated subnets require attestation this card cannot offer. EV assumes average skill — beat the
          incumbents&apos; score and the Winners / Top-10% columns become your ceiling. Verify before capex: rent
          the card, run the miner, watch your UID&apos;s incentive weight for a few epochs.
          {data && data.teeBlocked.length > 0
            ? ` Currently TEE-blocked: ${data.teeBlocked.map((t) => `SN${t.netuid} ${t.name}`).join(", ")}.`
            : ""}
        </p>
      </div>

      {/* --- Cluster-only list -------------------------------------------------- */}
      {data && data.clusterOnly.length > 0 && (
        <div className="mt-3 rounded-lg border border-border/70 bg-background/40 p-3">
          <p className="mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Cluster-only (named this card, need a multi-GPU node or more VRAM)
          </p>
          <p className="mono mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {data.clusterOnly.map((s) => (
              <span key={s.netuid} className="inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3 opacity-50" aria-hidden="true" />
                SN{s.netuid} {s.name} · {s.gpuCount ?? "?"}× GPU{s.vramFloor != null ? ` ≥${s.vramFloor} GB` : ""}
              </span>
            ))}
          </p>
        </div>
      )}
    </section>
  );
}
