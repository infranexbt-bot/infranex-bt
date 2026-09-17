"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GitBranch,
  HardDrive,
  Loader2,
  MemoryStick,
  Package,
  Server,
  ShieldCheck,
  TerminalSquare,
  Cpu,
  CircleAlert,
  CircleCheck,
  Radar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useNetwork, mergeOpportunities } from "@/lib/infranex/use-network";
import { useProfitabilityConfig } from "@/lib/infranex/use-profitability";
import type { CPUOffer } from "@/lib/infranex/types";
import type { ViewKey } from "@/lib/infranex/types";

// ---------------------------------------------------------------------------
// CPU-CATALOG-1 — the rent-and-auto-install dialog.
//
// ONE flow, exactly what the operator asked for: pick a box from the CPU
// catalog, pick a CPU-classified subnet, and the engine
//   1. pulls the subnet's requirements FROM ITS GIT REPO
//      (chain identity + README + requirements.txt + Dockerfile via the
//      Subnet Requirements Profiler),
//   2. rents the exact box at the provider (ephemeral SSH key injected),
//   3. auto-installs the mining base stack via cloud-init (docker, python
//      venv, bittensor),
//   4. stages the subnet install plan in DevOps — wallet + launch stay
//      approval-gated (hotkey-only policy).
// ---------------------------------------------------------------------------

interface PulledProfile {
  netuid: number;
  subnetName: string;
  description: string | null;
  category: string | null;
  minVramGb: number;
  recommendedGpu: string;
  gpuSource: string;
  osPackages: string[];
  pythonVersion: string | null;
  pipPackageCount: number;
  dockerImage: string | null;
  dockerfileFound: boolean;
  bittensorStack: string[];
  repoUrl: string | null;
  entrypoint: string | null;
  ports: { axon: number; prometheus: number };
  envKeys: { name: string; description: string; required: boolean }[];
  confidence: string;
  sources: string[];
  notes: string[];
}

const REGIONS: Record<string, { value: string; label: string }[]> = {
  hetzner: [
    { value: "fsn1", label: "Falkenstein, DE (default)" },
    { value: "nbg1", label: "Nuremberg, DE" },
    { value: "hel1", label: "Helsinki, FI" },
    { value: "ash", label: "Ashburn, US" },
    { value: "hil", label: "Hillsboro, US" },
  ],
  digitalocean: [
    { value: "nyc3", label: "New York 3, US (default)" },
    { value: "nyc1", label: "New York 1, US" },
    { value: "sfo3", label: "San Francisco 3, US" },
    { value: "ams3", label: "Amsterdam 3, NL" },
    { value: "fra1", label: "Frankfurt 1, DE" },
    { value: "lon1", label: "London 1, UK" },
    { value: "tor1", label: "Toronto 1, CA" },
    { value: "sgp1", label: "Singapore 1" },
    { value: "blr1", label: "Bangalore 1, IN" },
  ],
};

interface ProvisionResult {
  host: { id: string; name: string; provider: string; status: string; host: string; providerServerId: string };
  server: { id: string; status: string; ip: string | null };
  offer: { model: string; region: string; monthlyPrice: number };
  subnet: { netuid: number; name: string; repoUrl: string | null };
  install: { id: string; stepCount: number; staged: boolean } | null;
}

