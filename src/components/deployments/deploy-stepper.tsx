"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Rocket,
  Search,
  Cpu,
  Wallet,
  Play,
  Server,
  Laptop,
  Flame,
  Unlock,
  Hourglass,
  Terminal,
  KeyRound,
  RotateCw,
  ShieldCheck,
  XCircle,
  FlaskConical,
  Activity,
} from "lucide-react";
import { cn, formatCurrency, formatRelativeTime } from "@/lib/utils";
import { useNetwork, mergeSubnets } from "@/lib/infranex/use-network";
import { useMergedGpuOffers, type MergedGpuOffer } from "@/lib/infranex/use-gpu-offers";
import { useCpuOffers } from "@/lib/infranex/use-cpu-offers";
import { useLocalHosts, type LocalHostDTO } from "@/lib/infranex/use-local-hosts";
import { useWallets } from "@/lib/infranex/use-platform";
import {
  useCreateDeployment,
  useDeploymentDetail,
  useTickDeployment,
  useRegistrationAction,
  type DeploymentStep,
  type RegistrationWizardContext,
} from "@/lib/infranex/use-deployments";
import { WalletRegistrationDialog } from "@/components/devops/wallet-registration-dialog";
import { DaemonInstallDialog } from "@/components/deployments/daemon-install-dialog";
import { takeDeployPreselect } from "@/components/deployments/deploy-preselect";
import { assessSeatChance } from "@/lib/infranex/miner-score";
import { useSubnetOverrides } from "@/lib/infranex/use-subnet-overrides";
import { hostingFlags } from "@/components/cards/hosting-requirements";
import type { HostingRequirements } from "@/lib/infranex/github-scraper";
import type { SubnetRequirementsProfile } from "@/lib/devops/subnet-requirements";
import { useToast } from "@/hooks/use-toast";

/**
 * Deploy Stepper — the deployment page's ONE deploy flow, on a single page,
 * no dialog. Four steps, always visible at the top of the page:
 *
 *   1. Subnet  — where to mine (live chain list + seat verdicts)
 *   2. Compute — GPU subnets: what to rent (offers filtered). CPU subnets
 *              (CPUDEPLOY-1): rent a CPU VPS (Hetzner/DO) OR pick a
 *              registered local machine (your laptop) — the same two
 *              targets the CPU Catalog and DevOps Local machines serve.
 *   3. Deploy  — one button rents + auto-installs, or queues the setup
 *              on the local machine; output streams back
 *   4. Go live — register on-chain (wallet wizard / DevOps install plan)
 *              + connect the daemon
 *
 * Replaces the old 5-step dialog (requirements folded into the GPU step,
 * review merged into the deploy step, registration + daemon combined into
 * "Go live"). The step rail shows each step's picked value at a glance and
 * lets the operator jump back to any completed step.
 */

const STEPS = [
  { n: 1, label: "Subnet", hint: "Where to mine" },
  { n: 2, label: "Compute", hint: "Cloud, or your laptop" },
  { n: 3, label: "Deploy", hint: "Rent / start & install" },
  { n: 4, label: "Go live", hint: "Register & connect" },
] as const;

// cpu-provision POST name rule (lowercase 3-48) — minerName is sanitized to
// this, or omitted so the server generates one.
const CPU_NAME_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;

type StepN = 1 | 2 | 3 | 4;

