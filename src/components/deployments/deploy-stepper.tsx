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
import { cn, formatCurrency } from "@/lib/utils";
import { useNetwork, mergeSubnets } from "@/lib/infranex/use-network";
import { useMergedGpuOffers, type MergedGpuOffer } from "@/lib/infranex/use-gpu-offers";
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
import type { SubnetRequirementsProfile } from "@/lib/devops/subnet-requirements";
import { useToast } from "@/hooks/use-toast";

/**
 * Deploy Stepper — the deployment page's ONE deploy flow, on a single page,
 * no dialog. Four steps, always visible at the top of the page:
 *
 *   1. Subnet  — where to mine (live chain list + seat verdicts)
 *   2. GPU     — what to rent (requirement auto-checked, offers filtered)
 *   3. Deploy  — one button rents the GPU; requirements install automatically
 *   4. Go live — register on-chain (wallet wizard) + connect the daemon
 *
 * Replaces the old 5-step dialog (requirements folded into the GPU step,
 * review merged into the deploy step, registration + daemon combined into
 * "Go live"). The step rail shows each step's picked value at a glance and
 * lets the operator jump back to any completed step.
 */

const STEPS = [
  { n: 1, label: "Subnet", hint: "Where to mine" },
  { n: 2, label: "GPU", hint: "What to rent" },
  { n: 3, label: "Deploy", hint: "Rent & auto-install" },
  { n: 4, label: "Go live", hint: "Register & connect" },
] as const;

type StepN = 1 | 2 | 3 | 4;

export function DeployStepper() {
  const [step, setStep] = useState<StepN>(1);
  const [netuid, setNetuid] = useState<number | null>(null);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [minerName, setMinerName] = useState("");
  const [walletName, setWalletName] = useState("infranex");
  const [search, setSearch] = useState("");
  const [depId, setDepId] = useState<string | null>(null);
  const [regCtx, setRegCtx] = useState<RegistrationWizardContext | null>(null);
  const [regOpen, setRegOpen] = useState(false);
  const [daemonOpen, setDaemonOpen] = useState(false);
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

  // --- Step 2/3 data: offers -----------------------------------------------
  const { offers, snap: offerSnap } = useMergedGpuOffers();
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

  // --- Step 3/4 data: the deployment record --------------------------------
  const detail = useDeploymentDetail(depId);
  const dep = detail.data ?? null;
  const tickMut = useTickDeployment();
  const regAction = useRegistrationAction();

  // Step 3 auto-completes into "Go live" the moment the miner is running.
  const effStep: StepN = step === 3 && dep?.status === "started" ? 4 : step;

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

  // Step-rail navigation: back to any completed step (or re-click the
  // current one — noop), never forward past progress — and never back into
  // picking once a GPU is rented.
  const canGo = (n: StepN): boolean => {
    if (hasDeployment) return false;
    if (n <= effStep) return true;
    if (n === 2) return netuid != null;
    if (n === 3) return netuid != null && offerId != null;
    return false;
  };
  const go = (n: StepN) => {
    if (canGo(n)) setStep(n);
  };

  const stepValue = (n: StepN): string => {
    if (n === 1) return liveSubnet ? `α${liveSubnet.netuid} · ${liveSubnet.name}` : "";
    if (n === 2) return offer ? `${offer.model} · $${offer.hourlyPrice.toFixed(2)}/hr` : "";
    if (n === 3) {
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
            Four steps on one page: pick a subnet → pick a GPU → rent &amp; auto-install →
            register &amp; connect. Your picks are tracked on the right.
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
                    Continue — pick a GPU
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

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button disabled={!offerId} onClick={() => setStep(3)} className="gap-1.5">
                    Continue — review &amp; deploy
                  </Button>
                </div>
              </div>
            )}

            {/* ------------------------- STEP 3 — DEPLOY ------------------------- */}
            {effStep === 3 && (
              <div className="space-y-3">
                {!dep ? (
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
                    One paste on the GPU pod installs a supervised agent. It is how Judge Lab
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
                        <span className="font-medium text-foreground">Judge Lab</span> — run a
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
              label="GPU"
              value={offer ? `${offer.model} · $${offer.hourlyPrice.toFixed(2)}/hr` : null}
              icon={<Cpu className="h-3 w-3" />}
            />
            <PickRow
              label="Est. cost"
              value={offer ? `~${formatCurrency(offer.monthlyPrice)}/mo` : null}
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