export function CpuProvisionDialog({
  open,
  onOpenChange,
  offer,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  offer: (CPUOffer & { source: string }) | null;
  onNavigate: (v: ViewKey) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: snap } = useNetwork();
  const { data: profConfig } = useProfitabilityConfig();

  const [netuidStr, setNetuidStr] = useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [walletName, setWalletName] = useState("");
  const [hotkeyName, setHotkeyName] = useState("");

  const netuid = Number.isFinite(Number(netuidStr)) && netuidStr !== "" ? Number(netuidStr) : null;

  // Reset transient state whenever the dialog opens for a different box.
  useEffect(() => {
    if (open && offer) setRegion("");
  }, [open, offer]);

  // CPU-classified quick picks — the same engine the Opportunities scanner
  // runs (min VRAM ≤ 0), top 8 by score.
  const cpuOpps = useMemo(
    () =>
      mergeOpportunities(snap, profConfig)
        .filter((o) => (o.minVramGb ?? 0) <= 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8),
    [snap, profConfig]
  );

  // The pulled-from-git requirements — shown BEFORE renting so the operator
  // sees exactly what the engine will install on the box.
  const reqQuery = useQuery<{ profile: PulledProfile; cached: boolean }>({
    queryKey: ["subnet-requirements", netuid],
    queryFn: async () => {
      const res = await fetch(`/api/devops/subnet-requirements?netuid=${netuid}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `requirements ${res.status}`);
      return j;
    },
    enabled: open && netuid !== null,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const profile = reqQuery.data?.profile ?? null;
  const gpuLocked = Boolean(profile && profile.minVramGb > 0);

  const provisionMut = useMutation({
    mutationFn: async (): Promise<ProvisionResult> => {
      const res = await fetch("/api/cpu-provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: offer?.source,
          offerId: offer?.id,
          region: region || undefined,
          netuid,
          walletName: walletName.trim(),
          hotkeyName: hotkeyName.trim(),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `provision ${res.status}`);
      return j;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devops-hosts"] });
      toast({
        title: "CPU box rented — base stack installing",
        description: "The provider is creating your server; cloud-init installs the mining base. Drive the gated subnet install from DevOps Engine.",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Provisioning failed", description: e.message, variant: "destructive" }),
  });

  const canProvision =
    Boolean(offer) &&
    netuid !== null &&
    !gpuLocked &&
    !reqQuery.isLoading &&
    !reqQuery.error &&
    /^[a-zA-Z0-9_-]{1,32}$/.test(walletName.trim()) &&
    /^[a-zA-Z0-9_-]{1,32}$/.test(hotkeyName.trim()) &&
    !provisionMut.isPending &&
    !provisionMut.data;

  const result = provisionMut.data;

  const close = () => {
    onOpenChange(false);
    provisionMut.reset();
    setNetuidStr("");
    setWalletName("");
    setHotkeyName("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto custom-scroll sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" /> Rent CPU box & auto-install
          </DialogTitle>
          <DialogDescription>
            The engine pulls the subnet&apos;s requirements from its git repo, rents the
            exact box, and auto-installs the mining base via cloud-init. Wallet and
            miner launch stay approval-gated in DevOps.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/5 p-4">
              <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-success">
                  {result.offer.model} rented at {result.host.provider} ({result.offer.region})
                </p>
                <p className="text-xs text-muted-foreground">
                  Server {result.server.id} · status {result.server.status}
                  {result.server.ip ? ` · IP ${result.server.ip}` : " · IP pending"} · $
                  {result.offer.monthlyPrice}/mo · DevOps host &ldquo;{result.host.name}&rdquo;
                </p>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border/60 bg-card/30 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Package className="h-4 w-4 text-primary" /> What happens now
              </p>
              <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                <li>
                  Cloud-init is auto-installing the base stack on the box (docker, python
                  venv, bittensor) — give it ~3-5 minutes after the IP appears.
                </li>
                <li>
                  {result.install
                    ? `The ${result.install.stepCount}-step install plan for SN${result.subnet.netuid} is staged on the host.`
                    : "The subnet install plan can be staged from the DevOps console."}
                </li>
                <li>
                  Open DevOps Engine, validate the host, then run the gated steps (wallet
                  files + miner launch) — those two need your approval by design.
                </li>
              </ol>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={close}>
                Done
              </Button>
              <Button
                className="gap-2"
                onClick={() => {
                  close();
                  onNavigate("devops");
                }}
              >
                <Radar className="h-4 w-4" /> Open DevOps Engine
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Selected offer */}
            {offer && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-card/30 p-3 text-sm">
                <span className="font-semibold">{offer.model}</span>
                <Badge variant="outline" className="border-border/60 text-muted-foreground">
                  {offer.provider}
                </Badge>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Cpu className="h-3.5 w-3.5" /> {offer.cpuCores} vCPU
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MemoryStick className="h-3.5 w-3.5" /> {offer.ramGb} GB RAM
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <HardDrive className="h-3.5 w-3.5" /> {offer.diskGb} GB
                </span>
                <span className="ml-auto font-mono text-xs text-primary">
                  ${offer.monthlyPrice}/mo ≈ ${offer.hourlyPrice}/hr
                </span>
              </div>
            )}

            {/* Subnet picker */}
            <div className="space-y-2">
              <Label className="text-xs">Subnet to install (CPU-classified)</Label>
              <div className="flex flex-wrap gap-1.5">
                {cpuOpps.map((o) => (
                  <button
                    key={o.netuid}
                    type="button"
                    onClick={() => setNetuidStr(String(o.netuid))}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      netuid === o.netuid
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    )}
                  >
                    SN{o.netuid} · {o.subnetName.length > 14 ? `${o.subnetName.slice(0, 14)}…` : o.subnetName}
                  </button>
                ))}
                {cpuOpps.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Network snapshot still loading — type a netuid manually below.
                  </p>
                )}
              </div>
              <Input
                inputMode="numeric"
                placeholder="…or type a netuid (e.g. 61 for RedTeam)"
                value={netuidStr}
                onChange={(e) => setNetuidStr(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-9 font-mono text-xs"
              />
            </div>

            {/* Pulled-from-git requirements */}
            {netuid !== null && (
              <div className="space-y-2 rounded-lg border border-border/60 bg-card/30 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <GitBranch className="h-4 w-4 text-primary" /> Requirements pulled from the subnet&apos;s git
                  {reqQuery.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  {reqQuery.data?.cached && (
                    <Badge variant="outline" className="border-border/60 text-muted-foreground">
                      cached 6h
                    </Badge>
                  )}
                </p>

                {reqQuery.isLoading && (
                  <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Profiling SN{netuid} — chain identity, README,
                    requirements.txt, Dockerfile…
                  </p>
                )}

                {reqQuery.error && (
                  <p className="flex items-start gap-2 py-2 text-xs text-destructive">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Profiler failed: {(reqQuery.error as Error).message} — you can retry or
                    stage the install manually from DevOps later.
                  </p>
                )}

                {profile && !gpuLocked && (
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold">{profile.subnetName}</span>
                      {profile.category && (
                        <Badge variant="outline" className="border-border/60 text-muted-foreground">
                          {profile.category}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={cn(
                          profile.confidence === "high"
                            ? "border-success/40 text-success"
                            : profile.confidence === "medium"
                              ? "border-warning/40 text-warning"
                              : "border-destructive/40 text-destructive"
                        )}
                      >
                        {profile.confidence} confidence
                      </Badge>
                    </div>
                    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {profile.repoUrl && (
                        <span className="flex items-center gap-1">
                          <GitBranch className="h-3 w-3" /> {profile.repoUrl.replace(/^https?:\/\//, "")}
                        </span>
                      )}
                      {profile.entrypoint && <span>entrypoint {profile.entrypoint}</span>}
                      <span>axon :{profile.ports?.axon ?? 8091}</span>
                      {profile.dockerfileFound && <span>Dockerfile detected</span>}
                      {profile.pythonVersion && <span>python {profile.pythonVersion}</span>}
                      <span>{profile.pipPackageCount > 0 ? `${profile.pipPackageCount} pip deps` : "no pip deps"}</span>
                    </p>
                    {profile.osPackages.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        <Package className="mr-1 inline h-3 w-3" />
                        apt: {profile.osPackages.slice(0, 6).join(", ")}
                        {profile.osPackages.length > 6 ? "…" : ""}
                      </p>
                    )}
                    {profile.notes.length > 0 && (
                      <p className="text-xs text-muted-foreground/80 italic">{profile.notes[0]}</p>
                    )}
                  </div>
                )}

                {gpuLocked && (
                  <p className="flex items-start gap-2 py-2 text-xs text-destructive">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    SN{netuid} documents GPU requirements ({profile?.recommendedGpu}) — pick a
                    CPU-classified subnet or rent this one from the GPU Catalog.
                  </p>
                )}
              </div>
            )}

            {/* Region + identity */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Region</Label>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger className="h-9">
                    <SelectValue
                      placeholder={offer ? REGIONS[offer.source]?.[0]?.label ?? "Default" : "Default"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(offer ? REGIONS[offer.source] ?? [] : []).map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Wallet name</Label>
                <Input
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  placeholder="default"
                  className="h-9 font-mono text-xs"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Hotkey name</Label>
                <Input
                  value={hotkeyName}
                  onChange={(e) => setHotkeyName(e.target.value)}
                  placeholder="miner-cpu"
                  className="h-9 font-mono text-xs"
                  autoComplete="off"
                />
              </div>
              <div className="flex items-end">
                <p className="flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  Wallet files are copied by YOU in the gated DevOps step — the platform
                  never ships coldkeys to rented machines.
                </p>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <TerminalSquare className="h-3.5 w-3.5" />
                Base install is automatic; only wallet + launch need your click.
              </p>
              <Button className="gap-2" disabled={!canProvision} onClick={() => provisionMut.mutate()}>
                {provisionMut.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Renting…
                  </>
                ) : (
                  <>
                    <Server className="h-4 w-4" /> Rent & auto-install
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
