"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Atom,
  Cpu,
  ExternalLink,
  FileSearch,
  FileQuestion,
  Github,
  HelpCircle,
  PackageOpen,
  Search,
  SquareDashedBottomCode,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GPU_RESEARCH_META,
  GPU_RESEARCH_ROWS,
  type GpuResearchRow,
} from "@/lib/infranex/gpu-research-seed";

// ---------------------------------------------------------------------------
// SUBNET GPU REQUIREMENTS RESEARCH — repo-level audit of all 129 Bittensor
// subnets. For every subnet the default-branch repo tarball was pulled and
// READMEs, min_compute.yml declarations and Docker files were scanned to
// identify which GPU models miners are actually asked to run — H200,
// RTX 4090, or something else. The scan is merged with the platform's
// hand-verified curated specs (deep repo docs / official pages) and the
// persisted README-scrape layer, then classified:
//   datacenter / pro / consumer / cpu-only / quantum / unverified.
// Evidence-first: every row carries the artifact classes that supplied the
// verdict and a verbatim quote where one exists.
// ---------------------------------------------------------------------------

type ClsFilter =
  | "all"
  | "datacenter"
  | "pro"
  | "consumer"
  | "cpu-only"
  | "quantum"
  | "unverified";

const CLS_META: Record<
  Exclude<ClsFilter, "all">,
  { label: string; chip: string; blurb: string }
> = {
  datacenter: {
    label: "Datacenter SKU",
    chip: "border-primary/50 bg-primary/10 text-primary",
    blurb: "A100 · H100 · H200 · B200 · B300 · GB200 class — node-scale hardware.",
  },
  pro: {
    label: "Pro / Workstation",
    chip: "border-warning/50 bg-warning/10 text-warning",
    blurb: "L4 · L40S · RTX PRO 6000 · A6000 — 48–96 GB workstation cards.",
  },
  consumer: {
    label: "Consumer RTX",
    chip: "border-success/50 bg-success/10 text-success",
    blurb: "RTX 3090 · 4090 · 5090 class (or a ≤32 GB per-GPU floor).",
  },
  "cpu-only": {
    label: "No GPU needed",
    chip: "border-border bg-card/60 text-muted-foreground",
    blurb: "The miner path runs on CPU alone — no GPU anywhere in the repo artifacts.",
  },
  quantum: {
    label: "Quantum (QPU)",
    chip: "border-border bg-card/60 text-muted-foreground",
    blurb: "Quantum hardware — no GPU at any tier.",
  },
  unverified: {
    label: "Unverified",
    chip: "border-border bg-card/60 text-muted-foreground",
    blurb: "No repo, offline repo, or a requirement that names no model — verify with the team.",
  },
};

const STATUS_META: Record<
  GpuResearchRow["status"],
  { label: string; chip: string; icon: typeof FileSearch }
> = {
  "repo-scan": {
    label: "repo-scan",
    chip: "border-success/40 text-success",
    icon: FileSearch,
  },
  "curated-docs": {
    label: "docs-verified",
    chip: "border-primary/40 text-primary",
    icon: HelpCircle,
  },
  "no-repo": {
    label: "no public repo",
    chip: "border-border text-muted-foreground",
    icon: FileQuestion,
  },
  "repo-offline": {
    label: "repo offline",
    chip: "border-destructive/40 text-destructive",
    icon: XCircle,
  },
  root: {
    label: "root network",
    chip: "border-border text-muted-foreground",
    icon: Cpu,
  },
};

/** Artifact badges shown next to a model chip: which file class supplied it. */
function ArtifactBadges({ row, model }: { row: GpuResearchRow; model: string }) {
  const badges: { letter: string; title: string }[] = [];
  if (row.artifacts.readme?.models?.[model]) badges.push({ letter: "R", title: "found in README" });
  if (row.artifacts.min_compute?.models?.[model])
    badges.push({ letter: "M", title: "declared in min_compute.yml" });
  if (row.artifacts.docker?.models?.[model]) badges.push({ letter: "D", title: "found in Docker files" });
  if (row.curated && badges.length === 0)
    badges.push({ letter: "C", title: "verified in deep docs (curated layer)" });
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 align-middle">
      {badges.map((b) => (
        <span
          key={b.letter}
          title={b.title}
          className="mono inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-border/70 bg-muted/50 text-[8px] font-bold text-muted-foreground"
        >
          {b.letter}
        </span>
      ))}
    </span>
  );
}

