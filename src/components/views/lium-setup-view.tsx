"use client";

// ---------------------------------------------------------------------------
// LIUM SETUP VIEW — the complete SN51 provider onboarding path, in-app.
//
// Answers the operator question the Host & Earn module deliberately leaves
// out: HOW do I actually get from a bare GPU to a listed, earning node on
// lium.io? Seven phases — rail decision, host prep (OS/driver/Docker/Sysbox),
// wallet (coldkey/hotkey + SN51 registration), portal setup, node install,
// pricing/idle-pay eligibility, day-2 operations — every command transcribed
// from the official docs (docs.lium.io, checked 2026-10-25).
//
// Interactions:
//   · Path toggle (Path A USDT vs Path B alpha) — hides steps that don't apply
//   · Per-step done checkboxes, persisted to localStorage (lium-setup-progress-v1)
//   · Copyable command blocks
//   · Progress bar + reset
// Data + links live in lib/infranex/lium-setup.ts.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  ExternalLink,
  ListChecks,
  Lock,
  MonitorSmartphone,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Terminal,
  Wallet,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { ViewKey } from "@/lib/infranex/types";
import { cn } from "@/lib/utils";
import {
  buildHostScript,
  buildWorkstationScript,
  HOST_FILENAME,
  sanitizeName,
  WORKSTATION_FILENAME,
} from "@/lib/infranex/lium-bootstrap";
import {
  LIUM_SETUP_MEASURED_AT,
  PAYOUT_PATHS,
  REQUIREMENTS,
  SETUP_LINKS,
  SETUP_PHASES,
  loadProgress,
  saveProgress,
  type PayoutPath,
  type SetupPhase,
  type SetupStep,
} from "@/lib/infranex/lium-setup";

const PATH_STORAGE_KEY = "lium-setup-path-v1";

// --- Copyable command block (same pattern as cpu-guide-view) ------------------

function CopyCmd({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — text remains selectable */
    }
  };
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
      <code className="mono min-w-0 flex-1 overflow-x-auto whitespace-pre text-xs text-foreground/90">
        {cmd}
      </code>
      <button
        onClick={copy}
        aria-label="Copy command"
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

