"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Cpu,
  Zap,
  Server,
  MapPin,
  RefreshCw,
  Loader2,
  WifiOff,
  KeyRound,
  GitBranch,
  Laptop,
  MemoryStick,
  HardDrive,
  PiggyBank,
} from "lucide-react";
import { useCpuOffers, type CpuOffersSnapshot } from "@/lib/infranex/use-cpu-offers";
import { useMergedGpuOffers } from "@/lib/infranex/use-gpu-offers";
import { ProviderKeysDialog } from "@/components/gpus/provider-keys-dialog";
import { CpuProvisionDialog } from "@/components/cpus/provision-dialog";
import { LocalMachineSection } from "@/components/cpus/local-machine-section";
import { cn, formatCurrency } from "@/lib/utils";
import type { ViewKey } from "@/lib/infranex/types";

// ---------------------------------------------------------------------------
// CPU-CATALOG-1 — the CPU Catalog, the CPU-side mirror of the GPU Catalog:
//
//   connect API keys (Hetzner Cloud, DigitalOcean, Vast.ai)  →  live CPU offers flow in
//   (Akash reference tiers load keyless)  →  rent & auto-install flows to DevOps
//   pick a CPU-classified subnet                    →  engine pulls its
//                                                       requirements from git
//   "Rent & auto-install"                           →  provider creates the
//                                                       box + cloud-init
//                                                       installs the base
//                                                       stack, DevOps gets a
//                                                       staged install plan
//
// The typical CPU-classified subnet needs 2 vCPU / 4-8 GB / 40-50 GB — about
// $5-9/mo at Hetzner instead of $161/mo for the cheapest GPU (RTX 3090).
// ---------------------------------------------------------------------------

interface CpusViewProps {
  onNavigate: (v: ViewKey) => void;
}

/** Floor for "qualifying" recommendation cards (typical CPU-subnet spec). */
const FLOOR = { cores: 2, ramGb: 4, diskGb: 40 };
const REDTEAM_CLASS = { cores: 2, ramGb: 8, diskGb: 50 };

type Offer = CpuOffersSnapshot["offers"][number];

