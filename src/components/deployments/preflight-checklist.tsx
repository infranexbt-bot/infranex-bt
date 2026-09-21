"use client";

// ---------------------------------------------------------------------------
// PREFLIGHT-1 — the two-gate pre-flight checklist for the Deployments page.
//
// The operator asked for an explicit gated workflow BEFORE the 4-step deploy
// panel:
//   Gate 1 — connect the local laptop (WSL2 on Windows)  → GREEN when the
//            agent is enrolled and heartbeating (status "online").
//   Gate 2 — wallet cold key + hot key                   → GREEN when a
//            wallet profile exists (names stored; public SS58 addresses
//            pasted/validated). Secrets are NEVER stored here — the API
//            hard-rejects mnemonics/seeds and so does this form.
// Both gates green → hand off to the existing deploy stepper (subnet →
// compute → deploy → go live). `onHandoff` carries the first online host id
// so the stepper can preselect the laptop in its Compute step.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useLocalHosts,
  type LocalHostDTO,
} from "@/lib/infranex/use-local-hosts";
import {
  useCreateWallet,
  useUpdateWallet,
  useWallets,
  type WalletProfile,
} from "@/lib/infranex/use-platform";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Laptop,
  Loader2,
  Plus,
  ShieldCheck,
  Terminal,
  Trash2,
} from "lucide-react";

// Same SS58 shape the rest of the app validates with (deployments-view,
// runway.ts, wallet-registration.ts): 5 + 47 base58 chars.
const SS58_RE = /^5[1-9A-HJ-NP-Za-km-z]{47}$/;
// Mirrors the wallets API NAME_RE — walletName/hotkeyName must match it.
const WALLET_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // clipboard unavailable — the text stays selectable
        }
      }}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}

function GateChip({ green, loading }: { green: boolean; loading: boolean }) {
  if (loading)
    return (
      <Badge variant="outline" className="gap-1 border-border/60 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> checking…
      </Badge>
    );
  return green ? (
    <Badge variant="outline" className="gap-1 border-success/40 bg-success/10 text-success">
      <CheckCircle2 className="h-3 w-3" /> GREEN
    </Badge>
  ) : (
    <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
      PENDING
    </Badge>
  );
}

function hostSpecLine(h: LocalHostDTO): string {
  if (!h.specs) return "specs pending enrollment";
  const bits = [
    h.specs.cores != null ? `${h.specs.cores} cores` : null,
    h.specs.ramGb != null ? `${h.specs.ramGb}GB RAM` : null,
    h.specs.os ?? h.specs.hostname ?? null,
  ].filter(Boolean);
  return bits.length ? bits.join(" · ") : "specs pending enrollment";
}

function hostStatusChip(h: LocalHostDTO): { label: string; cls: string } {
  if (h.status === "online")
    return { label: "online", cls: "border-success/40 bg-success/10 text-success" };
  if (h.status === "pending")
    return { label: "awaiting enroll", cls: "border-warning/40 bg-warning/10 text-warning" };
  if (h.status === "revoked")
    return { label: "revoked", cls: "border-border/60 bg-muted/40 text-muted-foreground" };
  return {
    label: h.lastSeenAt ? `offline · seen ${formatRelativeTime(h.lastSeenAt)}` : "offline",
    cls: "border-border/60 bg-muted/40 text-muted-foreground",
  };
}

