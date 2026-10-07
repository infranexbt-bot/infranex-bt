"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  ArrowDownUp,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Cpu,
  ExternalLink,
  Github,
  HelpCircle,
  Layers3,
  ListChecks,
  Search,
  Server,
  ShieldCheck,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// MINER-PLAYBOOK VIEW — Section 06. For every subnet: what it does, the
// hardware to run, the key requirements, the miner's actual job, the mindset
// to break the top-10, and how to follow the incumbent leaders. Content is
// researched from each subnet's repo/docs (confidence-flagged per subnet),
// joined with live per-earner yields from the latest chain snapshot.
// ---------------------------------------------------------------------------

interface Live {
  minersCount: number | null;
  rewardedMiners: number | null;
  minerEmissionTaoPerDay: number | null;
  perEarningUsdPerDay: number | null;
  estimated: boolean;
}

interface PlaybookEntry {
  netuid: number;
  name: string;
  category: string | null;
  gpu: string | null;
  minVramGb: number | null;
  gpuCount: number | null;
  hosting: { bareMetal: boolean; tee: boolean; staticIp: boolean } | null;
  githubUrl: string | null;
  website: string | null;
  live: Live | null;
  whatItDoes: string | null;
  hardwareRec: string | null;
  keyRequirements: string[];
  minerJob: string | null;
  minerJobProvide: string[];
  top10Strategy: string | null;
  top10Levers: string[];
  followTopMiners: string | null;
  confidence: string | null;
  sources: Array<{ label: string; url: string }>;
  researchedAt: string | null;
}

interface PlaybookResponse {
  meta: {
    blockNumber: number | null;
    taoPriceUsd: number;
    snapshotAt: string | null;
    totalSubnets: number;
  };
  entries: PlaybookEntry[];
}