export function CpusView({ onNavigate }: CpusViewProps) {
  const [minRam, setMinRam] = useState<string>("any");
  const [offerProvider, setOfferProvider] = useState<string>("all");
  const [offerSort, setOfferSort] = useState<string>("monthlyPrice");
  const [offerMaxPrice, setOfferMaxPrice] = useState<string>("");

  const { data: snap, isFetching, refetch } = useCpuOffers();
  const { offers: gpuOffers } = useMergedGpuOffers();

  const offers = snap?.offers ?? [];

  // Provider API keys — dialog state + connected-provider bookkeeping.
  const [keysOpen, setKeysOpen] = useState(false);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [provisionOffer, setProvisionOffer] = useState<Offer | null>(null);
  const liveProviders = (snap?.providers ?? []).filter((p) => p.configured && p.offers > 0);
  const configuredProviders = (snap?.providers ?? []).filter((p) => p.configured);
  const keylessCount = configuredProviders.filter((p) => (p as { keyless?: boolean }).keyless).length;
  const connectedLabel =
    configuredProviders.length === 0
      ? ". Connect Hetzner Cloud, DigitalOcean or Vast.ai with your own API key for live pricing."
      : keylessCount === configuredProviders.length
        ? `. ${configuredProviders.length} provider${configuredProviders.length > 1 ? "s" : ""} streaming public market data — no keys needed.`
        : keylessCount > 0
          ? `. ${configuredProviders.length} provider${configuredProviders.length > 1 ? "s" : ""} live (Akash keyless + your API keys).`
          : `. ${configuredProviders.length} provider${configuredProviders.length > 1 ? "s" : ""} connected via your API keys.`;
  const providerLabel =
    liveProviders.length > 1
      ? `${liveProviders.length} providers`
      : liveProviders.length === 1
        ? liveProviders[0].label
        : null;

  const offerProviderOptions = useMemo(
    () => Array.from(new Set(offers.map((o) => o.provider))),
    [offers]
  );

  const filteredOffers = useMemo(() => {
    let r = offers.filter((o) => {
      if (offerProvider !== "all" && o.provider !== offerProvider) return false;
      if (minRam !== "any" && o.ramGb < Number(minRam)) return false;
      if (offerMaxPrice && o.monthlyPrice > Number(offerMaxPrice)) return false;
      return true;
    });
    r = [...r].sort((a, b) => {
      if (offerSort === "monthlyPrice") return a.monthlyPrice - b.monthlyPrice;
      if (offerSort === "ramGb") return b.ramGb - a.ramGb;
      if (offerSort === "cpuCores") return b.cpuCores - a.cpuCores || a.monthlyPrice - b.monthlyPrice;
      if (offerSort === "diskGb") return b.diskGb - a.diskGb;
      return 0;
    });
    return r;
  }, [offers, offerProvider, minRam, offerSort, offerMaxPrice]);

  // Recommendation cards — honest: they only render when a live offer qualifies.
  const qualifying = (spec: { cores: number; ramGb: number; diskGb: number }) =>
    offers
      .filter((o) => o.cpuCores >= spec.cores && o.ramGb >= spec.ramGb && o.diskGb >= spec.diskGb)
      .sort((a, b) => a.monthlyPrice - b.monthlyPrice);
  const floorBox = qualifying(FLOOR)[0];
  const redteamBox = qualifying(REDTEAM_CLASS)[0];
  const cheapestGpuMonthly = gpuOffers
    .filter((g) => g.live && !g.isSpot)
    .sort((a, b) => a.hourlyPrice - b.hourlyPrice)[0];
  const gpuMonthly = cheapestGpuMonthly ? Math.round(cheapestGpuMonthly.hourlyPrice * 730) : null;
  const cpuMonthly = redteamBox?.monthlyPrice ?? floorBox?.monthlyPrice ?? null;
  const savingsPct =
    gpuMonthly && cpuMonthly ? Math.max(0, Math.round((1 - cpuMonthly / gpuMonthly) * 100)) : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-eyebrow text-muted-foreground">
            Section · 06b · <span className="text-primary">Step 2 (CPU) — get a CPU host</span>
          </p>
          <h1 className="animate-rise text-display text-3xl font-bold tracking-tight md:text-4xl">
            CPU Catalog
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rent a CPU VPS for the CPU-classified subnets — no GPU, ~95% cheaper than a
            GPU box.{" "}
            {providerLabel
              ? `${offers.length} live offers from ${providerLabel}`
              : isFetching
                ? "checking provider markets…"
                : "no live offers yet — connect a CPU provider key below"}
            {connectedLabel}{" "}
            Rent &amp; auto-install pulls the subnet&apos;s requirements from its git repo and
            provisions the box with the mining base stack. Prefer your own hardware? Connect a
            local machine below and start the CPU miner on your laptop for $0.
          </p>
        </div>
        <div className="flex flex-col gap-2 self-start sm:flex-row sm:self-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setKeysOpen(true)}
          >
            <KeyRound className="h-3.5 w-3.5 text-primary" />
            Provider API keys
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </header>

      {/* How the CPU path works — 3 cloud steps + the local-machine branch */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: KeyRound,
            title: "1 · Connect a provider",
            body: "Paste your Hetzner Cloud, DigitalOcean or Vast.ai API key — offers refresh live every 60s. Akash tiers load without a key. Keys stay encrypted server-side.",
          },
          {
            icon: GitBranch,
            title: "2 · Pick a CPU subnet",
            body: "The engine profiles the subnet's git repo (README, requirements.txt, Dockerfile) and refuses boxes that can't run it.",
          },
          {
            icon: Server,
            title: "3 · Rent & auto-install",
            body: "Cloud-init installs docker + bittensor on the new box; the subnet install lands in DevOps with wallet/launch gates.",
          },
          {
            icon: Laptop,
            title: "…or use your laptop",
            body: "Connect a local machine below and start the CPU miner on your own hardware — $0/mo, NAT-safe pull agent, revoke anytime.",
          },
        ].map((s) => (
          <div key={s.title} className="rounded-xl border border-border/60 bg-card/30 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <s.icon className="h-4 w-4 text-primary" /> {s.title}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>

      {/* Recommendation cards — live qualifying boxes only */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="border-border/60 bg-card/40">
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Zap className="h-3.5 w-3.5 text-primary" /> CHEAPEST QUALIFYING BOX · ≥2 vCPU / 4 GB / 40 GB
            </p>
            {floorBox ? (
              <>
                <p className="mt-2 text-2xl font-bold text-display">
                  {formatCurrency(floorBox.monthlyPrice)}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{floorBox.model}</span>
                  <Badge variant="outline" className="border-border/60 text-muted-foreground">
                    {floorBox.provider}
                  </Badge>
                  <span>
                    {floorBox.cpuCores} vCPU · {floorBox.ramGb} GB · {floorBox.diskGb} GB
                  </span>
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                No qualifying live offer — connect a CPU provider key.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40">
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Cpu className="h-3.5 w-3.5 text-primary" /> REDTEAM-CLASS BOX · ≥2 vCPU / 8 GB / 50 GB
            </p>
            {redteamBox ? (
              <>
                <p className="mt-2 text-2xl font-bold text-display">
                  {formatCurrency(redteamBox.monthlyPrice)}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{redteamBox.model}</span>
                  <Badge variant="outline" className="border-border/60 text-muted-foreground">
                    {redteamBox.provider}
                  </Badge>
                  <span>
                    {redteamBox.cpuCores} vCPU · {redteamBox.ramGb} GB · {redteamBox.diskGb} GB
                  </span>
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                No qualifying live offer — connect a CPU provider key.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40">
          <CardContent className="p-4">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <PiggyBank className="h-3.5 w-3.5 text-primary" /> CPU VS GPU HOST COST
            </p>
            {gpuMonthly != null && cpuMonthly != null && savingsPct != null ? (
              <>
                <p className="mt-2 text-2xl font-bold text-display">
                  −{savingsPct}%
                  <span className="text-sm font-normal text-muted-foreground"> host cost</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatCurrency(cpuMonthly)}/mo CPU box vs{" "}
                  {formatCurrency(gpuMonthly)}/mo cheapest GPU (
                  {cheapestGpuMonthly?.model ?? "—"}). CPU-classified subnet rewards don&apos;t
                  need a GPU.
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {gpuMonthly == null
                  ? "No live GPU offers to compare — connect a GPU provider key."
                  : "No live CPU offers to compare — connect a CPU provider key."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={offerProvider} onValueChange={setOfferProvider}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All providers</SelectItem>
            {offerProviderOptions.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={minRam} onValueChange={setMinRam}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any RAM</SelectItem>
            <SelectItem value="2">≥ 2 GB</SelectItem>
            <SelectItem value="4">≥ 4 GB</SelectItem>
            <SelectItem value="8">≥ 8 GB</SelectItem>
            <SelectItem value="16">≥ 16 GB</SelectItem>
            <SelectItem value="32">≥ 32 GB</SelectItem>
          </SelectContent>
        </Select>
        <Select value={offerSort} onValueChange={setOfferSort}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthlyPrice">Cheapest /mo</SelectItem>
            <SelectItem value="cpuCores">Most vCPU</SelectItem>
            <SelectItem value="ramGb">Most RAM</SelectItem>
            <SelectItem value="diskGb">Most disk</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Max $/mo…"
          inputMode="decimal"
          value={offerMaxPrice}
          onChange={(e) => setOfferMaxPrice(e.target.value.replace(/[^0-9.]/g, ""))}
          className="h-8 w-[110px] text-xs"
        />
        <span className="ml-auto text-xs text-muted-foreground">
          {filteredOffers.length} of {offers.length} offers
          {snap?.fetchedAt ? ` · fetched ${new Date(snap.fetchedAt).toLocaleTimeString()}` : ""}
        </span>
      </div>

      {/* Offers table */}
      <div className="rounded-xl border border-border/60 bg-card/30">
        {filteredOffers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            {providerLabel ? (
              <>
                <WifiOff className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Connected providers returned no offers matching the filters.
                </p>
              </>
            ) : (
              <>
                <KeyRound className="h-6 w-6 text-muted-foreground" />
                <p className="max-w-md text-sm text-muted-foreground">
                  Akash Network tiers load instantly (reference estimates — Akash CPU
                  leases are bid-priced). Add your Hetzner Cloud, DigitalOcean or
                  Vast.ai API key and the catalog pulls their live pricing the moment
                  a key verifies (Hetzner CX22 ≈ $5/mo for 2 vCPU / 4 GB / 40 GB).
                </p>
                <Button size="sm" className="gap-2" onClick={() => setKeysOpen(true)}>
                  <KeyRound className="h-3.5 w-3.5" /> Connect a CPU provider
                </Button>
              </>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">Box</TableHead>
                <TableHead className="text-xs">vCPU</TableHead>
                <TableHead className="text-xs">RAM</TableHead>
                <TableHead className="text-xs">Disk</TableHead>
                <TableHead className="text-xs">Provider</TableHead>
                <TableHead className="text-xs">Region</TableHead>
                <TableHead className="text-right text-xs">$/mo</TableHead>
                <TableHead className="text-right text-xs">$/hr</TableHead>
                <TableHead className="text-right text-xs">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOffers.map((o) => (
                <TableRow key={o.id} className="text-sm">
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      <Server className="h-3.5 w-3.5 text-primary" />
                      {o.model}
                      {o.cpuType === "dedicated" && (
                        <Badge
                          variant="outline"
                          className="border-primary/40 px-1 py-0 text-[10px] text-primary"
                        >
                          ded
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{o.cpuCores}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <MemoryStick className="h-3 w-3 text-muted-foreground" />
                      {o.ramGb} GB
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1">
                      <HardDrive className="h-3 w-3 text-muted-foreground" />
                      {o.diskGb} GB
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{o.provider}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {o.region}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-primary">
                    {formatCurrency(o.monthlyPrice)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    ${o.hourlyPrice.toFixed(4)}
                  </TableCell>
                  <TableCell className="text-right">
                    {/* PROVIDER-AKASH — rental adapters exist for Hetzner/DO
                        only; Akash/Vast CPU rows stay browseable but the
                        one-click rent is disabled until their adapters land. */}
                    {o.source === "hetzner" || o.source === "digitalocean" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn(
                          "h-8 gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                        )}
                        onClick={() => {
                          setProvisionOffer(o);
                          setProvisionOpen(true);
                        }}
                      >
                        <Server className="h-3.5 w-3.5" /> Rent &amp; install
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                        title="Live offers shown for comparison — one-click rent for this provider is coming (Akash deploys via the Console API, Vast via its instance API)."
                        className="h-8 gap-1.5"
                      >
                        <Server className="h-3.5 w-3.5" /> Rent soon
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Provider status line */}
      {snap && snap.providers.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {snap.providers
            .map(
              (p) =>
                `${p.label}: ${
                  !p.configured
                    ? "not connected"
                    : p.error
                      ? `error — ${p.error}`
                      : `${p.offers} offers${p.origin === "env" ? " (env key)" : ""}`
                }`
            )
            .join(" · ")}
        </p>
      )}

      {/* The $0/mo branch — connect the laptop and start the miner on it */}
      <LocalMachineSection onNavigate={onNavigate} />

      <ProviderKeysDialog open={keysOpen} onOpenChange={setKeysOpen} kind="cpu" />
      <CpuProvisionDialog
        open={provisionOpen}
        onOpenChange={setProvisionOpen}
        offer={provisionOffer}
        onNavigate={onNavigate}
      />
    </div>
  );
}