export function PreflightChecklist({
  onHandoff,
}: {
  onHandoff: (onlineHostId: string | null) => void;
}) {
  const { toast } = useToast();
  const {
    hosts,
    isLoading: hostsLoading,
    createEnrollment,
    revoke,
  } = useLocalHosts();
  const { data: wallets, isLoading: walletsLoading } = useWallets();
  const createWallet = useCreateWallet();
  const updateWallet = useUpdateWallet();

  // --- Gate 1 state ---------------------------------------------------------
  const [machineName, setMachineName] = useState("");
  const [creating, setCreating] = useState(false);
  const [enroll, setEnroll] = useState<{ name: string; cmd: string } | null>(null);
  const [open1, setOpen1] = useState(false);

  // --- Gate 2 state ---------------------------------------------------------
  const [open2, setOpen2] = useState(false);
  const [showKeygen, setShowKeygen] = useState(false);
  const [label, setLabel] = useState("");
  const [walletName, setWalletName] = useState("");
  const [hotkeyName, setHotkeyName] = useState("");
  const [coldAddress, setColdAddress] = useState("");
  const [hotAddress, setHotAddress] = useState("");
  const [walletErr, setWalletErr] = useState<string | null>(null);

  // --- Derived gate states ---------------------------------------------------
  const onlineHosts = useMemo(
    () => hosts.filter((h) => h.status === "online"),
    [hosts]
  );
  const gate1Green = onlineHosts.length > 0;

  const readyWallet = useMemo<WalletProfile | null>(
    () =>
      wallets?.find((w) => w.walletName?.trim() && w.hotkeyName?.trim()) ?? null,
    [wallets]
  );
  const gate2Green = readyWallet != null;
  const bothGreen = gate1Green && gate2Green;

  const coldOk = coldAddress.trim() === "" || SS58_RE.test(coldAddress.trim());
  const hotOk = hotAddress.trim() === "" || SS58_RE.test(hotAddress.trim());
  const walletFormOk =
    label.trim().length > 0 &&
    label.trim().length <= 80 &&
    WALLET_NAME_RE.test(walletName.trim()) &&
    WALLET_NAME_RE.test(hotkeyName.trim()) &&
    coldOk &&
    hotOk;

  const keygenCmd = `btcli wallet new_coldkey --wallet.name ${walletName.trim() || "infranex"} && btcli wallet new_hotkey --wallet.name ${walletName.trim() || "infranex"} --wallet.hotkey ${hotkeyName.trim() || "default"}`;

  // --- Actions ---------------------------------------------------------------
  const addLaptop = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const origin = window.location.origin;
      const j = await createEnrollment(machineName.trim() || "my-laptop");
      setEnroll({
        name: j.host.name,
        cmd: `curl -fsSL ${origin}/api/agent/agent.py -o /tmp/infranex-agent.py && python3 /tmp/infranex-agent.py enroll --server ${origin} --token ${j.enrollToken}`,
      });
      setMachineName("");
    } catch (e) {
      toast({
        title: "Could not create enrollment",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const saveWallet = async () => {
    setWalletErr(null);
    try {
      await createWallet.mutateAsync({
        label: label.trim(),
        walletName: walletName.trim(),
        hotkeyName: hotkeyName.trim(),
        coldAddress: coldAddress.trim() || undefined,
        hotAddress: hotAddress.trim() || undefined,
      });
      setLabel("");
      setWalletName("");
      setHotkeyName("");
      setColdAddress("");
      setHotAddress("");
      setShowKeygen(false);
      toast({
        title: "Wallet profile saved",
        description: "Gate 2 is green — continue to the deploy panel below.",
      });
    } catch (e) {
      setWalletErr(e instanceof Error ? e.message : "Unknown error");
    }
  };

  return (
    <Card className="border-primary/20 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span>
              Pre-flight — two gates before you deploy
              <span className="ml-2 font-normal text-muted-foreground">
                finish both, then the 4-step panel below takes over
              </span>
            </span>
          </span>
          <span className="mono text-[10px] font-normal text-muted-foreground">
            {hostsLoading || walletsLoading
              ? "checking…"
              : `${gate1Green ? 1 : 0}/2 · ${gate2Green ? 1 : 0}/2 gates green`}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* ================= GATE 1 — LOCAL MACHINE ============================ */}
        <div
          className={cn(
            "rounded-lg border p-4 transition-colors",
            gate1Green
              ? "border-success/30 bg-success/[0.04]"
              : "border-border/60 bg-card/30"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
                  gate1Green
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-border text-muted-foreground"
                )}
              >
                1
              </span>
              <div>
                <p className="text-sm font-semibold">Connect your local laptop</p>
                <p className="text-xs text-muted-foreground">
                  WSL2 on Windows (or Linux) → run the one-time enroll command → agent
                  pulls work; no inbound ports.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GateChip green={gate1Green} loading={hostsLoading} />
              {gate1Green && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setOpen1((v) => !v)}
                >
                  {open1 ? "Hide machines" : "Manage machines"}
                </Button>
              )}
            </div>
          </div>

          {gate1Green && !open1 && (
            <p className="mt-2 text-xs text-success">
              {onlineHosts.length} machine{onlineHosts.length > 1 ? "s" : ""} online —{" "}
              {onlineHosts
                .map((h) => h.name)
                .join(", ")}{" "}
              will be preselected in the Compute step for CPU subnets.
            </p>
          )}

          {(!gate1Green || open1) && (
            <div className="mt-3 space-y-3">
              <div className="flex gap-2">
                <Input
                  value={machineName}
                  onChange={(e) => setMachineName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !creating) void addLaptop();
                  }}
                  placeholder="Machine name (e.g. hp-ultra5-laptop)"
                  className="h-9 bg-background/60 text-sm"
                  aria-label="Machine name"
                />
                <Button
                  size="sm"
                  className="h-9 gap-1.5"
                  disabled={creating}
                  onClick={() => void addLaptop()}
                >
                  {creating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Add laptop
                </Button>
              </div>

              {enroll && (
                <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/[0.06] p-3">
                  <p className="text-xs font-medium">
                    On <span className="font-semibold">{enroll.name}</span> — open
                    Ubuntu (WSL2) and paste this, then start the agent:
                  </p>
                  <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
                    <code className="mono min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all text-xs">
                      {enroll.cmd}
                    </code>
                    <CopyButton text={enroll.cmd} label="Copy enroll command" />
                  </div>
                  <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
                    <code className="mono min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all text-xs">
                      python3 /tmp/infranex-agent.py run
                    </code>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Windows first? In PowerShell run{" "}
                    <code className="mono">wsl --install -d Ubuntu</code>, reopen, then
                    paste. Keep the agent alive with{" "}
                    <code className="mono">tmux</code> or{" "}
                    <code className="mono">
                      nohup python3 /tmp/infranex-agent.py run &amp;
                    </code>
                    . The token works once and expires in 30 minutes — this panel flips
                    to GREEN automatically.
                  </p>
                </div>
              )}

              {hosts.length > 0 && (
                <div className="max-h-44 space-y-1.5 overflow-y-auto custom-scroll pr-1">
                  {hosts.map((h) => {
                    const chip = hostStatusChip(h);
                    const stalePending =
                      h.status === "pending" &&
                      h.enrollExpiresAt != null &&
                      new Date(h.enrollExpiresAt).getTime() < Date.now();
                    return (
                      <div
                        key={h.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-card/20 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Laptop className="h-4 w-4 shrink-0 text-primary" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{h.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {hostSpecLine(h)}
                              {stalePending ? " · token expired — revoke and re-add" : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="outline" className={cn("text-[9px]", chip.cls)}>
                            {chip.label}
                          </Badge>
                          {h.status === "pending" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                              title="Revoke this placeholder"
                              onClick={() => void revoke(h.id).catch(() => undefined)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ================= GATE 2 — WALLET KEYS ============================== */}
        <div
          className={cn(
            "rounded-lg border p-4 transition-colors",
            gate2Green
              ? "border-success/30 bg-success/[0.04]"
              : "border-border/60 bg-card/30"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
                  gate2Green
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-border text-muted-foreground"
                )}
              >
                2
              </span>
              <div>
                <p className="text-sm font-semibold">Wallet — cold key + hot key</p>
                <p className="text-xs text-muted-foreground">
                  Create the pair with btcli, then register the wallet name, hotkey name
                  and public SS58 addresses here. Never paste mnemonics or seeds.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GateChip green={gate2Green} loading={walletsLoading} />
              {gate2Green && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setOpen2((v) => !v)}
                >
                  {open2 ? "Hide wallets" : "Manage wallets"}
                </Button>
              )}
            </div>
          </div>

          {gate2Green && !open2 && (
            <p className="mt-2 text-xs text-success">
              Profile “{readyWallet.label}” ready — cold{" "}
              {readyWallet.coldAddress ? (
                <span className="mono">
                  {readyWallet.coldAddress.slice(0, 6)}…{readyWallet.coldAddress.slice(-4)}
                </span>
              ) : (
                "address not pasted (optional)"
              )}{" "}
              · hot{" "}
              {readyWallet.hotAddress ? (
                <span className="mono">
                  {readyWallet.hotAddress.slice(0, 6)}…{readyWallet.hotAddress.slice(-4)}
                </span>
              ) : (
                "address not pasted (optional)"
              )}
              . The deploy panel prefills this profile automatically.
            </p>
          )}

          {(!gate2Green || open2) && (
            <div className="mt-3 space-y-3">
              {/* existing profiles */}
              {wallets && wallets.length > 0 && (
                <div className="max-h-32 space-y-1.5 overflow-y-auto custom-scroll pr-1">
                  {wallets.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-card/20 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {w.label}
                          {w.isDefault ? (
                            <Badge
                              variant="outline"
                              className="ml-2 border-success/40 bg-success/10 text-[9px] text-success"
                            >
                              default
                            </Badge>
                          ) : null}
                        </p>
                        <p className="mono truncate text-xs text-muted-foreground">
                          wallet “{w.walletName}” · hotkey “{w.hotkeyName}”
                          {w.coldAddress ? ` · ${w.coldAddress.slice(0, 8)}…` : ""}
                        </p>
                      </div>
                      {!w.isDefault && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 text-xs"
                          disabled={updateWallet.isPending}
                          onClick={() =>
                            updateWallet.mutate(
                              { id: w.id, isDefault: true },
                              {
                                onSuccess: () =>
                                  toast({
                                    title: "Default wallet set",
                                    description: `“${w.label}” now prefills the deploy panel.`,
                                  }),
                              }
                            )
                          }
                        >
                          Make default
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* keygen helper */}
              <button
                type="button"
                onClick={() => setShowKeygen((v) => !v)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                aria-expanded={showKeygen}
              >
                <Terminal className="h-3.5 w-3.5" />
                {showKeygen ? "Hide" : "Show"} btcli key-creation commands
              </button>
              {showKeygen && (
                <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
                  <code className="mono min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all text-xs">
                    {keygenCmd}
                  </code>
                  <CopyButton text={keygenCmd} label="Copy keygen commands" />
                </div>
              )}

              {/* create form */}
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Profile label (e.g. main-mining-wallet)"
                  className="h-9 bg-background/60 text-sm"
                  aria-label="Wallet profile label"
                />
                <Input
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  placeholder="Wallet name (btcli --wallet.name)"
                  className="h-9 bg-background/60 text-sm"
                  aria-label="Wallet name"
                />
                <Input
                  value={hotkeyName}
                  onChange={(e) => setHotkeyName(e.target.value)}
                  placeholder="Hotkey name (btcli --wallet.hotkey)"
                  className="h-9 bg-background/60 text-sm"
                  aria-label="Hotkey name"
                />
                <div className="contents" />
                <Input
                  value={coldAddress}
                  onChange={(e) => setColdAddress(e.target.value)}
                  placeholder="Coldkey public address (ss58, starts with 5…) — optional"
                  className={cn(
                    "h-9 bg-background/60 font-mono text-xs",
                    !coldOk && "border-destructive/60"
                  )}
                  aria-label="Coldkey public address"
                />
                <Input
                  value={hotAddress}
                  onChange={(e) => setHotAddress(e.target.value)}
                  placeholder="Hotkey public address (ss58, starts with 5…) — optional"
                  className={cn(
                    "h-9 bg-background/60 font-mono text-xs",
                    !hotOk && "border-destructive/60"
                  )}
                  aria-label="Hotkey public address"
                />
              </div>
              {(!coldOk || !hotOk) && (
                <p className="text-xs text-destructive">
                  Addresses must be valid SS58 (48 characters, starting with 5). Leave
                  blank if you don’t know them yet — you can paste them anytime.
                </p>
              )}
              {walletErr && <p className="text-xs text-destructive">{walletErr}</p>}
              <p className="text-[11px] text-muted-foreground">
                <KeyRound className="mr-1 inline h-3 w-3" />
                Only names + public addresses are stored. Mnemonics, seeds and private
                keys are rejected by the platform by design — they stay on your machine.
              </p>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={!walletFormOk || createWallet.isPending}
                onClick={() => void saveWallet()}
              >
                {createWallet.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <KeyRound className="h-3.5 w-3.5" />
                )}
                Save wallet profile
              </Button>
            </div>
          )}
        </div>

        {/* ================= HAND-OFF ========================================== */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/30 p-3">
          <p className="text-xs text-muted-foreground">
            {bothGreen
              ? "Both gates green. The 4-step panel takes over: Subnet → Compute (your laptop preselected for CPU subnets) → Deploy → Go live."
              : "Complete both gates to unlock the deploy panel hand-off. Registration burn happens only when you click register in step 4."}
          </p>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!bothGreen}
            title={
              bothGreen
                ? "Jump to the 4-step deploy panel"
                : "Finish gate 1 (machine online) and gate 2 (wallet profile) first"
            }
            onClick={() => onHandoff(onlineHosts[0]?.id ?? null)}
          >
            Continue to deploy panel
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