export function GpuResearchView() {
  const [filter, setFilter] = useState<ClsFilter>("all");
  const [query, setQuery] = useState("");

  // Model demand — how many subnets name each model across all artifacts.
  const modelCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of GPU_RESEARCH_ROWS) {
      for (const m of row.models) counts.set(m, (counts.get(m) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, []);

  const clsCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const row of GPU_RESEARCH_ROWS) c[row.cls] = (c[row.cls] ?? 0) + 1;
    return c;
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GPU_RESEARCH_ROWS.filter((r) => {
      if (filter !== "all" && r.cls !== filter) return false;
      if (!q) return true;
      const hay = `${r.netuid} ${r.name} ${r.models.join(" ")} ${r.headline} ${r.repo ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filter, query]);

  const maxModelCount = modelCounts[0]?.[1] ?? 1;
  const filterChips: { key: ClsFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: GPU_RESEARCH_ROWS.length },
    ...(
      ["datacenter", "pro", "consumer", "cpu-only", "quantum", "unverified"] as const
    ).map((k) => ({ key: k, label: CLS_META[k].label, count: clsCounts[k] ?? 0 })),
  ];

  return (
    <div className="space-y-6">
      {/* --- Audit header --------------------------------------------------- */}
      <section className="rounded-xl border border-border/70 bg-card/60 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 text-primary">
            <FileSearch className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-display text-lg font-bold tracking-tight">
              Subnet GPU Requirements Research
            </h2>
            <p className="mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              repo-level audit · audited {GPU_RESEARCH_META.auditedAt} · default-branch tarball sweep
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          A repo-level audit of all {GPU_RESEARCH_META.totalSubnets} Bittensor subnets: READMEs,{" "}
          <span className="mono text-foreground/90">min_compute.yml</span> declarations and Docker
          files were scanned to identify which GPU models miners are actually asked to run —
          H200, RTX 4090, or something else. Where the three artifact classes stay silent, the
          platform&apos;s hand-verified curated specs (deep repo docs / official pages) fill the
          gap and the row is marked <span className="text-primary">docs-verified</span>; where no
          repo exists at all, the row says so instead of guessing.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Subnets audited" value={GPU_RESEARCH_META.totalSubnets} sub="netuid 0–128" />
          <StatCard
            label="Repos scanned"
            value={GPU_RESEARCH_META.reposScanned}
            sub={`${GPU_RESEARCH_META.noRepo + GPU_RESEARCH_META.repoOffline} without a live repo`}
          />
          <StatCard
            label="Datacenter ask"
            value={clsCounts.datacenter ?? 0}
            sub="H100/H200/B200-class"
            accent="text-primary"
          />
          <StatCard
            label="Consumer RTX"
            value={clsCounts.consumer ?? 0}
            sub="3090/4090/5090-class"
            accent="text-success"
          />
          <StatCard
            label="No GPU needed"
            value={(clsCounts["cpu-only"] ?? 0) + (clsCounts.quantum ?? 0)}
            sub="CPU-only + QPU paths"
          />
          <StatCard
            label="Unverified"
            value={clsCounts.unverified ?? 0}
            sub="no model named in source"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <CoverageChip
            icon={<SquareDashedBottomCode className="h-3.5 w-3.5" />}
            label="README hits"
            value={GPU_RESEARCH_META.readmeHits}
            title="subnets whose READMEs name at least one GPU model"
          />
          <CoverageChip
            icon={<PackageOpen className="h-3.5 w-3.5" />}
            label="min_compute.yml declarations"
            value={GPU_RESEARCH_META.minComputeHits}
            title="subnets declaring GPU models in a min_compute.yml"
          />
          <CoverageChip
            icon={<Github className="h-3.5 w-3.5" />}
            label="Docker-file hits"
            value={GPU_RESEARCH_META.dockerHits}
            title="subnets whose Dockerfiles / compose files name GPU models"
          />
          <span className="mono text-[11px] text-muted-foreground">
            badge key: R README · M min_compute.yml · D Docker · C curated deep-docs
          </span>
        </div>
      </section>

      {/* --- Model demand bars ---------------------------------------------- */}
      <section className="rounded-xl border border-border/70 bg-card/60 p-5">
        <h3 className="text-display text-base font-bold tracking-tight">Model demand across the network</h3>
        <p className="mono mt-0.5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          subnets naming each model in any scanned artifact
        </p>
        <div className="mt-4 space-y-2">
          {modelCounts.map(([model, count]) => {
            const cls = modelClassOf(model);
            return (
              <div key={model} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuery(model)}
                  className="mono w-36 shrink-0 truncate text-left text-xs font-semibold text-foreground/90 hover:text-primary"
                  title={`filter table by ${model}`}
                >
                  {model}
                </button>
                <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={cn("h-full rounded-full", CLS_BAR[cls])}
                    style={{ width: `${Math.max(4, Math.round((count / maxModelCount) * 100))}%` }}
                  />
                </div>
                <span className="mono w-8 shrink-0 text-right text-xs tabular text-muted-foreground">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* --- Filter + table -------------------------------------------------- */}
      <section className="rounded-xl border border-border/70 bg-card/60 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {filterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter(chip.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                filter === chip.key
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border/70 bg-card/50 text-muted-foreground hover:text-foreground"
              )}
            >
              {chip.label}
              <span className="mono ml-1.5 tabular text-[10px] opacity-70">{chip.count}</span>
            </button>
          ))}
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, model, repo…"
              className="h-9 pl-8"
              aria-label="Search the audit table"
            />
          </div>
        </div>
        {filter !== "all" && (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{CLS_META[filter].blurb}</p>
        )}

        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="table-header hover:bg-transparent">
                <TableHead className="w-[64px]">SN</TableHead>
                <TableHead className="w-[190px]">Subnet</TableHead>
                <TableHead className="w-[300px]">Requirement (what the repo asks for)</TableHead>
                <TableHead className="w-[220px]">Models detected</TableHead>
                <TableHead>Evidence quote</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const st = STATUS_META[row.status];
                const StIcon = st.icon;
                return (
                  <TableRow key={row.netuid}>
                    <TableCell className="mono tabular text-muted-foreground">{row.netuid}</TableCell>
                    <TableCell>
                      <p className="truncate text-sm font-semibold" title={row.name}>
                        {row.name}
                      </p>
                      {row.repo ? (
                        <a
                          href={`https://github.com/${row.repo}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mono mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
                          title={row.repo}
                        >
                          <Github className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{row.repo}</span>
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="mono mt-0.5 block text-[10px] text-muted-foreground/60">
                          no repo
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal text-[12px] leading-relaxed text-foreground/90">
                      {row.headline}
                      {row.gpuCount != null && (
                        <span className="mono ml-1.5 text-[10px] text-muted-foreground">
                          · count {row.gpuCount}×
                        </span>
                      )}
                      {row.vramFloor != null && row.vramFloor > 0 && (
                        <span className="mono ml-1 text-[10px] text-muted-foreground">
                          · floor {row.vramFloor} GB
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.models.length ? (
                        <span className="flex flex-wrap gap-1">
                          {row.models.map((m) => (
                            <span
                              key={m}
                              className={cn(
                                "mono inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                                CLS_META[modelClassOf(m)].chip
                              )}
                            >
                              {m}
                              <ArtifactBadges row={row} model={m} />
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {row.evidence ? (
                        <span
                          className="mono block text-[10.5px] leading-relaxed text-muted-foreground"
                          title={row.evidence}
                        >
                          {row.evidence.length > 180 ? `${row.evidence.slice(0, 180)}…` : row.evidence}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("gap-1 text-[10px]", st.chip)}>
                        <StIcon className="h-3 w-3" aria-hidden="true" />
                        {st.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No subnets match this filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <p className="mono mt-3 text-[11px] text-muted-foreground">
          showing {rows.length} of {GPU_RESEARCH_ROWS.length} subnets
        </p>
      </section>

      {/* --- Methodology ----------------------------------------------------- */}
      <section className="rounded-xl border border-border/70 bg-card/60 p-5">
        <h3 className="text-display text-base font-bold tracking-tight">How this audit works</h3>
        <div className="mt-3 grid gap-4 text-sm leading-relaxed text-muted-foreground md:grid-cols-2">
          <div className="space-y-2">
            <p>
              <span className="font-semibold text-foreground/90">1 · Repo sweep.</span> For each of
              the 129 netuids the default-branch repo tarball was downloaded (codeload.github.com,
              HEAD) and every README, <span className="mono">min_compute.yml</span>, Dockerfile and
              docker-compose file in the tree was scanned for 28 canonical GPU model tokens — from
              B300 down to T4 — plus VRAM floors, GPU counts and no-GPU markers.
            </p>
            <p>
              <span className="font-semibold text-foreground/90">2 · Layer merge.</span> The scan
              layer is merged with the platform&apos;s hand-verified curated specs (requirements
              documented in deep docs or official pages, each carrying a verbatim quote) and the
              persisted README-scrape layer, so a README revision cannot erase a verified finding.
            </p>
          </div>
          <div className="space-y-2">
            <p>
              <span className="font-semibold text-foreground/90">3 · Honest gaps.</span> {GPU_RESEARCH_META.noRepo}{" "}
              subnets have no identifiable public repo and {GPU_RESEARCH_META.repoOffline} more have a
              deleted/offline repo — those rows are marked as such rather than estimated. SN0 is the
              root network (pure staking, no mining hardware) and is listed for completeness.
            </p>
            <p>
              <span className="font-semibold text-foreground/90">4 · Read the evidence.</span> The
              badge on every model chip tells you which artifact supplied it (R/M/D/C). A model that
              appears only in a Dockerfile may be a CI artifact, not a miner requirement — when the
              repo names a model but the requirement line matters, check the quote before renting.
            </p>
          </div>
        </div>
        <div className="editorial-rule my-4" />
        <div className="flex flex-wrap gap-2">
          {(["datacenter", "pro", "consumer", "cpu-only", "quantum", "unverified"] as const).map((k) => (
            <span
              key={k}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]",
                CLS_META[k].chip
              )}
            >
              {k === "quantum" ? (
                <Atom className="h-3 w-3" aria-hidden="true" />
              ) : k === "cpu-only" ? (
                <Cpu className="h-3 w-3" aria-hidden="true" />
              ) : k === "unverified" ? (
                <FileQuestion className="h-3 w-3" aria-hidden="true" />
              ) : null}
              <span className="font-semibold">{CLS_META[k].label}</span>
              <span className="opacity-70">· {CLS_META[k].blurb.split(" — ")[0]}</span>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <p className="mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={cn("mono mt-1 text-2xl font-bold tabular", accent ?? "text-foreground")}>{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function CoverageChip({
  icon,
  label,
  value,
  title,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  title: string;
}) {
  return (
    <span
      title={title}
      className="mono inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/40 px-2.5 py-1.5 text-[11px] text-muted-foreground"
    >
      <span className="text-primary">{icon}</span>
      <span className="tabular font-bold text-foreground/90">{value}</span>
      {label}
    </span>
  );
}

const CLS_BAR: Record<string, string> = {
  datacenter: "bg-primary/70",
  pro: "bg-warning/70",
  consumer: "bg-success/70",
};

function modelClassOf(model: string): "datacenter" | "pro" | "consumer" {
  const DATACENTER = ["H200", "H100", "GH200", "B200", "B300", "GB200", "A100", "A800", "H800", "H20", "MI325X", "MI300X"];
  const PRO = ["RTX PRO 6000", "RTX 6000 Ada", "L40S", "L40", "L4", "A6000", "A5000"];
  if (DATACENTER.includes(model)) return "datacenter";
  if (PRO.includes(model)) return "pro";
  return "consumer";
}
