"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ArrowDownUp,
  Atom,
  Ban,
  Cpu,
  ExternalLink,
  FileQuestion,
  HardDrive,
  HelpCircle,
  Layers,
  Lock,
  MemoryStick,
  Network,
  ShieldAlert,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CategoryMeta,
  GpuClass,
  LandscapeEntry,
  SpecialGroup,
} from "@/lib/infranex/gpu-landscape";

// ---------------------------------------------------------------------------
// GPU-LANDSCAPE VIEW — the whole network, bucketed by GPU class, with a
// category-wise side menu:
//   A) Consumer RTX    — 3090 / 4090 / 5090 (24–32 GB)
//   B) Pro/Workstation — A6000 / L40S / RTX PRO 6000 (48–96 GB)
//   C) Datacenter      — A100 / H100 / H200 / B200 / B300
//   D) Special cases   — bans, fallbacks, TEE quirks, unverified, no-GPU
// A subnet with a multi-class README menu appears in every class it
// qualifies for; the class chips on each card make that explicit.
// ---------------------------------------------------------------------------

interface LandscapeResponse {
  meta: {
    blockNumber: number | null;
    taoPriceUsd: number;
    snapshotAt: string | null;
    totalSubnets: number;
  };
  categories: CategoryMeta[];
  buckets: Record<CategoryMeta["key"], LandscapeEntry[]>;
}

const CLASS_LETTER: Record<GpuClass, string> = {
  consumer: "A",
  pro: "B",
  datacenter: "C",
};

const SPECIAL_GROUPS: {
  key: SpecialGroup;
  label: string;
  icon: typeof Ban;
  blurb: string;
}[] = [
  {
    key: "banned",
    label: "Explicit model bans",
    icon: Ban,
    blurb: "The README names GPU models that are NOT allowed — read before buying.",
  },
  {
    key: "fallback",
    label: "Datacenter-first with consumer fallback",
    icon: ArrowDownUp,
    blurb: "A datacenter SKU is the primary scored target; consumer cards are a documented fallback.",
  },
  {
    key: "unspecified",
    label: "GPU required, model unspecified",
    icon: HelpCircle,
    blurb: "The repo demands a GPU but never names one or a VRAM budget — verify with the team.",
  },
  {
    key: "unverified",
    label: "Unverified requirements",
    icon: FileQuestion,
    blurb: "No GPU requirement could be scraped from the repo — treat as unknown until audited.",
  },
  {
    key: "quantum",
    label: "Quantum (QPU)",
    icon: Atom,
    blurb: "Quantum hardware, no GPU at any tier.",
  },
  {
    key: "cpu-only",
    label: "CPU-only — no GPU needed",
    icon: Cpu,
    blurb: "The miner workload runs on CPU alone. Listed for completeness of the landscape.",
  },
];

const TIER_STYLE: Record<string, string> = {
  "provider-friendly": "border-success/40 text-success",
  "gpu-flexible": "border-success/40 text-success",
  "container-only": "border-success/40 text-success",
  "tee-required": "border-warning/50 text-warning",
  "bare-metal-only": "border-warning/50 text-warning",
  "cpu-only": "border-border text-muted-foreground",
  unclear: "border-border text-muted-foreground",
  "no-repo": "border-border text-muted-foreground",
  parked: "border-border text-muted-foreground",
  unknown: "border-border text-muted-foreground",
};

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