export function DeployStepper() {
  const [step, setStep] = useState<StepN>(1);
  const [netuid, setNetuid] = useState<number | null>(null);
  const [offerId, setOfferId] = useState<string | null>(null);
  // CPUDEPLOY-1 — CPU subnets branch at step 2 into two compute targets:
  // rent a CPU VPS (Hetzner/DigitalOcean) or run on a registered local
  // machine (laptop). Each path keeps its own pick + post-action state.
  const [computeKind, setComputeKind] = useState<"cloud" | "local" | null>(null);
  const [cpuOfferId, setCpuOfferId] = useState<string | null>(null);
  const [localHostId, setLocalHostId] = useState<string | null>(null);
  const [hotkeyName, setHotkeyName] = useState("");
  const [cpuProvisioned, setCpuProvisioned] = useState<{
    installSteps: number | null;
    hostName: string;
  } | null>(null);
  const [queuedCmdId, setQueuedCmdId] = useState<string | null>(null);
  const [minerName, setMinerName] = useState("");
  const [walletName, setWalletName] = useState("infranex");
  const [search, setSearch] = useState("");
  const [depId, setDepId] = useState<string | null>(null);
  const [regCtx, setRegCtx] = useState<RegistrationWizardContext | null>(null);
  const [regOpen, setRegOpen] = useState(false);
  const [daemonOpen, setDaemonOpen] = useState(false);
  // MECHANICS-1 — hosting-compliance gate: subnets whose own repo README
  // rejects container clouds (Chutes: "will not work on Runpod, Vast") must
  // not sail through a RunPod/Vast rental wizard unnoticed. Ack is scoped to
  // the netuid so switching subnets re-arms the gate.
  const [hostingAckUid, setHostingAckUid] = useState<number | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Saved wallet profiles prefill the wallet name (default profile wins)
  // until the operator types their own — derived at render, no effect.
  const { data: walletProfiles } = useWallets();
  const [walletTouched, setWalletTouched] = useState(false);
  const effWalletName =
    walletTouched || !walletProfiles || walletProfiles.length === 0
      ? walletName
      : (walletProfiles.find((w) => w.isDefault) ?? walletProfiles[0]).walletName;

  // Consume a cross-view preselect ("Start mining" on an opportunity /
  // "Provision" in the GPU catalog) exactly once on mount. Mirrors the old
  // dialog's closed→open seeding; the lint rule forbids the pattern
  // wholesale, so scope the disable to exactly this block.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const pre = takeDeployPreselect();
    if (!pre) return;
    if (pre.netuid != null) {
      setNetuid(pre.netuid);
      setStep(2);
    }
    if (pre.offerId) setOfferId(pre.offerId);
    if (pre.computeKind) setComputeKind(pre.computeKind);
    if (pre.localHostId) setLocalHostId(pre.localHostId);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // --- Step 1 data: live subnets (chain + curated merged) ------------------
  const { data: net, isLoading: netLoading } = useNetwork();
  const subnets = useMemo(() => mergeSubnets(net), [net]);
  const liveSubnet = useMemo(
    () => subnets.find((s) => s.netuid === netuid) ?? null,
    [subnets, netuid]
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? subnets.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            String(s.netuid) === q ||
            s.category.toLowerCase().includes(q)
        )
      : subnets;
  }, [subnets, search]);

  // --- Step 2 data: real requirements profile (folded into the GPU step) ---
  const reqQ = useQuery({
    queryKey: ["stepper-requirements", netuid],
    queryFn: async () => {
      const res = await fetch(`/api/devops/subnet-requirements?netuid=${netuid}`, {
        cache: "no-store",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      return j.profile as SubnetRequirementsProfile;
    },
    enabled: netuid != null,
    staleTime: 10 * 60_000,
  });
  const profile = reqQ.data ?? null;
  const requiredVram = profile?.minVramGb ?? liveSubnet?.minVramGb ?? null;
  // CPUDEPLOY-1 — the CPU Guide's own rule: minVramGb <= 0 classifies the
  // subnet as CPU-mineable. While the profile loads, the live chain value
  // (the same field the step-1 list renders) decides; unknown → GPU path.
  const isCpuSubnet = (requiredVram ?? 99) <= 0;

  // --- Step 2/3 data: offers -----------------------------------------------
  const { offers, snap: offerSnap } = useMergedGpuOffers();

  // CPUDEPLOY-1 — step-2 data for the CPU branch: live CPU VPS offers +
  // registered local machines. Both poll client-side like the GPU offers do.
  const cpuOffersQ = useCpuOffers();
  const cpuOffers = cpuOffersQ.data?.offers ?? [];
  const cpuProviderReady = (pid: string) =>
    cpuOffersQ.data?.providers
      ? Boolean(cpuOffersQ.data.providers.find((p) => p.id === pid)?.configured)
      : true;
  const localQ = useLocalHosts();
  const localHosts = localQ.hosts;
  const selectedLocalHost: LocalHostDTO | null =
    localHosts.find((h) => h.id === localHostId) ?? null;
  const cpuOffer = cpuOffers.find((o) => o.id === cpuOfferId) ?? null;
  const cpuProviderId: "hetzner" | "digitalocean" | null = cpuOffer
    ? cpuOffer.id.startsWith("hetzner")
      ? "hetzner"
      : "digitalocean"
    : null;
  const cpuPickNotConfigured =
    cpuProviderId != null && !cpuProviderReady(cpuProviderId);
  // Legacy snapshots (no providers array) default to "configured" so the hint
  // never nags when the server can't tell us.
  const runpodReady = offerSnap?.providers
    ? Boolean(offerSnap.providers.find((p) => p.id === "runpod")?.configured)
    : true;
  const vastReady = offerSnap?.providers
    ? Boolean(offerSnap.providers.find((p) => p.id === "vast")?.configured)
    : true;
  const matchingOffers = useMemo(() => {
    if (requiredVram == null) return offers;
    return offers
      .filter((o) => o.vramGb >= requiredVram)
      .sort((a, b) => a.hourlyPrice - b.hourlyPrice);
  }, [offers, requiredVram]);
  const offer: MergedGpuOffer | null = offers.find((o) => o.id === offerId) ?? null;
  const realMode: "runpod" | "vast" =
    offer?.provider && offer.provider.toLowerCase().includes("vast") ? "vast" : "runpod";
  const realConfigured = realMode === "vast" ? vastReady : runpodReady;

  // --- Hosting compliance (scraped SubnetOverride.hostingRequirements) -----
  const { data: subnetOverrides } = useSubnetOverrides();
  const selectedHosting: HostingRequirements | null =
    netuid != null
      ? ((subnetOverrides?.get(netuid)?.hosting as HostingRequirements | null) ?? null)
      : null;
  const hostingRestricted =
    selectedHosting != null &&
    (selectedHosting.bareMetalOnly ||
      selectedHosting.teeRequired ||
      selectedHosting.staticIpRequired);
  const hostingAck = hostingAckUid != null && hostingAckUid === netuid;

  // --- Step 3/4 data: the deployment record --------------------------------
  const detail = useDeploymentDetail(depId);
  const dep = detail.data ?? null;
  const tickMut = useTickDeployment();
  const regAction = useRegistrationAction();

  // CPUDEPLOY-1 — the local setup command's live lifecycle (queued → pulled
  // → done/failed), polled by the local-hosts hook every 10 s.
  const localSetupCmd =
    queuedCmdId != null
      ? selectedLocalHost?.commands.find((c) => c.id === queuedCmdId) ?? null
      : null;
  const localSetupDone = localSetupCmd?.status === "done";

  // Step 3 auto-completes into "Go live" the moment the miner is running
  // (GPU), the CPU VPS is rented (cloud), or the local setup finished (local).
  const effStep: StepN =
    step === 3 && (dep?.status === "started" || cpuProvisioned != null || localSetupDone)
      ? 4
      : step;

  // Auto-tick the lifecycle while the user watches the install.
  useEffect(() => {
    if (effStep !== 3 || !depId) return;
    if (!dep) return;
    if (dep.status === "started" || dep.status === "failed" || dep.status === "terminated") return;
    if (tickMut.isPending) return;
    const t = setTimeout(() => tickMut.mutate(depId), 2600);
    return () => clearTimeout(t);
  }, [effStep, depId, dep?.status, tickMut.isPending, tickMut.mutate]);

  // Step 4: fetch the wallet-wizard hand-off context once.
  useEffect(() => {
    if (effStep !== 4 || !depId || regCtx) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/deployments/${depId}/registration`, { cache: "no-store" });
        const j = await res.json();
        if (!cancelled && res.ok && j.wizard) setRegCtx(j.wizard as RegistrationWizardContext);
      } catch {
        /* the retry path re-fetches on next mount of step 4 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effStep, depId, regCtx]);

  const seat = liveSubnet
    ? assessSeatChance({
        minersCount: liveSubnet.minersCount,
        maxUids: liveSubnet.maxUids ?? null,
        burnCostTao: liveSubnet.burnCostTao ?? null,
        immunityBlocks: liveSubnet.immunityBlocks ?? null,
        rewardedMiners: liveSubnet.rewardedMiners ?? null,
      })
    : null;

  const createMut = useCreateDeployment();
  const handleCreate = async () => {
    if (!liveSubnet || !offer) return;
    try {
      const created = await createMut.mutateAsync({
        netuid: liveSubnet.netuid,
        offerId: offer.id,
        minerName: minerName.trim(),
        walletName: effWalletName.trim() || undefined,
        mode: realMode,
      });
      toast({
        title: "GPU rented — installing requirements",
        description: `${offer.model} for ${liveSubnet.name} (α${liveSubnet.netuid})`,
      });
      setDepId(created.id);
    } catch (e) {
      toast({
        title: "Could not rent the GPU",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const registered = dep?.registrationState === "registered";
  const restartPending = registered && dep != null && !dep.restartedAfterRegistration;
  const fullyLive = registered && dep?.restartedAfterRegistration === true;
  const hasDeployment = depId != null;

  // CPUDEPLOY-1 — cloud path: rent the CPU VPS via the same provisioner the
  // CPU Catalog uses (POST /api/cpu-provision: live offer resolution, GPU
  // refusal, SSH key injection, cloud-init base stack, staged install plan
  // in the DevOps Engine). Admin-gated server-side.
  const handleProvisionCpu = async () => {
    if (!liveSubnet || !cpuOffer || !cpuProviderId) return;
    const safeName = minerName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    try {
      const res = await fetch("/api/cpu-provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: cpuProviderId,
          offerId: cpuOffer.id,
          netuid: liveSubnet.netuid,
          walletName:
            (effWalletName.trim() || "infranex").replace(/[^a-zA-Z0-9_-]/g, "") || "infranex",
          hotkeyName: (hotkeyName.trim() || `sn${liveSubnet.netuid}miner`).replace(
            /[^a-zA-Z0-9_-]/g,
            ""
          ),
          ...(CPU_NAME_RE.test(safeName) ? { name: safeName } : {}),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setCpuProvisioned({
        installSteps: j.install?.stepCount ?? null,
        hostName: j.host?.name ?? safeName,
      });
      toast({
        title: "CPU VPS rented — base stack installing",
        description: `${cpuOffer.model} for ${liveSubnet.name} (α${liveSubnet.netuid})`,
      });
    } catch (e) {
      toast({
        title: "Could not rent the CPU box",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  // CPUDEPLOY-1 — local path: queue the repo clone + venv + dependency
  // install as ONE command on the operator's machine; the local agent
  // (DevOps → Local machines) pulls and runs it, output streams back.
  // SN67 uses the CPU Guide's researched sequence verbatim; every other CPU
  // subnet builds from its own pulled requirements profile.
  const handleLocalSetup = async () => {
    if (!liveSubnet || !selectedLocalHost) return;
    const uid = liveSubnet.netuid;
    const dir = `~/infranex/sn${uid}`;
    let cmd: string;
    if (uid === 67) {
      // Researched flagship path — mirrors the CPU Guide's deep phases with
      // the repo's ACTUAL layout (verified 2026-09-19 end-to-end): a uv
      // workspace whose packages pin python >=3.11,<3.12 strictly. The
      // verified flow: uv manages the interpreter itself — `uv python
      // install 3.11 && uv sync --python 3.11` (downloads a managed CPython
      // when the system one doesn't match; system 3.12 REFUSES the install).
      cmd =
        `mkdir -p ${dir} && cd ${dir} && (git clone https://github.com/harnyx/harnyx.git . || git pull) && ` +
        `if ! command -v uv >/dev/null 2>&1; then echo "uv required — install it: curl -LsSf https://astral.sh/uv/install.sh | sh"; exit 1; fi && ` +
        `uv python install 3.11 && uv sync --python 3.11 && echo SETUP-OK`;
    } else {
      const repo = profile?.repoUrl;
      if (!repo) {
        toast({
          title: "Requirements profile still syncing",
          description:
            "The repo profiler has not cached this subnet yet — retry in a minute.",
          variant: "destructive",
        });
        return;
      }
      const py = profile?.pythonVersion ? `python${profile.pythonVersion}` : "python3";
      const install =
        profile?.packageManager === "uv"
          ? "uv sync"
          : "(pip install -r requirements.txt 2>/dev/null || pip install -e .)";
      cmd = `mkdir -p ${dir} && cd ${dir} && (git clone ${repo} . || git pull) && ${py} -m venv .venv && . .venv/bin/activate && ${install} && echo SETUP-OK`;
    }
    try {
      const created = await localQ.queueCommand(selectedLocalHost.id, cmd, {
        netuid: uid,
        phase: "deploy-setup",
      });
      setQueuedCmdId(created.id);
      toast({
        title: `Setup queued on ${selectedLocalHost.name}`,
        description: "The local agent pulls and runs it — output streams back here.",
      });
    } catch (e) {
      toast({
        title: "Could not queue the setup",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  // CPUDEPLOY-1 — local path, step 4: the ONE burn, sent to the laptop only
  // on explicit operator action (same deliberateness contract as the CPU
  // Guide's pre-burn gate — run Validator Lab first).
  const handleLocalRegister = async () => {
    if (!liveSubnet || !selectedLocalHost) return;
    const uid = liveSubnet.netuid;
    const cmd = `btcli subnet register --netuid ${uid} --wallet.name ${
      effWalletName.trim() || "infranex"
    } --wallet.hotkey ${hotkeyName.trim() || `sn${uid}miner`}`;
    try {
      await localQ.queueCommand(selectedLocalHost.id, cmd, { netuid: uid, phase: "register" });
      toast({
        title: "Register command queued",
        description: "Burn is irreversible — watch the result in DevOps → Local machines.",
      });
    } catch (e) {
      toast({
        title: "Could not queue the register command",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  // Step-rail navigation: back to any completed step (or re-click the
  // current one — noop), never forward past progress — and never back into
  // picking once a GPU is rented.
  const canGo = (n: StepN): boolean => {
    // CPU cloud path spends real credit without a Deployment record — lock
    // the rail once rented, exactly like the GPU path does after depId.
    if (hasDeployment || cpuProvisioned != null) return false;
    if (n <= effStep) return true;
    if (n === 2) return netuid != null;
    if (n === 3)
      return netuid != null && (offerId != null || cpuOfferId != null || localHostId != null);
    return false;
  };
  const go = (n: StepN) => {
    if (canGo(n)) setStep(n);
  };

  const stepValue = (n: StepN): string => {
    if (n === 1) return liveSubnet ? `α${liveSubnet.netuid} · ${liveSubnet.name}` : "";
    if (n === 2) {
      if (offer) return `${offer.model} · $${offer.hourlyPrice.toFixed(2)}/hr`;
      if (cpuOffer)
        return `${cpuOffer.model} · ${cpuOffer.cpuCores} vCPU · $${cpuOffer.monthlyPrice.toFixed(0)}/mo`;
      if (selectedLocalHost) return `${selectedLocalHost.name} · local`;
      return "";
    }
    if (n === 3) {
      if (cpuProvisioned) return "rented";
      if (localSetupCmd)
        return localSetupDone ? "setup done" : `setup ${localSetupCmd.status}…`;
      if (!dep) return "";
      if (dep.status === "started") return "installed";
      if (dep.status === "failed") return "failed";
      return "installing…";
    }
    if (fullyLive) return `live · UID ${dep?.registeredUid ?? "?"}`;
    if (registered) return "registered";
    return "";
  };

  return (
    <Card id="deploy-panel" className="scroll-mt-4 border-primary/30 bg-card/40 shadow-sm backdrop-blur-sm">
      <CardContent className="space-y-5 p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <p className="text-eyebrow text-muted-foreground">Deploy a new miner</p>
          <p className="text-sm text-muted-foreground">
            Four steps on one page: pick a subnet → pick compute (cloud GPU/CPU or your
            laptop) → rent or start &amp; install → register &amp; connect. Your picks are
            tracked on the right.
          </p>
        </div>

        {/* Step rail */}
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Deploy steps">
          {STEPS.map((s) => {
            const reached = effStep >= s.n || (s.n === 2 && netuid != null) || (s.n === 3 && offerId != null);
            const current = effStep === s.n;
            const val = stepValue(s.n);
            const clickable = canGo(s.n);
            return (
              <li key={s.n}>
                <button
                  type="button"
                  onClick={() => go(s.n)}
                  disabled={!clickable}
                  className={cn(
                    "w-full rounded-lg border p-2.5 text-left transition-colors sm:p-3",
                    current
                      ? "border-primary/50 bg-primary/[0.07]"
                      : "border-border/60 bg-card/30",
                    clickable && !current && "hover:border-primary/30"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                        reached && s.n < effStep
                          ? "bg-success/15 text-success"
                          : current
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      {reached && s.n < effStep ? <CheckCircle2 className="h-3 w-3" /> : s.n}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        current ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[10px] text-muted-foreground" title={val || s.hint}>
                    {val || s.hint}
                  </p>
                </button>
              </li>
            );
          })}
        </ol>

        {/* Step content + picks summary */}
        <div className="grid gap-4 lg:grid-cols-[1fr_250px]">
          <div className="min-w-0 space-y-3">
            {/* ------------------------- STEP 1 — SUBNET ------------------------- */}
            {effStep === 1 && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search subnets — name, netuid or category…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                {netLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading the live chain…</span>
                  </div>
                ) : (
                  <div className="max-h-72 space-y-1.5 overflow-y-auto custom-scroll pr-1">
                    {filtered.map((s) => {
                      const seatHere = assessSeatChance({
                        minersCount: s.minersCount,
                        maxUids: s.maxUids ?? null,
                        burnCostTao: s.burnCostTao ?? null,
                        immunityBlocks: s.immunityBlocks ?? null,
                        rewardedMiners: s.rewardedMiners ?? null,
                      });
                      const selected = netuid === s.netuid;
                      return (
                        <button
                          key={s.netuid}
                          type="button"
                          onClick={() => {
                            setNetuid(s.netuid);
                            setMinerName(
                              minerName ||
                                `${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}-01`
                            );
                            // CPUDEPLOY-1 — a new subnet re-arms the compute
                            // branch (a GPU pick must not leak into a CPU
                            // subnet and vice versa).
                            setComputeKind(null);
                            setCpuOfferId(null);
                            setLocalHostId(null);
                          }}
                          className={cn(
                            "w-full rounded-lg border p-3 text-left transition-colors",
                            selected
                              ? "border-primary/50 bg-primary/[0.06]"
                              : "border-border/60 bg-card/30 hover:border-border"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="mono text-xs text-muted-foreground">α{s.netuid}</span>
                              <span className="truncate text-sm font-semibold">{s.name}</span>
                              <Badge variant="outline" className="hidden text-[9px] sm:inline-flex">
                                {s.category}
                              </Badge>
                            </div>
                            <SeatChip verdict={seatHere.verdict} headline={seatHere.headline} />
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {s.minersCount}/{s.maxUids ?? "?"} seats · min {s.minVramGb}GB VRAM ·{" "}
                            {s.rewardedMiners ?? "?"} earned last epoch
                          </p>
                        </button>
                      );
                    })}
                    {filtered.length === 0 && (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        No subnet matches “{search}”.
                      </p>
                    )}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button disabled={netuid == null} onClick={() => setStep(2)} className="gap-1.5">
                    Continue — pick compute
                  </Button>
                </div>
              </div>
            )}

            {/* ------------------------- STEP 2 — GPU ------------------------- */}
            {effStep === 2 && liveSubnet && (
              <div className="space-y-3">
                {/* Requirement strip — the old "Requirements" step, folded in */}
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-xs">
                  {reqQ.isLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      <span className="text-muted-foreground">
                        Checking what α{liveSubnet.netuid} needs…
                      </span>
                    </>
                  ) : isCpuSubnet ? (
                    <>
                      <span className="font-medium text-foreground">
                        CPU-only subnet — no GPU needed
                      </span>
                      <span className="text-muted-foreground">
                        · run it on a rented CPU VPS or on your own local machine
                        {profile ? ` · ${profile.pipPackageCount} deps to install` : ""}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-foreground">
                        Needs ≥ {requiredVram ?? "?"}GB VRAM
                      </span>
                      <span className="text-muted-foreground">
                        · recommended {profile?.recommendedGpu ?? liveSubnet.recommendedGpu}
                        {profile ? ` · ${profile.pipPackageCount} deps auto-installed` : ""}
                      </span>
                    </>
                  )}
                </div>

                {seat && seat.verdict === "burn-entry" && (
                  <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/[0.04] p-2.5 text-xs">
                    <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    <p className="text-muted-foreground">
                      <span className="font-medium text-warning">Full subnet — burn entry.</span>{" "}
                      Registration happens LAST (step 4) so the immunity clock starts only when
                      you are ready.
                    </p>
                  </div>
                )}

                {/* MECHANICS-1 — hosting-compliance gate */}
                {hostingRestricted && selectedHosting && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/[0.05] p-3 text-xs">
                    <p className="flex items-center gap-1.5 font-medium text-destructive">
                      <XCircle className="h-3.5 w-3.5 shrink-0" />
                      Hosting restriction — rented containers will be REJECTED by this subnet
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {hostingFlags(selectedHosting).map((f) => (
                        <Badge
                          key={f}
                          variant="outline"
                          className="border-destructive/40 bg-background/60 px-1.5 py-0 text-[10px] font-medium text-destructive"
                        >
                          {f}
                        </Badge>
                      ))}
                    </div>
                    {selectedHosting.notes?.length > 0 && (
                      <p className="mt-1.5 border-l-2 border-destructive/40 pl-2 text-[11px] italic text-muted-foreground">
                        &ldquo;{selectedHosting.notes[0]}&rdquo;
                      </p>
                    )}
                    <p className="mt-1.5 leading-relaxed text-muted-foreground">
                      Every offer below is a RunPod/Vast <span className="font-medium text-foreground">container</span> —
                      the subnet&apos;s validator will not accept it. The compliant path is
                      bare-metal/VM hardware with a unique static IP, connected through the
                      <span className="font-medium text-foreground"> DevOps Engine</span> (BYO host),
                      then registered here or directly on-chain.
                      {selectedHosting.bareMetalOnly &&
                        " The subnet also requires Intel TDX confidential-VM workers (sek8s) — validated topologies only."}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setHostingAckUid((v) => (v === netuid ? null : netuid))
                      }
                      className={cn(
                        "mt-2 flex w-full items-center gap-2 rounded-lg border p-2 text-left transition-colors",
                        hostingAck
                          ? "border-success/50 bg-success/[0.06]"
                          : "border-border/60 bg-card/40 hover:border-border"
                      )}
                    >
                      {hostingAck ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                      )}
                      <span className="text-muted-foreground">
                        I understand the rented container will not earn on this subnet — I will
                        connect compliant bare-metal/VM infrastructure via the DevOps Engine.
                      </span>
                    </button>
                  </div>
                )}

                {!isCpuSubnet && (
                <>
                <p className="text-xs text-muted-foreground">
                  Offers meeting the requirement, cheapest first.
                </p>
                {offer && !matchingOffers.some((o) => o.id === offer.id) && (
                  <p className="rounded-lg border border-warning/30 bg-warning/[0.04] p-2.5 text-xs text-warning">
                    The preselected {offer.model} falls short of {requiredVram}GB for this subnet —
                    pick one from the list below.
                  </p>
                )}
                <div className="max-h-56 space-y-1.5 overflow-y-auto custom-scroll pr-1">
                  {matchingOffers.map((o) => {
                    const selected = offerId === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setOfferId(o.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors",
                          selected
                            ? "border-primary/50 bg-primary/[0.06]"
                            : "border-border/60 bg-card/30 hover:border-border"
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Cpu className="h-4 w-4 shrink-0 text-primary" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {o.model}{" "}
                              <span className="font-normal text-muted-foreground">· {o.vramGb}GB</span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {o.provider} · {o.region}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {hostingRestricted && (
                            <Badge
                              variant="outline"
                              className="border-destructive/40 px-1.5 py-0 text-[9px] text-destructive"
                            >
                              container — rejected
                            </Badge>
                          )}
                          {o.live && (
                            <Badge variant="outline" className="border-success/30 text-[9px] text-success">
                              live
                            </Badge>
                          )}
                          <span className="mono tabular text-sm font-semibold text-primary">
                            ${o.hourlyPrice.toFixed(2)}/hr
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {matchingOffers.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No offer meets {requiredVram}GB — pick a smaller subnet or add provider keys
                      in the GPU catalog.
                    </p>
                  )}
                </div>

                {!realConfigured && (
                  <p className="flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {realMode === "vast"
                      ? "No Vast.ai API key yet — add it in GPU catalog → “Provider API keys”."
                      : "No RunPod API key yet — add it in GPU catalog → “Provider API keys”."}
                  </p>
                )}
                </>
                )}

                {/* CPUDEPLOY-1 — CPU subnets branch: cloud VPS or your machine */}
                {isCpuSubnet && (
                  <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => {
                          setComputeKind("cloud");
                          setLocalHostId(null);
                        }}
                        className={cn(
                          "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                          computeKind === "cloud"
                            ? "border-primary/50 bg-primary/[0.06]"
                            : "border-border/60 bg-card/30 hover:border-border"
                        )}
                      >
                        <Server className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">CPU provider</span>
                          <span className="block text-xs text-muted-foreground">
                            Rent a CPU VPS — live Hetzner / DigitalOcean offers, base stack
                            auto-installs
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setComputeKind("local");
                          setCpuOfferId(null);
                        }}
                        className={cn(
                          "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                          computeKind === "local"
                            ? "border-primary/50 bg-primary/[0.06]"
                            : "border-border/60 bg-card/30 hover:border-border"
                        )}
                      >
                        <Laptop className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">Local machine</span>
                          <span className="block text-xs text-muted-foreground">
                            Run on your laptop / home box — the local agent pulls and executes,
                            $0 infra
                          </span>
                        </span>
                      </button>
                    </div>

                    {computeKind === "cloud" && (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Live CPU offers — cheapest first. CPU-subnet rewards don’t depend on
                          box size, so a small VPS is enough.
                        </p>
                        <div className="max-h-56 space-y-1.5 overflow-y-auto custom-scroll pr-1">
                          {cpuOffers.map((o) => {
                            const selected = cpuOfferId === o.id;
                            return (
                              <button
                                key={o.id}
                                type="button"
                                onClick={() => setCpuOfferId(o.id)}
                                className={cn(
                                  "flex w-full items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors",
                                  selected
                                    ? "border-primary/50 bg-primary/[0.06]"
                                    : "border-border/60 bg-card/30 hover:border-border"
                                )}
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <Cpu className="h-4 w-4 shrink-0 text-primary" />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">
                                      {o.model}{" "}
                                      <span className="font-normal text-muted-foreground">
                                        · {o.cpuCores} vCPU · {o.ramGb}GB · {o.diskGb}GB
                                      </span>
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {o.provider} · {o.region} · {o.cpuType}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  {o.availability === "limited" && (
                                    <Badge variant="outline" className="border-warning/40 text-[9px] text-warning">
                                      limited
                                    </Badge>
                                  )}
                                  <span className="mono tabular text-sm font-semibold text-primary">
                                    ${o.monthlyPrice.toFixed(2)}/mo
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                          {cpuOffers.length === 0 && (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                              {cpuOffersQ.isLoading
                                ? "Loading live CPU offers…"
                                : "No CPU offers — connect Hetzner or DigitalOcean in the CPU catalog."}
                            </p>
                          )}
                        </div>
                        {!cpuProviderReady("hetzner") && !cpuProviderReady("digitalocean") && (
                          <p className="flex items-start gap-1.5 text-xs text-warning">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            No CPU provider key yet — add Hetzner or DigitalOcean in the CPU
                            catalog → “Provider API keys”.
                          </p>
                        )}
                      </>
                    )}

                    {computeKind === "local" && (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Machines enrolled through the DevOps Engine’s local agent — only
                          online ones accept commands.
                        </p>
                        <div className="max-h-56 space-y-1.5 overflow-y-auto custom-scroll pr-1">
                          {localHosts.map((h) => {
                            const online = h.status === "online";
                            const selected = localHostId === h.id;
                            return (
                              <button
                                key={h.id}
                                type="button"
                                disabled={!online}
                                onClick={() => setLocalHostId(h.id)}
                                className={cn(
                                  "flex w-full items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors",
                                  selected
                                    ? "border-primary/50 bg-primary/[0.06]"
                                    : "border-border/60 bg-card/30 hover:border-border",
                                  !online && "cursor-not-allowed opacity-50"
                                )}
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <Laptop className="h-4 w-4 shrink-0 text-primary" />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold">{h.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {h.specs
                                        ? `${h.specs.cores ?? "?"} cores · ${h.specs.ramGb ?? "?"}GB RAM · ${h.specs.os ?? h.specs.hostname ?? ""}`
                                        : "specs pending enrollment"}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[9px]",
                                      online
                                        ? "border-success/40 text-success"
                                        : "border-border/60 text-muted-foreground"
                                    )}
                                  >
                                    {h.status}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">
                                    {h.lastSeenAt ? formatRelativeTime(h.lastSeenAt) : "never"}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                          {localHosts.length === 0 && (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                              {localQ.isLoading
                                ? "Loading local machines…"
                                : "No local machines yet — enroll your laptop in the DevOps Engine card below (“Local machines” → Add machine)."}
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="step-miner-name" className="text-sm font-medium">
                      Miner name
                    </Label>
                    <Input
                      id="step-miner-name"
                      value={minerName}
                      onChange={(e) => setMinerName(e.target.value)}
                      placeholder="chutes-miner-01"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="step-wallet" className="text-sm font-medium">
                      Wallet name
                    </Label>
                    <Input
                      id="step-wallet"
                      value={effWalletName}
                      onChange={(e) => {
                        setWalletName(e.target.value);
                        setWalletTouched(true);
                      }}
                      placeholder="infranex"
                      className="mt-1"
                    />
                    {walletProfiles && walletProfiles.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {walletProfiles.map((w) => (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() => {
                              setWalletName(w.walletName);
                              setWalletTouched(true);
                            }}
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                              effWalletName === w.walletName
                                ? "border-primary/50 bg-primary/10 text-primary"
                                : "border-border/60 text-muted-foreground hover:border-primary/40"
                            )}
                          >
                            {w.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {isCpuSubnet && (
                  <div>
                    <Label htmlFor="step-hotkey" className="text-sm font-medium">
                      Hotkey name
                    </Label>
                    <Input
                      id="step-hotkey"
                      value={hotkeyName}
                      onChange={(e) => setHotkeyName(e.target.value)}
                      placeholder={`sn${liveSubnet.netuid}miner`}
                      className="mt-1"
                    />
                  </div>
                )}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    disabled={
                      (isCpuSubnet
                        ? computeKind === "cloud"
                          ? !cpuOfferId || cpuPickNotConfigured
                          : computeKind === "local"
                            ? !selectedLocalHost || selectedLocalHost.status !== "online"
                            : true
                        : !offerId) ||
                      (hostingRestricted && !hostingAck)
                    }
                    onClick={() => setStep(3)}
                    className="gap-1.5"
                  >
                    {hostingRestricted && !hostingAck
                      ? "Acknowledge hosting restriction to continue"
                      : "Continue — review & deploy"}
                  </Button>
                </div>
              </div>
            )}

            {/* ------------------------- STEP 3 — DEPLOY ------------------------- */}
            {effStep === 3 && (
              <div className="space-y-3">
                {!dep && cpuProvisioned ? (
                  <>
                    <div className="rounded-lg border border-success/30 bg-success/[0.05] p-4">
                      <p className="flex items-center gap-2 text-sm font-medium text-success">
                        <CheckCircle2 className="h-4 w-4" />
                        CPU VPS rented — {cpuProvisioned.hostName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        The base stack (docker, python, bittensor) is installing via cloud-init.
                        {cpuProvisioned.installSteps
                          ? ` The ${cpuProvisioned.installSteps}-step subnet install is staged below in the DevOps Engine —`
                          : " The subnet install is staged below in the DevOps Engine —"}{" "}
                        approve its wallet + launch steps there to go live. Nothing is
                        registered on-chain yet.
                      </p>
                    </div>
                  </>
                ) : !dep && localSetupCmd ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {localSetupDone ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : localSetupCmd.status === "failed" ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      )}
                      <span>
                        Setup on {selectedLocalHost?.name ?? "your machine"} —{" "}
                        {localSetupDone
                          ? "repo cloned, venv ready, deps installed"
                          : localSetupCmd.status === "failed"
                            ? "setup failed — check the output"
                            : `${localSetupCmd.status}…`}
                      </span>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                      <p className="text-eyebrow mb-2 text-muted-foreground">Agent output</p>
                      <div className="max-h-44 overflow-y-auto custom-scroll font-mono text-[11px] leading-relaxed">
                        {(localSetupCmd.output ?? "").trim() ? (
                          (localSetupCmd.output ?? "")
                            .trim()
                            .split("\n")
                            .slice(-10)
                            .map((line, i) => (
                              <p key={i} className="truncate text-muted-foreground">
                                {line}
                              </p>
                            ))
                        ) : (
                          <p className="py-3 text-center font-sans text-xs text-muted-foreground">
                            Waiting for the local agent to pull the command…
                          </p>
                        )}
                      </div>
                    </div>
                    {localSetupCmd.status === "failed" && (
                      <Button size="sm" variant="outline" onClick={handleLocalSetup}>
                        <RotateCw className="h-3.5 w-3.5" />
                        Re-queue setup
                      </Button>
                    )}
                    <p className="text-center text-xs text-muted-foreground">
                      This runs unattended — step 4 (Go live) opens by itself when the setup
                      finishes.
                    </p>
                  </>
                ) : !dep && isCpuSubnet ? (
                  <>
                    {/* CPU review & launch — cloud rents, local queues */}
                    <div className="rounded-lg border border-border/60 bg-card/40 p-3 text-sm">
                      <SummaryRow label="Subnet" value={liveSubnet ? `${liveSubnet.name} · α${liveSubnet.netuid}` : "—"} />
                      <SummaryRow
                        label="Target"
                        value={
                          computeKind === "cloud" && cpuOffer
                            ? `${cpuOffer.model} · ${cpuOffer.cpuCores} vCPU · ${cpuOffer.ramGb}GB · ${cpuOffer.provider}`
                            : computeKind === "local" && selectedLocalHost
                              ? `${selectedLocalHost.name} · your machine`
                              : "—"
                        }
                      />
                      <SummaryRow
                        label="Cost"
                        value={
                          computeKind === "cloud" && cpuOffer
                            ? `$${cpuOffer.monthlyPrice.toFixed(2)}/mo (~$${cpuOffer.hourlyPrice.toFixed(3)}/hr)`
                            : computeKind === "local"
                              ? "$0 — your hardware, your electricity"
                              : "—"
                        }
                      />
                      <SummaryRow label="Miner" value={minerName.trim() || "—"} />
                      <SummaryRow label="Wallet" value={effWalletName.trim() || "—"} />
                      <SummaryRow
                        label="Hotkey"
                        value={
                          hotkeyName.trim() || (liveSubnet ? `sn${liveSubnet.netuid}miner` : "—")
                        }
                        last
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {computeKind === "cloud"
                        ? "One click rents the box and auto-installs docker / python / bittensor via cloud-init — the subnet’s install plan is staged in the DevOps Engine below, wallet + launch steps approval-gated. Nothing registers on-chain yet."
                        : "One click queues the repo clone + venv + dependency install on your machine — the local agent pulls and runs it, and the output streams back here. Burn/registration stays a deliberate step 4."}
                    </p>
                    <div className="flex justify-end">
                      <Button
                        disabled={
                          createMut.isPending ||
                          (computeKind === "cloud" && (!cpuOffer || !cpuProviderId)) ||
                          (computeKind === "local" &&
                            (!selectedLocalHost || selectedLocalHost.status !== "online"))
                        }
                        onClick={computeKind === "cloud" ? handleProvisionCpu : handleLocalSetup}
                        className="gap-1.5"
                      >
                        {computeKind === "cloud" ? (
                          <>
                            <Rocket className="h-4 w-4" />
                            Rent &amp; deploy
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4" />
                            Start setup on laptop
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                ) : !dep ? (
                  <>
                    {/* Review & launch */}
                    <div className="rounded-lg border border-border/60 bg-card/40 p-3 text-sm">
                      <SummaryRow label="Subnet" value={liveSubnet ? `${liveSubnet.name} · α${liveSubnet.netuid}` : "—"} />
                      <SummaryRow
                        label="GPU"
                        value={offer ? `${offer.model} · ${offer.vramGb}GB · ${offer.provider}` : "—"}
                      />
                      <SummaryRow
                        label="Cost"
                        value={
                          offer
                            ? `$${offer.hourlyPrice.toFixed(2)}/hr (~${formatCurrency(offer.monthlyPrice)}/mo)`
                            : "—"
                        }
                      />
                      <SummaryRow label="Miner" value={minerName.trim() || "—"} />
                      <SummaryRow label="Wallet" value={effWalletName.trim() || "—"} last />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      One click rents the pod and starts the automatic install — the subnet&apos;s
                      real requirements are staged and the miner launches as a service. Nothing is
                      registered on-chain yet; that is step 4, on purpose.
                    </p>
                    <div className="flex justify-end">
                      <Button
                        disabled={!liveSubnet || !offer || !minerName.trim() || createMut.isPending}
                        onClick={handleCreate}
                        className="gap-1.5"
                      >
                        {createMut.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Rocket className="h-4 w-4" />
                        )}
                        Rent &amp; deploy
                      </Button>
                    </div>
                  </>
                ) : dep.status === "failed" ? (
                  <>
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.04] p-4">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <div className="text-xs">
                        <p className="font-medium text-destructive">Install failed</p>
                        <p className="mt-1 text-muted-foreground">
                          Check the log below. Retry re-runs the failed phase; nothing was
                          registered on-chain.
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => depId && tickMut.mutate(depId)}
                        >
                          Retry install
                        </Button>
                      </div>
                    </div>
                    <PipelineLog steps={dep.steps} />
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>
                        {dep.status === "provisioning"
                          ? "Renting the GPU pod…"
                          : dep.status === "setup"
                            ? `Installing requirements${
                                dep.installSteps?.length
                                  ? ` — ${dep.installSteps.filter((s) => s.status === "done").length}/${dep.installSteps.length} steps`
                                  : ""
                              }…`
                            : dep.status === "deploying"
                              ? "Launching the miner…"
                              : "Working…"}
                      </span>
                    </div>
                    <PipelineLog steps={dep.steps} />
                    <p className="text-center text-xs text-muted-foreground">
                      This runs unattended — step 4 (Go live) opens by itself when the miner is
                      running.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* ------------------------- STEP 4 — GO LIVE ------------------------- */}
            {effStep === 4 && cpuProvisioned != null && !dep && (
              <div className="space-y-3">
                <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Server className="h-4 w-4 text-primary" />
                    1 · Approve the install in the DevOps Engine
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {cpuProvisioned.hostName} is rented and its base stack is installing via
                    cloud-init. The subnet&rsquo;s staged install plan — including the wallet-file
                    and miner-launch steps — waits in the DevOps Engine card on this page. Approve
                    the gated steps there; they run over SSH on your VPS.
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                  <p className="text-sm font-medium">2 · What happens next</p>
                  <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                    <p className="flex items-start gap-1.5">
                      <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>
                        <span className="font-medium text-foreground">Validator Lab</span> — run
                        the free check on this subnet before any on-chain registration.
                      </span>
                    </p>
                    <p className="flex items-start gap-1.5">
                      <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>
                        <span className="font-medium text-foreground">Monitoring</span> — watch
                        health, earnings and drift from the cards below once the miner serves.
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {effStep === 4 && cpuProvisioned == null && !dep && selectedLocalHost && (
              <div className="space-y-3">
                {localSetupCmd && (
                  <div
                    className={cn(
                      "rounded-lg border p-3 text-xs",
                      localSetupDone
                        ? "border-success/30 bg-success/[0.05]"
                        : localSetupCmd.status === "failed"
                          ? "border-destructive/30 bg-destructive/[0.04]"
                          : "border-border/60 bg-card/40"
                    )}
                  >
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {localSetupDone ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : localSetupCmd.status === "failed" ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      )}
                      Setup on {selectedLocalHost.name} — {localSetupCmd.status}
                    </p>
                    {(localSetupCmd.output ?? "").trim() && (
                      <div className="mt-2 max-h-32 overflow-y-auto custom-scroll font-mono text-[11px] text-muted-foreground">
                        {(localSetupCmd.output ?? "")
                          .trim()
                          .split("\n")
                          .slice(-8)
                          .map((line, i) => (
                            <p key={i} className="truncate">
                              {line}
                            </p>
                          ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Flame className="h-4 w-4 text-warning" />
                    1 · Burn gate — register on-chain from your laptop
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Registration burns TAO and is irreversible — run the free Validator Lab check
                    on this subnet first and only send the register command when the gate is
                    green. The command runs on {selectedLocalHost.name} with your wallet{" "}
                    <span className="font-medium text-foreground">
                      {effWalletName.trim() || "infranex"}
                    </span>{" "}
                    + hotkey{" "}
                    <span className="font-medium text-foreground">
                      {hotkeyName.trim() || `sn${liveSubnet?.netuid ?? ""}miner`}
                    </span>
                    .
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 gap-1.5"
                    disabled={!localSetupDone || selectedLocalHost.status !== "online"}
                    onClick={handleLocalRegister}
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    Send register command to laptop
                  </Button>
                  {!localSetupDone && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Finishes the setup first — the button unlocks when the agent reports done.
                    </p>
                  )}
                </div>
                <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                  <p className="text-sm font-medium">2 · What happens next</p>
                  <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                    <p className="flex items-start gap-1.5">
                      <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>
                        <span className="font-medium text-foreground">Monitor &amp; earn</span> —
                        after registration, submit your agent per the subnet&rsquo;s own flow
                        (CPU Guide has the phases), then watch emissions in Opportunities and the
                        cards below.
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {effStep === 4 && dep && (
              <div className="space-y-3">
                {fullyLive ? (
                  <div className="rounded-lg border border-success/30 bg-success/[0.05] p-4">
                    <p className="flex items-center gap-2 text-sm font-medium text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      Live — UID {dep.registeredUid} on α{dep.netuid}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Registration block #{dep.registrationBlock ?? "?"} — the immunity countdown
                      is ticking in the deployment card below. The axon re-announced after the
                      approval restart.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <KeyRound className="h-4 w-4 text-primary" />
                      1 · Register on-chain
                      {registered ? (
                        <Badge variant="outline" className="gap-1 border-success/40 text-[10px] text-success">
                          <ShieldCheck className="h-3 w-3" />
                          UID {dep.registeredUid ?? "?"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400">
                          unregistered
                        </Badge>
                      )}
                    </p>
                    {registered && restartPending ? (
                      <>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          Registered — one approval restart left so validators can find you.
                        </p>
                        <Button
                          size="sm"
                          className="mt-2 gap-1.5"
                          disabled={regAction.isPending}
                          onClick={async () => {
                            if (!depId) return;
                            try {
                              await regAction.mutateAsync({ id: depId, action: "restart" });
                              toast({ title: "Miner restarted — axon re-announced for the new UID" });
                              qc.invalidateQueries({ queryKey: ["deployments"] });
                              qc.invalidateQueries({ queryKey: ["deployment", depId] });
                            } catch (e) {
                              toast({
                                title: "Restart failed",
                                description: e instanceof Error ? e.message : "Unknown error",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          {regAction.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCw className="h-3.5 w-3.5" />
                          )}
                          Restart miner (approval)
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          The miner is running and serving but has no on-chain seat yet. The wallet
                          wizard creates/funds the coldkey, attaches the hotkey and registers on
                          α{dep.netuid} — last on purpose, so the immunity clock starts when
                          everything already runs.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button size="sm" className="gap-1.5" onClick={() => setRegOpen(true)}>
                            <Wallet className="h-3.5 w-3.5" />
                            Open wallet wizard
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => depId && regAction.mutate({ id: depId, action: "check" })}
                          >
                            Verify on-chain now
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Server className="h-4 w-4 text-primary" />
                    2 · Connect the daemon
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    One paste on the GPU pod installs a supervised agent. It is how Validator Lab
                    pushes fixes to this miner and how health checks reach it. Copy the setup
                    command, paste it as root (or into the provider&apos;s start script), and the
                    chip turns online in about a minute.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 gap-1.5"
                    onClick={() => setDaemonOpen(true)}
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    Get setup command
                  </Button>
                </div>

                <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                  <p className="text-sm font-medium">3 · What happens next</p>
                  <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                    <p className="flex items-start gap-1.5">
                      <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>
                        <span className="font-medium text-foreground">Validator Lab</span> — run a
                        check on this subnet, then apply the recommended fixes straight to this
                        miner.
                      </span>
                    </p>
                    <p className="flex items-start gap-1.5">
                      <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>
                        <span className="font-medium text-foreground">Monitoring</span> — give it
                        15–30 minutes, then watch health, earnings and drift from the cards below.
                      </span>
                    </p>
                  </div>
                </div>

                {fullyLive && (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => {
                        setStep(1);
                        setDepId(null);
                        setRegCtx(null);
                        setNetuid(null);
                        setOfferId(null);
                        setComputeKind(null);
                        setCpuOfferId(null);
                        setLocalHostId(null);
                        setCpuProvisioned(null);
                        setQueuedCmdId(null);
                        setMinerName("");
                        setSearch("");
                      }}
                    >
                      <Rocket className="h-3.5 w-3.5" />
                      Deploy another miner
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Picks summary — always visible */}
          <aside className="space-y-2.5 rounded-lg border border-border/60 bg-background/40 p-3 lg:sticky lg:top-4 lg:self-start">
            <p className="text-eyebrow text-muted-foreground">Your picks</p>
            <PickRow label="Subnet" value={liveSubnet ? `α${liveSubnet.netuid} ${liveSubnet.name}` : null} icon={<FlaskConical className="h-3 w-3" />} />
            <PickRow
              label="Compute"
              value={
                offer
                  ? `${offer.model} · $${offer.hourlyPrice.toFixed(2)}/hr`
                  : cpuOffer
                    ? `${cpuOffer.model} · ${cpuOffer.cpuCores} vCPU`
                    : selectedLocalHost
                      ? `${selectedLocalHost.name} · local`
                      : null
              }
              icon={
                selectedLocalHost && !offer && !cpuOffer ? (
                  <Laptop className="h-3 w-3" />
                ) : (
                  <Cpu className="h-3 w-3" />
                )
              }
            />
            <PickRow
              label="Est. cost"
              value={
                offer
                  ? `~${formatCurrency(offer.monthlyPrice)}/mo`
                  : cpuOffer
                    ? `~$${cpuOffer.monthlyPrice.toFixed(0)}/mo`
                    : selectedLocalHost
                      ? "$0 — your hardware"
                      : null
              }
              icon={<Activity className="h-3 w-3" />}
            />
            <PickRow label="Miner" value={minerName.trim() || null} icon={<Server className="h-3 w-3" />} />
            <PickRow label="Wallet" value={effWalletName.trim() || null} icon={<Wallet className="h-3 w-3" />} />
            {seat && liveSubnet && (
              <div className="pt-1">
                <SeatChip verdict={seat.verdict} headline={seat.headline} />
              </div>
            )}
            {hasDeployment && (
              <>
                <Separator className="my-1" />
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  GPU rented — steps are locked while this deployment installs. Manage it from the
                  cards below once it is live.
                </p>
              </>
            )}
            {!hasDeployment && cpuProvisioned != null && (
              <>
                <Separator className="my-1" />
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  CPU VPS rented — the staged install plan waits in the DevOps Engine card below.
                  Approve the gated steps there to go live.
                </p>
              </>
            )}
            {!hasDeployment && cpuProvisioned == null && localSetupDone && selectedLocalHost && (
              <>
                <Separator className="my-1" />
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  Laptop ready — send the register command from step 4, then watch the agent under
                  DevOps → Local machines.
                </p>
              </>
            )}
          </aside>
        </div>
      </CardContent>

      {/* Wallet & registration wizard, bound to THIS deployment */}
      <WalletRegistrationDialog
        open={regOpen}
        onOpenChange={setRegOpen}
        journey={null}
        minerDeployed
        deployment={regCtx}
        onLinked={() => {
          qc.invalidateQueries({ queryKey: ["deployments"] });
          qc.invalidateQueries({ queryKey: ["deployment", depId] });
        }}
      />

      {/* Daemon setup command, bound to THIS deployment */}
      <DaemonInstallDialog
        deploymentId={depId ?? ""}
        minerName={dep?.minerName ?? minerName ?? "miner"}
        open={daemonOpen}
        onOpenChange={setDaemonOpen}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------

function SummaryRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1.5", !last && "border-b border-border/40")}>
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="truncate text-right text-xs font-medium">{value}</span>
    </div>
  );
}

function PickRow({ label, value, icon }: { label: string; value: string | null; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={cn("truncate font-medium", value ? "text-foreground" : "text-muted-foreground/50")}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function SeatChip({ verdict, headline }: { verdict: string; headline: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    open: { cls: "border-success/40 text-success", icon: <Unlock className="h-3 w-3" />, label: "seats open" },
    "burn-entry": { cls: "border-warning/40 text-warning", icon: <Flame className="h-3 w-3" />, label: "burn entry" },
    waitlist: { cls: "text-muted-foreground", icon: <Hourglass className="h-3 w-3" />, label: "waitlist" },
    unknown: { cls: "text-muted-foreground", icon: <Hourglass className="h-3 w-3" />, label: "unknown" },
  };
  const m = map[verdict] ?? map.unknown;
  return (
    <Badge variant="outline" className={cn("shrink-0 gap-1 text-[9px]", m.cls)} title={headline}>
      {m.icon}
      {m.label}
    </Badge>
  );
}

function PipelineLog({ steps }: { steps: DeploymentStep[] }) {
  const visible = steps.filter((s) => s.status !== "pending");
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3">
      <p className="text-eyebrow mb-2 text-muted-foreground">Live install log</p>
      <div className="max-h-56 space-y-2 overflow-y-auto custom-scroll pr-1 font-mono text-[11px]">
        {visible.map((s) => (
          <div key={s.name}>
            <p
              className={cn(
                "flex items-center gap-1.5 font-sans text-xs font-semibold",
                s.status === "done"
                  ? "text-success"
                  : s.status === "failed"
                    ? "text-destructive"
                    : "text-foreground"
              )}
            >
              {s.status === "done" ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : s.status === "failed" ? (
                <XCircle className="h-3 w-3" />
              ) : (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              {s.label}
            </p>
            {s.output.slice(-4).map((line, i) => (
              <p key={i} className="ml-4 truncate text-muted-foreground">
                {line}
              </p>
            ))}
          </div>
        ))}
        {visible.length === 0 && (
          <p className="py-4 text-center font-sans text-xs text-muted-foreground">
            Waiting for the pipeline to start…
          </p>
        )}
      </div>
    </div>
  );
}