function DocLink({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
    >
      {label}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

// --- Automation: config + generated bootstrap scripts --------------------------

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/x-shellscript" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function CopyScriptButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={copy}>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

function ScriptToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border/50 bg-card/30 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-semibold leading-snug">{label}</p>
        {hint && <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

const AUTOMATES: string[] = [
  "OS, kernel, driver, Docker and Sysbox — each checked, installed only if missing, safe to re-run after the driver reboot",
  "The GPU-inside-Sysbox proof (the exact check validators run) and mixed-GPU-model detection",
  "Firewall ports (8080, 2200, renting range) and the RAM/disk vs idle-pay bar math",
  "btcli in an isolated venv, coldkey/hotkey creation, and the SN51 register command with its live-fee gate",
  "The mine.sh node install — or the portal-issued command you paste in",
];

const STAYS_MANUAL: { title: string; why: string }[] = [
  {
    title: "Your portal identity",
    why: "Signup / signature login proves you are you — a script can't be you. Takes a minute at provider.lium.io.",
  },
  {
    title: "Funding and the registration burn",
    why: "Real TAO leaves your wallet. The workstation script stops and asks before registering.",
  },
  {
    title: "Discord connect",
    why: "The identity link that unlocks idle pay — one click in Profile, by design.",
  },
  {
    title: "Price and tier choices",
    why: "Business decisions (soft limit vs market ask, Secure vs Spot). The numbers live in Host & Earn.",
  },
  {
    title: "Running the script itself",
    why: "A browser tab cannot reach into your GPU box. Download the file, then:  bash lium-gpu-host-setup.sh",
  },
];

function AutomateCard({ path }: { path: PayoutPath }) {
  const [walletName, setWalletName] = useState("lium-provider");
  const [hotkeyName, setHotkeyName] = useState("gpu-node-1");
  const [protectColdkey, setProtectColdkey] = useState(true);
  const [driverInstalled, setDriverInstalled] = useState(false);
  const [hgxBoard, setHgxBoard] = useState(false);
  const [openUfw, setOpenUfw] = useState(true);
  const [portalCmd, setPortalCmd] = useState("");
  const [showScript, setShowScript] = useState(false);

  const hostScript = useMemo(
    () =>
      buildHostScript({
        path,
        driverInstalled,
        hgxBoard,
        openUfw,
        portalCommand: portalCmd,
      }),
    [path, driverInstalled, hgxBoard, openUfw, portalCmd]
  );

  const workstationScript = useMemo(
    () =>
      buildWorkstationScript({
        walletName: sanitizeName(walletName, "lium-provider"),
        hotkeyName: sanitizeName(hotkeyName, "gpu-node-1"),
        protectColdkey,
      }),
    [walletName, hotkeyName, protectColdkey]
  );

  return (
    <Card className="glass border-primary/25">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="h-4 w-4 text-primary" />
          Yes — the terminal steps are one script
        </CardTitle>
        <CardDescription>
          Everything terminal-side is automatable. Configure once, download, run on the machine —
          the script detects what is already done, installs what isn&apos;t, and stops where a
          human judgment is required. Money and identity steps keep an explicit y/N gate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Config */}
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <ScriptToggle
              label="NVIDIA driver already installed"
              hint="Off = the script installs nvidia-driver-570 and pauses for a reboot"
              checked={driverInstalled}
              onChange={setDriverInstalled}
            />
            <ScriptToggle
              label="HGX board (H100/H200 SXM)"
              hint="Enables NVIDIA Fabric Manager before listing"
              checked={hgxBoard}
              onChange={setHgxBoard}
            />
            <ScriptToggle
              label="Open ufw ports"
              hint="8080, 2200, renting range 20000-20100. Cloud security groups stay manual."
              checked={openUfw}
              onChange={setOpenUfw}
            />
          </div>
          <div className="space-y-2">
            {path === "alpha" ? (
              <>
                <ScriptToggle
                  label="Password-protect the coldkey"
                  hint="On = btcli prompts for a password. Off adds --no-use-password for unattended runs."
                  checked={protectColdkey}
                  onChange={setProtectColdkey}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-eyebrow text-muted-foreground/70" htmlFor="bs-wallet">
                      Wallet name
                    </label>
                    <Input
                      id="bs-wallet"
                      value={walletName}
                      onChange={(e) => setWalletName(e.target.value)}
                      className="mono mt-1 h-8 text-xs"
                      spellCheck={false}
                    />
                  </div>
                  <div>
                    <label className="text-eyebrow text-muted-foreground/70" htmlFor="bs-hotkey">
                      Hotkey name
                    </label>
                    <Input
                      id="bs-hotkey"
                      value={hotkeyName}
                      onChange={(e) => setHotkeyName(e.target.value)}
                      className="mono mt-1 h-8 text-xs"
                      spellCheck={false}
                    />
                  </div>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  The wallet script runs on your <span className="font-semibold text-foreground">workstation</span> —
                  coldkeys never live on the renter-reachable GPU host. It refuses to run where
                  nvidia-smi exists.
                </p>
              </>
            ) : (
              <div className="rounded-xl border border-border/50 bg-card/30 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                Path A needs no wallet work — no btcli, no keys, no registration fee. The host
                script covers the whole automated path; portal signup pays USDT.
              </div>
            )}
            <div>
              <label className="text-eyebrow text-muted-foreground/70" htmlFor="bs-portal">
                Portal-issued install command (optional)
              </label>
              <Input
                id="bs-portal"
                value={portalCmd}
                onChange={(e) => setPortalCmd(e.target.value)}
                placeholder="curl -fsSL https://lium.io/mine.sh | bash -s -- --register"
                className="mono mt-1 h-8 text-xs"
                spellCheck={false}
              />
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Paste the exact command from the portal&apos;s Add Node dialog — it encodes your
                account. Left empty, the docs&apos; generic command is used.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="gap-1.5" onClick={() => downloadText(HOST_FILENAME, hostScript)}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download {HOST_FILENAME}
          </Button>
          <CopyScriptButton text={hostScript} label="Copy host script" />
          {path === "alpha" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => downloadText(WORKSTATION_FILENAME, workstationScript)}
            >
              <MonitorSmartphone className="h-3.5 w-3.5" aria-hidden="true" />
              Download {WORKSTATION_FILENAME}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowScript((s) => !s)}>
            {showScript ? "Hide preview" : "Preview script"}
          </Button>
        </div>

        {/* Preview */}
        {showScript && (
          <pre className="mono max-h-80 overflow-auto rounded-xl border border-border/50 bg-muted/30 p-3 text-[10.5px] leading-relaxed text-foreground/85">
            {path === "alpha" ? workstationScript : hostScript}
          </pre>
        )}

        {/* Boundary: what automation covers vs what stays human */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-success/20 bg-success/5 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-success">
              <Terminal className="h-3 w-3" aria-hidden="true" />
              What the scripts automate
            </p>
            <ul className="mt-1.5 space-y-1">
              {AUTOMATES.map((x) => (
                <li key={x} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden="true" />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-warning/25 bg-warning/5 p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
              <Lock className="h-3 w-3" aria-hidden="true" />
              What stays manual — on purpose
            </p>
            <ul className="mt-1.5 space-y-1">
              {STAYS_MANUAL.map((x) => (
                <li key={x.title} className="text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground/85">{x.title}</span> — {x.why}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Step card -----------------------------------------------------------------

function StepCard({
  step,
  done,
  onToggle,
}: {
  step: SetupStep;
  done: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        done ? "border-success/30 bg-success/5" : "border-border/50 bg-card/30"
      )}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          aria-label={done ? "Mark step not done" : "Mark step done"}
          className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          {done ? (
            <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
          ) : (
            <Circle className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn("text-sm font-semibold", done && "text-muted-foreground line-through")}>
              {step.title}
            </p>
            {step.applies !== "both" && (
              <Badge
                variant="outline"
                className={cn(
                  "px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide",
                  step.applies === "alpha"
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : "border-success/40 bg-success/10 text-success"
                )}
              >
                {step.applies === "alpha" ? "Path B" : "Path A"}
              </Badge>
            )}
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">{step.why}</p>

          {step.commands && (
            <div className="space-y-1.5">
              {step.commands.map((c) => (
                <CopyCmd key={c} cmd={c} />
              ))}
            </div>
          )}

          {step.verify && (
            <div className="rounded-lg border border-success/20 bg-success/5 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-success">
                You know it worked when
              </p>
              <ul className="mt-1 space-y-0.5">
                {step.verify.map((v) => (
                  <li key={v} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden="true" />
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step.gotcha && (
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                Gotcha
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{step.gotcha}</p>
            </div>
          )}

          {step.links && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {step.links.map((l) => (
                <DocLink key={l.href} {...l} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Phase card ------------------------------------------------------------------

function PhaseCard({
  phase,
  doneSet,
  onToggle,
}: {
  phase: SetupPhase;
  doneSet: Set<string>;
  onToggle: (stepId: string) => void;
}) {
  const total = phase.steps.length;
  const done = phase.steps.filter((s) => doneSet.has(s.id)).length;
  const complete = done === total;

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2.5 text-lg">
            <span
              className={cn(
                "mono flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold",
                complete
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-primary/40 bg-primary/10 text-primary"
              )}
            >
              {complete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : phase.n}
            </span>
            {phase.title}
          </CardTitle>
          <span className="mono tabular text-[10px] text-muted-foreground">
            {done}/{total}
          </span>
        </div>
        <CardDescription>{phase.outcome}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {phase.steps.map((s) => (
          <StepCard key={s.id} step={s} done={doneSet.has(s.id)} onToggle={() => onToggle(s.id)} />
        ))}
      </CardContent>
    </Card>
  );
}

// --- Main view ---------------------------------------------------------------------

export function LiumSetupView({ onNavigate }: { onNavigate?: (v: ViewKey) => void }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [path, setPath] = useState<PayoutPath>("usdt");
  const [hydrated, setHydrated] = useState(false);

  // Load persisted progress + path once. Reads run inside an async function —
  // never a synchronous setState in the effect body (react-hooks lint rule).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const restored = new Set(loadProgress());
      let restoredPath: PayoutPath = "usdt";
      try {
        const p = window.localStorage.getItem(PATH_STORAGE_KEY);
        if (p === "usdt" || p === "alpha") restoredPath = p;
      } catch {
        /* private mode — defaults */
      }
      if (!cancelled) {
        setDone(restored);
        setPath(restoredPath);
        setHydrated(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleStep = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveProgress([...next]);
      return next;
    });
  };

  const selectPath = (p: PayoutPath) => {
    setPath(p);
    try {
      window.localStorage.setItem(PATH_STORAGE_KEY, p);
    } catch {
      /* private mode */
    }
  };

  const reset = () => {
    setDone(new Set());
    saveProgress([]);
  };

  // Steps visible under the selected rail.
  const phases = useMemo(
    () =>
      SETUP_PHASES.map((p) => ({
        ...p,
        steps: p.steps.filter((s) => s.applies === "both" || s.applies === path),
      })).filter((p) => p.steps.length > 0),
    [path]
  );

  const visibleTotal = useMemo(
    () => phases.reduce((acc, p) => acc + p.steps.length, 0),
    [phases]
  );
  const visibleDone = useMemo(
    () =>
      phases.reduce((acc, p) => acc + p.steps.filter((s) => done.has(s.id)).length, 0),
    [phases, done]
  );
  const pct = visibleTotal > 0 ? Math.round((visibleDone / visibleTotal) * 100) : 0;
  const allDone = hydrated && visibleTotal > 0 && visibleDone === visibleTotal;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <header className="animate-rise space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1 backdrop-blur">
          <ListChecks className="h-3.5 w-3.5 text-primary" />
          <span className="text-eyebrow text-muted-foreground">
            Provider onboarding · SN51 lium.io · docs checked {LIUM_SETUP_MEASURED_AT}
          </span>
        </div>
        <h1 className="text-display mt-2 text-3xl font-bold leading-tight md:text-4xl">
          Setup guide — from bare GPU to earning node on Lium
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          The complete, ordered path: prepare the host, create the wallet (coldkey/hotkey),
          register on Subnet 51, connect the portal, install the node with one command, price it
          for idle pay, and run it like an operator. Every command is transcribed from the official
          docs — where Lium changes its flow, the linked docs win over this page.
        </p>
      </header>

      {/* Progress + reset */}
      <Card className="glass">
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          <div className="min-w-[220px] flex-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">
                {allDone ? "All steps complete — go earn" : "Your progress"}
              </span>
              <span className="mono tabular text-muted-foreground">
                {visibleDone}/{visibleTotal} steps · {pct}%
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  allDone ? "bg-success" : "bg-primary"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={reset} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset progress
          </Button>
        </CardContent>
      </Card>

      {/* Automation — generated bootstrap scripts */}
      <AutomateCard path={path} />

      {/* Rail decision */}
      <div className="grid gap-4 md:grid-cols-2">
        {PAYOUT_PATHS.map((p) => {
          const active = path === p.key;
          return (
            <button
              key={p.key}
              onClick={() => selectPath(p.key)}
              className={cn(
                "rounded-2xl border p-5 text-left transition-all",
                active
                  ? "border-primary/50 bg-primary/5 shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]"
                  : "border-border/50 bg-card/30 hover:border-border"
              )}
              aria-pressed={active}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-sm font-bold", active && "text-primary")}>{p.title}</p>
                {active ? (
                  <Badge className="bg-primary/15 text-primary">following</Badge>
                ) : (
                  <span className="text-[10px] text-muted-foreground">select</span>
                )}
              </div>
              <p className="mt-1 text-xs font-medium text-foreground/80">{p.tagline}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-eyebrow text-success">You get</p>
                  <ul className="mt-1 space-y-0.5">
                    {p.perks.map((x) => (
                      <li key={x} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden="true" />
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-eyebrow text-muted-foreground/70">You owe</p>
                  <ul className="mt-1 space-y-0.5">
                    {p.needs.map((x) => (
                      <li key={x} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                        <Circle className="mt-0.5 h-2 w-2 shrink-0 text-warning" aria-hidden="true" />
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Requirements strip */}
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-4 w-4 text-primary" />
            What a compliant node looks like
          </CardTitle>
          <CardDescription>
            Every line here is a validator check or an idle-pay condition — meet all of them once and
            the node just earns.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {REQUIREMENTS.map((r) => (
            <div key={r.label} className="rounded-xl border border-border/50 bg-card/30 p-3">
              <p className="text-eyebrow text-muted-foreground/70">{r.label}</p>
              <p className="mt-1 text-xs font-semibold leading-snug">{r.value}</p>
              {r.note && <p className="mt-0.5 text-[10px] text-muted-foreground">{r.note}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Phases */}
      <div className="space-y-6">
        {phases.map((p) => (
          <PhaseCard key={p.id} phase={p} doneSet={done} onToggle={toggleStep} />
        ))}
      </div>

      {/* Penalty warning */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-destructive">
            <ShieldAlert className="h-4 w-4" />
            The one mistake that can erase a month of earnings
          </CardTitle>
          <CardDescription>
            Read this before you list anything as Secure.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          <p>
            A <span className="font-semibold text-foreground">Secure</span> node that drops a rental
            owes <span className="font-semibold text-foreground">48 hours of that rental&apos;s price</span> —
            however short the rental was — and <span className="font-semibold text-foreground">all</span> of
            your rental-fee payouts go to the debt until it is paid. On an 8× H100 at $2.00 per
            GPU-hour that is about $730 for a single dropped rental.
          </p>
          <p>
            Machines you cannot keep stable belong on <span className="font-semibold text-foreground">Spot</span>:
            cheaper for renters, reclaimable by you, and excluded from idle pay — which is still a
            better deal than one penalty. Tier is set per node in the portal and can be changed with
            a notice period.
          </p>
          <DocLink label="Penalties — official reference" href={SETUP_LINKS.penalties} />
        </CardContent>
      </Card>

      {/* Where this fits */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wallet className="h-4 w-4 text-primary" />
              Pair this guide with the money lens
            </CardTitle>
            <CardDescription>
              Before installing anything, price your card in Host &amp; Earn — measured 30-day
              actuals, your electricity, both payout rails side by side.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => onNavigate?.("host-earn")}
            >
              Open Host &amp; Earn calculator
            </Button>
          </CardContent>
        </Card>
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-lg">Official sources</CardTitle>
            <CardDescription>
              Transcribed {LIUM_SETUP_MEASURED_AT} — docs move, these links are the source of truth.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-4 gap-y-1.5">
            <DocLink label="Provider quickstart" href={SETUP_LINKS.providerQuickstart} />
            <DocLink label="Node quickstart" href={SETUP_LINKS.nodeQuickstart} />
            <DocLink label="lium-io GitHub" href={SETUP_LINKS.github} />
            <DocLink label="Provider Portal" href={SETUP_LINKS.portal} />
            <DocLink label="Bittensor wallets" href={SETUP_LINKS.bittensorWallets} />
            <DocLink label="Live registration fee" href={SETUP_LINKS.registrationFee} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