export function GpuLandscapeView() {
  const [active, setActive] = useState<CategoryMeta["key"]>("consumer");

  const { data, isLoading, isError } = useQuery<LandscapeResponse>({
    queryKey: ["gpu-landscape"],
    queryFn: async () => {
      const res = await fetch("/api/gpu-landscape", { cache: "no-store" });
      if (!res.ok) throw new Error("failed to load GPU landscape");
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const counts = useMemo(() => {
    if (!data) return { consumer: 0, pro: 0, datacenter: 0, special: 0 };
    return {
      consumer: data.buckets.consumer.length,
      pro: data.buckets.pro.length,
      datacenter: data.buckets.datacenter.length,
      special: data.buckets.special.length,
    };
  }, [data]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          <span className="text-eyebrow">GPU Landscape</span>
        </span>
        {data ? (
          <>
            <span className="tabular">
              {data.meta.totalSubnets} subnets classified · block{" "}
              <span className="mono">{data.meta.blockNumber?.toLocaleString() ?? "—"}</span>
            </span>
            <span className="tabular">
              TAO <span className="mono text-success">${data.meta.taoPriceUsd.toFixed(2)}</span>
            </span>
          </>
        ) : (
          <span>loading…</span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* ---- Category-wise side menu ---- */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-eyebrow px-1 pb-2 text-muted-foreground/60">GPU classes</p>
          <div className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {(data?.categories ?? []).map((cat) => {
              const isActive = active === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => setActive(cat.key)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "group flex min-w-[200px] items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all lg:min-w-0",
                    isActive
                      ? "border-primary/50 bg-primary/[0.08] shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.15)]"
                      : "border-border/70 bg-card/50 hover:border-border hover:bg-card"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-bold",
                      isActive
                        ? "border-primary/50 bg-primary/15 text-primary"
                        : "border-border text-muted-foreground group-hover:text-foreground"
                    )}
                  >
                    {cat.letter}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{cat.title}</span>
                    <span className="mono block text-[10px] uppercase tracking-wide text-muted-foreground">
                      {cat.vramBand}
                    </span>
                  </span>
                  <span className="mono tabular text-xs text-muted-foreground">
                    {counts[cat.key]}
                  </span>
                </button>
              );
            })}
            {!data && isLoading && (
              <div className="flex flex-col gap-2 lg:w-full">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-[200px] rounded-xl lg:w-full" />
                ))}
              </div>
            )}
          </div>
          <p className="mt-4 hidden px-1 text-[11px] leading-relaxed text-muted-foreground lg:block">
            Cross-class subnets (e.g. SN53 engy) appear in every class their README
            documents — the chips on each card show all qualifying classes.
          </p>
        </aside>

        {/* ---- Main panel ---- */}
        <div className="min-w-0">
          {!data && isLoading && (
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          )}
          {isError && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Failed to load the GPU landscape. Try refreshing.
            </div>
          )}
          {data && <CategoryPanel category={active} entries={data.buckets[active]} meta={data.categories.find((c) => c.key === active)!} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CategoryPanel({
  category,
  entries,
  meta,
}: {
  category: CategoryMeta["key"];
  entries: LandscapeEntry[];
  meta: CategoryMeta;
}) {
  const withYield = entries.filter((e) => e.live?.perEarningUsdPerDay != null);
  const medianYield =
    withYield.length > 0
      ? [...withYield]
          .map((e) => e.live!.perEarningUsdPerDay!)
          .sort((a, b) => a - b)[Math.floor(withYield.length / 2)]
      : null;

  const groups =
    category === "special"
      ? SPECIAL_GROUPS.map((g) => ({ ...g, items: entries.filter((e) => e.special === g.key) })).filter(
          (g) => g.items.length > 0
        )
      : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Category header */}
      <div className="rounded-xl border border-border/70 bg-card/60 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 text-lg font-bold text-primary">
            {meta.letter}
          </span>
          <div className="min-w-0">
            <h2 className="text-display text-lg font-bold tracking-tight">{meta.title}</h2>
            <p className="mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              {meta.models} · {meta.vramBand}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-4 text-right">
            <div>
              <p className="mono tabular text-lg font-bold leading-none">{entries.length}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">subnets</p>
            </div>
            <div>
              <p className="mono tabular text-lg font-bold leading-none text-success">
                {medianYield != null ? fmtUsd(medianYield) : "—"}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">median yield</p>
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{meta.description}</p>
      </div>

      {/* Entries */}
      {entries.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nothing landed in this bucket.
        </p>
      )}

      {groups
        ? groups.map((g) => {
            const Icon = g.icon;
            const compact = g.key === "cpu-only" || g.key === "unverified";
            return (
              <section key={g.key} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-1">
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <h3 className="text-eyebrow text-foreground/90">
                    {g.label} <span className="mono text-muted-foreground">· {g.items.length}</span>
                  </h3>
                </div>
                <p className="px-1 text-xs text-muted-foreground">{g.blurb}</p>
                {compact ? (
                  <div className="flex flex-wrap gap-1.5">
                    {g.items.map((e) => (
                      <span
                        key={e.netuid}
                        className="mono inline-flex items-center rounded-md border border-border/70 bg-card/50 px-2 py-1 text-[11px] text-muted-foreground"
                      >
                        <span className="text-foreground/80">SN{e.netuid}</span>
                        <span className="mx-1 text-border">|</span>
                        {e.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  g.items.map((e) => <SubnetCard key={e.netuid} entry={e} showNote />)
                )}
              </section>
            );
          })
        : entries.map((e) => <SubnetCard key={e.netuid} entry={e} />)}

      {/* Honest EV footer */}
      <p className="rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground/80">Reading the yield:</span>{" "}
        figures are realizable paper value per <em>earning</em> miner per day at the
        current α price (whole-subnet miner emission × pool realizability ÷ rewarded
        UIDs × TAO spot — the same math the Opportunities ledger uses). Power,
        rental and registration costs are <em>not</em> deducted; most subnets reward
        far fewer UIDs than the 256 registered, so treat the median as the
        best-case band, not a promise.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ClassChips({ entry }: { entry: LandscapeEntry }) {
  if (entry.classes.length <= 1) return null;
  return (
    <span className="inline-flex items-center gap-1" title="Qualifies for multiple GPU classes">
      {entry.classes.map((c) => (
        <span
          key={c}
          className="mono inline-flex h-4.5 w-4.5 items-center justify-center rounded border border-primary/30 bg-primary/10 text-[9px] font-bold text-primary"
        >
          {CLASS_LETTER[c]}
        </span>
      ))}
    </span>
  );
}

function HostingBadges({ entry }: { entry: LandscapeEntry }) {
  const badges: { icon: typeof Lock; label: string; cls: string }[] = [];
  if (entry.hosting.tee)
    badges.push({ icon: ShieldAlert, label: "TEE attestation", cls: "border-warning/50 text-warning" });
  if (entry.hosting.bareMetal)
    badges.push({ icon: HardDrive, label: "Bare metal only", cls: "border-warning/50 text-warning" });
  if (entry.hosting.staticIp)
    badges.push({ icon: Network, label: "Static IP / 1:1 ports", cls: "border-border text-muted-foreground" });
  if (badges.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {badges.map((b) => {
        const Icon = b.icon;
        return (
          <span
            key={b.label}
            title={b.label}
            className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]", b.cls)}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            <span className="hidden xl:inline">{b.label}</span>
          </span>
        );
      })}
    </span>
  );
}

function YieldBlock({ entry }: { entry: LandscapeEntry }) {
  const live = entry.live;
  if (!live || (live.perEarningUsdPerDay == null && !live.minersCount))
    return (
      <span className="mono tabular text-[11px] text-muted-foreground">no live data</span>
    );
  return (
    <div className="flex items-center gap-3 text-right">
      <div>
        <p className="mono tabular text-sm font-bold leading-none text-success">
          {live.estimated ? "≈" : ""}
          {fmtUsd(live.perEarningUsdPerDay)}
          <span className="text-[10px] font-normal text-muted-foreground">/d</span>
        </p>
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground">per earner</p>
      </div>
      <div>
        <p className="mono tabular flex items-center justify-end gap-1 text-sm font-bold leading-none">
          <Users className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          {live.rewardedMiners ?? "—"}
          <span className="text-[10px] font-normal text-muted-foreground">
            /{live.minersCount ?? "—"}
          </span>
        </p>
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground">earning/reg.</p>
      </div>
    </div>
  );
}

function SubnetCard({ entry, showNote = false }: { entry: LandscapeEntry; showNote?: boolean }) {
  return (
    <article className="group rounded-xl border border-border/70 bg-card/60 p-4 transition-colors hover:border-border">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="mono text-xs font-bold text-primary">SN{entry.netuid}</span>
        <h3 className="text-sm font-semibold">{entry.name}</h3>
        <ClassChips entry={entry} />
        <Badge variant="outline" className={cn("text-[10px]", TIER_STYLE[entry.compatTier] ?? TIER_STYLE.unknown)}>
          {entry.compatTier}
        </Badge>
        <HostingBadges entry={entry} />
        {entry.requirementsSource && (
          <a
            href={entry.requirementsSource}
            target="_blank"
            rel="noreferrer"
            title="Requirement source (repo)"
            className="ml-auto text-muted-foreground opacity-60 transition-opacity hover:text-primary hover:opacity-100"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>

      <p className="mono mt-2 rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-[11px] leading-relaxed text-foreground/80">
        <Zap className="mr-1 inline h-3 w-3 text-primary" aria-hidden="true" />
        {entry.gpu}
      </p>

      {showNote && entry.note && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{entry.note}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MemoryStick className="h-3 w-3" aria-hidden="true" />
            VRAM ≥ <span className="mono text-foreground/80">{entry.minVramGb ?? "?"} GB</span>
          </span>
          {entry.gpuCount != null && entry.gpuCount > 1 && (
            <span className="inline-flex items-center gap-1">
              <Cpu className="h-3 w-3" aria-hidden="true" />
              <span className="mono text-foreground/80">{entry.gpuCount}× GPUs</span>
            </span>
          )}
        </div>
        <YieldBlock entry={entry} />
      </div>
    </article>
  );
}