const CONF_STYLE: Record<string, { label: string; cls: string }> = {
  "repo-verified": { label: "repo-verified", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  derived: { label: "derived", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  thin: { label: "thin", cls: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
};

const UNIVERSAL_LEVERS = [
  "Read the reward model first — incentives.md / roots.md. You cannot win a game you haven't read the rules of.",
  "Match the exact stack: pinned versions, ports, model IDs. Most new miners fail on environment drift, not skill.",
  "Uptime is table stakes — 99.9%+. Rewards are lost in restarts, not in benchmarks.",
  "Expect the ramp: bonds/weights take 1–3 weeks to saturate. Judge nothing before day 14.",
  "Watch the leaderboard (taostats.io/subnet/<netuid>) — know what the top UIDs run and how often their weights move.",
  "Be reachable: subnet discord/telegram is where validators announce spec changes. Silent miners bleed rank.",
];

type SortKey = "yield" | "netuid" | "name";
type ConfFilter = "all" | "repo-verified" | "derived" | "thin";

export function MinerPlaybookView() {
  const { data, isLoading, isError } = useQuery<PlaybookResponse>({
    queryKey: ["miner-playbook"],
    queryFn: async () => {
      const res = await fetch("/api/playbook", { cache: "no-store" });
      if (!res.ok) throw new Error(`playbook ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });

  const [search, setSearch] = useState("");
  const [confFilter, setConfFilter] = useState<ConfFilter>("all");
  const [sort, setSort] = useState<SortKey>("yield");
  const [selected, setSelected] = useState<number | null>(null);

  const entries = data?.entries ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = entries.filter((e) => {
      if (confFilter !== "all" && (e.confidence ?? "thin") !== confFilter) return false;
      if (!q) return true;
      return (
        String(e.netuid).includes(q) ||
        e.name.toLowerCase().includes(q) ||
        (e.gpu ?? "").toLowerCase().includes(q) ||
        (e.category ?? "").toLowerCase().includes(q)
      );
    });
    list = [...list].sort((a, b) => {
      if (sort === "yield")
        return (b.live?.perEarningUsdPerDay ?? -1) - (a.live?.perEarningUsdPerDay ?? -1);
      if (sort === "name") return a.name.localeCompare(b.name);
      return a.netuid - b.netuid;
    });
    return list;
  }, [entries, search, confFilter, sort]);

  const active = useMemo(
    () => entries.find((e) => e.netuid === selected) ?? filtered[0] ?? null,
    [entries, filtered, selected]
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-[70vh] w-full" />
          <Skeleton className="h-[70vh] w-full" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">
        Failed to load the playbook. Refresh to retry.
      </div>
    );
  }

  const counts = {
    verified: entries.filter((e) => e.confidence === "repo-verified").length,
    derived: entries.filter((e) => e.confidence === "derived").length,
    thin: entries.filter((e) => e.confidence === "thin" || !e.confidence).length,
  };

  return (
    <div className="space-y-4">
      {/* Header + universal method */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
            <BookOpen className="h-3 w-3" /> Miner Playbook
          </Badge>
          <span>
            {data.meta.totalSubnets} subnets · block {data.meta.blockNumber ?? "—"} · TAO ${data.meta.taoPriceUsd?.toFixed(2) ?? "—"}
          </span>
          <span className="ml-auto flex gap-1.5">
            <Badge variant="outline" className={cn("border", CONF_STYLE["repo-verified"].cls)}>
              {counts.verified} repo-verified
            </Badge>
            <Badge variant="outline" className={cn("border", CONF_STYLE.derived.cls)}>
              {counts.derived} derived
            </Badge>
            <Badge variant="outline" className={cn("border", CONF_STYLE.thin.cls)}>
              {counts.thin} thin
            </Badge>
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Each entry is researched from the subnet&apos;s repo, docs and website (confidence-flagged per
          subnet — nothing here is invented). Yields are <span className="text-foreground">realizable paper values per earning miner</span> at
          spot: concentration means the median earning slot is the ceiling, not a promise.
        </p>
        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <Trophy className="h-3.5 w-3.5" /> Universal top-10 levers (apply to every subnet)
          </div>
          <ol className="mt-2 grid gap-1.5 text-[11px] leading-relaxed text-muted-foreground sm:grid-cols-2">
            {UNIVERSAL_LEVERS.map((l, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="font-mono text-primary">{i + 1}.</span>
                <span>{l}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subnet, netuid, GPU…"
            className="pl-8 h-9"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "repo-verified", "derived", "thin"] as ConfFilter[]).map((c) => (
            <button
              key={c}
              onClick={() => setConfFilter(c)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                confFilter === c
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {c === "all" ? "All" : CONF_STYLE[c].label}
            </button>
          ))}
        </div>
        <button
          onClick={() =>
            setSort((s) => (s === "yield" ? "netuid" : s === "netuid" ? "name" : "yield"))
          }
          className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
          sort: {sort}
        </button>
      </div>

      {/* List + detail */}
      <div className="grid gap-3 lg:grid-cols-[340px_1fr]">
        <ScrollArea className="h-[72vh] rounded-xl border bg-card">
          <div className="p-1.5">
            {filtered.map((e) => {
              const conf = CONF_STYLE[e.confidence ?? "thin"] ?? CONF_STYLE.thin;
              const pe = e.live?.perEarningUsdPerDay;
              const isSel = active?.netuid === e.netuid;
              return (
                <button
                  key={e.netuid}
                  onClick={() => setSelected(e.netuid)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                    isSel ? "bg-primary/10" : "hover:bg-muted/50"
                  )}
                >
                  <span className="w-9 shrink-0 font-mono text-[11px] text-muted-foreground">
                    {String(e.netuid).padStart(3, " ")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {e.gpu ? e.gpu.slice(0, 44) : "CPU / no GPU floor"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {pe != null && (
                      <span className="block font-mono text-[11px] text-emerald-400">
                        ${pe >= 100 ? Math.round(pe).toLocaleString() : pe.toFixed(1)}/d
                      </span>
                    )}
                    <span className={cn("mt-0.5 inline-block h-1.5 w-1.5 rounded-full", conf.cls.split(" ")[0])} />
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">No matches.</div>
            )}
          </div>
        </ScrollArea>

        <ScrollArea className="h-[72vh] rounded-xl border bg-card">
          {active ? (
            <div className="space-y-4 p-4">
              {/* Identity row */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">SN{active.netuid}</span>
                <h2 className="text-lg font-semibold tracking-tight">{active.name}</h2>
                {active.category && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    {active.category}
                  </Badge>
                )}
                <Badge variant="outline" className={cn("border text-[10px]", CONF_STYLE[active.confidence ?? "thin"]?.cls)}>
                  {active.confidence ?? "thin"}
                </Badge>
                {active.live?.perEarningUsdPerDay != null && (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-400">
                    ≈ ${Math.round(active.live.perEarningUsdPerDay).toLocaleString()}/d per earner
                    {active.live.estimated ? " (est.)" : ""}
                  </Badge>
                )}
                <span className="ml-auto flex gap-1.5">
                  {active.githubUrl && (
                    <a href={active.githubUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
                      <Github className="h-3 w-3" /> repo
                    </a>
                  )}
                  {active.website && (
                    <a href={active.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
                      <ExternalLink className="h-3 w-3" /> site
                    </a>
                  )}
                  <a href={`https://taostats.io/subnets/${active.netuid}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
                    <Users className="h-3 w-3" /> taostats
                  </a>
                </span>
              </div>

              {/* Live context strip */}
              {active.live && (
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded-md border px-2 py-1">
                    rewarded {active.live.rewardedMiners ?? "?"} / {active.live.minersCount ?? "?"} registered
                  </span>
                  {active.live.minerEmissionTaoPerDay != null && (
                    <span className="rounded-md border px-2 py-1">
                      miner emission {active.live.minerEmissionTaoPerDay.toFixed(2)} TAO/d
                    </span>
                  )}
                  {active.gpu && (
                    <span className="rounded-md border px-2 py-1">
                      floor: {active.gpu}
                      {active.minVramGb ? ` · ≥${active.minVramGb} GB` : ""}
                      {active.gpuCount ? ` · ×${active.gpuCount}` : ""}
                    </span>
                  )}
                  {active.hosting?.tee && <span className="rounded-md border border-rose-500/30 px-2 py-1 text-rose-400">TEE</span>}
                  {active.hosting?.bareMetal && <span className="rounded-md border border-rose-500/30 px-2 py-1 text-rose-400">bare metal</span>}
                  {active.hosting?.staticIp && <span className="rounded-md border border-amber-500/30 px-2 py-1 text-amber-400">static IP</span>}
                </div>
              )}

              <Section n={1} icon={<HelpCircle className="h-3.5 w-3.5" />} title="What it does">
                <p className="text-sm leading-relaxed text-muted-foreground">{active.whatItDoes}</p>
              </Section>

              <Section n={2} icon={<Server className="h-3.5 w-3.5" />} title="Recommended GPU / CPU">
                <p className="text-sm leading-relaxed text-muted-foreground">{active.hardwareRec}</p>
                {active.gpu && (
                  <p className="mt-1.5 font-mono text-[11px] text-foreground/80">
                    platform floor: {active.gpu}
                    {active.minVramGb ? ` · ≥${active.minVramGb} GB VRAM` : ""}
                    {active.gpuCount ? ` · ${active.gpuCount} GPU(s)` : ""}
                  </p>
                )}
              </Section>

              <Section n={3} icon={<ListChecks className="h-3.5 w-3.5" />} title="Key requirements">
                <ul className="space-y-1">
                  {active.keyRequirements.map((r, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section n={4} icon={<Cpu className="h-3.5 w-3.5" />} title="Your job as a miner">
                <p className="text-sm leading-relaxed text-muted-foreground">{active.minerJob}</p>
                {active.minerJobProvide.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {active.minerJobProvide.map((p, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] font-normal text-muted-foreground">
                        {p}
                      </Badge>
                    ))}
                  </div>
                )}
              </Section>

              <Section n={5} icon={<Target className="h-3.5 w-3.5" />} title="Mindset to crack the top 10">
                <p className="text-sm leading-relaxed text-muted-foreground">{active.top10Strategy}</p>
                {active.top10Levers.length > 0 && (
                  <ol className="mt-2 space-y-1">
                    {active.top10Levers.map((l, i) => (
                      <li key={i} className="flex gap-2 text-[13px] text-muted-foreground">
                        <span className="font-mono text-[11px] text-primary">{i + 1}.</span>
                        <span>{l}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>

              <Section n={6} icon={<Layers3 className="h-3.5 w-3.5" />} title="Follow the top miners">
                <p className="text-sm leading-relaxed text-muted-foreground">{active.followTopMiners}</p>
                {active.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {active.sources.map((s, i) => (
                      <a
                        key={i}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        <ShieldCheck className="h-3 w-3" /> {s.label}
                      </a>
                    ))}
                  </div>
                )}
              </Section>

              <p className="border-t pt-3 text-[10px] text-muted-foreground/70">
                Researched {active.researchedAt ? new Date(active.researchedAt).toISOString().slice(0, 10) : "—"} from
                the sources above. Repos change — re-check the miner README before committing hardware.
              </p>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a subnet from the list.
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

function Section({
  n,
  icon,
  title,
  children,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-background/40 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
        <span className="flex h-4.5 w-4.5 items-center justify-center rounded bg-primary/15 font-mono text-[10px] text-primary">
          {n}
        </span>
        <span className="text-primary/80">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}
