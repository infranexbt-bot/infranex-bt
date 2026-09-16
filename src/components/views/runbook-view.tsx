"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Coins,
  Cpu,
  Gauge,
  Radar,
  Radio,
  Server,
  Terminal,
  Thermometer,
  Timer,
  Wallet,
} from "lucide-react";
import type { ViewKey } from "@/lib/infranex/types";
import { listCuratedMechanics } from "@/lib/infranex/mechanics";
import { OfficialMechanicsBlock } from "@/components/cards/mechanics-block";
import { useSubnetOverrides } from "@/lib/infranex/use-subnet-overrides";
import { useMemo } from "react";

interface RunbookViewProps {
  onNavigate: (v: ViewKey) => void;
}

const CURATED_MECHANICS = listCuratedMechanics();

/**
 * MECHANICS-ALL coverage line — counts subnets whose overrides carry
 * README-derived mechanics (SubnetOverride.mechanicsJson) so operators can
 * see how far the mechanics layer reaches beyond the hand-verified entries.
 */
function DerivedCoverageNote() {
  const { data: overrides } = useSubnetOverrides();
  const stats = useMemo(() => {
    if (!overrides) return null;
    let withMechanics = 0;
    let withWindow = 0;
    for (const [, entry] of overrides) {
      const m = entry.mechanics as
        | { rewardWindowDays?: number | null; provenance?: string }
        | undefined;
      if (m && m.provenance !== "curated") {
        withMechanics++;
        if (m.rewardWindowDays != null) withWindow++;
      }
    }
    return { withMechanics, withWindow };
  }, [overrides]);

  if (!stats || stats.withMechanics === 0) return null;
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Beyond hand-verified entries: </span>
      {stats.withMechanics} more subnet{stats.withMechanics === 1 ? "" : "s"} carry
      auto-derived mechanics from their READMEs
      {stats.withWindow > 0
        ? ` (${stats.withWindow} with a detected reward window)`
        : ""}
      — shown in each opportunity&apos;s detail dialog, labelled
      &ldquo;auto-extracted&rdquo; so curated and scraped knowledge stay distinguishable.
    </p>
  );
}

/**
 * RUNBOOK-1 — the operator's reference for "a GPU miner just started — now what?"
 * Static reference content; the live numbers live in the DevOps Engine view.
 */
export function RunbookView({ onNavigate }: RunbookViewProps) {
  return (
    <div className="space-y-6">
      {/* Intro + quick actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          What to verify when a GPU miner comes online — and what the DevOps
          Engine keeps watching so you do not have to. Thresholds below are the
          live defaults the engine enforces on every 90-second pass. A cash-out
          runbook covers the last mile: turning mined alpha into spendable TAO.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onNavigate("miners")}>
            <Coins className="h-4 w-4" /> Stake Portfolio
          </Button>
          <Button size="sm" variant="outline" onClick={() => onNavigate("devops")}>
            <Radar className="h-4 w-4" /> DevOps Engine
          </Button>
          <Button size="sm" variant="outline" onClick={() => onNavigate("monitoring")}>
            <Radio className="h-4 w-4" /> Monitoring
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Phase 1 — at start */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
              Phase 1 · At start (first 15 minutes)
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Goal: prove the miner came up correctly before you trust any number it reports.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {STARTUP_CHECKS.map((c) => (
              <div key={c.title} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">{c.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{c.detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Phase 2 — first hours */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
              Phase 2 · First hours (stabilization)
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Goal: confirm the miner is healthy AND actually earning on-chain.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border border-border/60">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-eyebrow text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Parameter</th>
                    <th className="px-3 py-2 font-medium">Healthy</th>
                    <th className="px-3 py-2 font-medium">Alarm</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {STABILIZATION_ROWS.map((r) => (
                    <tr key={r.param}>
                      <td className="px-3 py-2 font-medium">{r.param}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.healthy}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-destructive">{r.alarm}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Engine threshold strip */}
      <Card className="border-primary/25 bg-primary/[0.04]">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 py-4">
          <p className="text-eyebrow flex items-center gap-2 text-primary">
            <Thermometer className="h-4 w-4" aria-hidden="true" /> Engine thresholds
          </p>
          {THRESHOLD_CHIPS.map((t) => (
            <div key={t.label} className="flex items-baseline gap-1.5">
              <span className="mono text-sm font-semibold tabular">{t.value}</span>
              <span className="text-xs text-muted-foreground">{t.label}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Phase 3 — ongoing */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radar className="h-4 w-4 text-primary" aria-hidden="true" />
              Phase 3 · Ongoing — what the engine watches for you
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Every 90-second pass re-evaluates the whole fleet and commits trigger events.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {ONGOING_ITEMS.map((o) => (
              <div key={o.title} className="flex gap-3">
                <o.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">{o.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{o.detail}</p>
                </div>
              </div>
            ))}
            <Separator className="my-2" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-eyebrow text-muted-foreground">Trigger kinds</span>
              {TRIGGER_KINDS.map((k) => (
                <Badge key={k.kind} variant={k.hot ? "destructive" : "outline"} className="mono text-[10px]">
                  {k.kind}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Caveats */}
        <Card className="border-warning/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
              Honest limits — read before trusting the board
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-3">
              <Server className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Real pods need the Node Daemon</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Until the daemon is installed on a RunPod/Vast box, GPU telemetry is simulated
                  (health chips marked &ldquo;sim&rdquo;). Install it from the DevOps hosts panel
                  for live temperatures, utilization, and process state.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Missing telemetry is UNKNOWN, not BAD</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  A miner without fresh daemon telemetry scores mid-range on the missing
                  signals — the board never invents a healthy reading for data it does not
                  have. Treat a mid-range score as a daemon problem first.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Economics are estimates until first sweeps</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Revenue projections use subnet incentive rates; the first real emission sweep
                  is the ground truth. Watch net/day on the fleet tiles, not the projection alone.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RUNBOOK-2 — cash-out runbook: alpha → TAO → exchange */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-primary" aria-hidden="true" />
            Cash-out runbook · alpha → TAO → exchange
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Mining rewards land as staked alpha on your hotkey. Unstaking sells
            that alpha into the subnet&apos;s liquidity pool and credits TAO to
            the coldkey — the Stake Portfolio card tracks both ends live.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            {CASHOUT_STEPS.map((s, i) => (
              <div key={s.title} className="flex gap-3">
                <span className="mono mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{s.detail}</p>
                  {s.code ? (
                    <pre className="mono mt-1.5 overflow-x-auto rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-foreground/90">
                      {s.code}
                    </pre>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <p className="text-eyebrow text-muted-foreground">Watch-outs</p>
            {CASHOUT_WARNINGS.map((w) => (
              <div key={w.title} className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">{w.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{w.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* MECHANICS-ALL — curated + README-derived reward rules */}
      {CURATED_MECHANICS.length > 0 && (
        <div className="space-y-3">
          <DerivedCoverageNote />
          <div className="grid gap-6 lg:grid-cols-2">
            {CURATED_MECHANICS.map((m) => (
              <Card key={m.netuid} className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
                    Subnet mechanics · {m.subnetName} (α{m.netuid})
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    The official reward rules the scoring engine now uses — ramp windows,
                    bounties and optimization targets come from the subnet&apos;s own repos,
                    not the generic bond-EMA heuristic.
                  </p>
                </CardHeader>
                <CardContent>
                  <OfficialMechanicsBlock mechanics={m} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Registration reminder */}
      <Card className="border-border/60">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Registration is always LAST.</span>{" "}
              Stabilize the miner first (Phase 1 + 2 green), then register the hotkey — an
              unregistered miner just burns the recycle fee while it reboots.
            </p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => onNavigate("deployments")}>
            Deployments <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

const STARTUP_CHECKS = [
  {
    title: "Pipeline reached started",
    detail:
      "requested, approved, provisioning, provisioned, setup, ready, deploying, started — every stage green on the deployment card.",
  },
  {
    title: "Daemon alive and heartbeating",
    detail:
      "Process running and last-seen within 10 minutes; the engine flags anything quieter as daemon-silent.",
  },
  {
    title: "Boot logs are clean",
    detail:
      "Wallet and hotkey loaded, connected to finney, axon serving on 8091/8092, no tracebacks, no secrets in log lines.",
  },
  {
    title: "GPU is really there",
    detail:
      "Correct model and VRAM for the offer, driver and CUDA healthy, workspace volume mounted.",
  },
  {
    title: "Chain registration state known",
    detail:
      "Hotkey registered with a UID, or explicitly parked as unregistered — never assume.",
  },
] as const;

const STABILIZATION_ROWS = [
  { param: "GPU temperature", healthy: "below 75-80 C", alarm: "above 85 C" },
  { param: "GPU utilization", healthy: "steady, workload-shaped", alarm: "below 30% for 3 passes" },
  { param: "Incentive (I) on UID", healthy: "climbing off zero", alarm: "stuck at zero" },
  { param: "Immunity trend", healthy: "flat or improving", alarm: "declining near the floor" },
  { param: "Benchmark vs median", healthy: "at or above subnet median", alarm: "regression" },
  { param: "Restarts", healthy: "stable uptime", alarm: "crash loops" },
] as const;

const THRESHOLD_CHIPS = [
  { value: "85 C", label: "temp critical" },
  { value: "<30% x3", label: "low-util trigger" },
  { value: "10 min", label: "daemon silent" },
  { value: "18 h", label: "runway watch" },
  { value: "6 h", label: "runway at-risk" },
  { value: "0.0005", label: "TAO/day income floor" },
] as const;

const ONGOING_ITEMS = [
  {
    icon: Timer,
    title: "Health score 0-100",
    detail:
      "Composite of temperature, utilization, daemon liveness, and chain signals, recomputed every pass.",
  },
  {
    icon: Timer,
    title: "Deregistration runway",
    detail:
      "Blocks left in the 24h immunity window, capacity slots, income vs the floor, and a T-minus countdown with failover bound.",
  },
  {
    icon: Wallet,
    title: "Fleet economics",
    detail: "Infra cost vs estimated revenue per day — net/day on the fleet tiles is the number to watch.",
  },
  {
    icon: AlertTriangle,
    title: "Triggers and escalation",
    detail:
      "New conditions commit events, escalate on the ladder, and page external channels; autopilot executes auto-safe actions.",
  },
] as const;

const TRIGGER_KINDS = [
  { kind: "GPU_HEALTH", hot: false },
  { kind: "DEREG_RISK", hot: true },
  { kind: "RUNWAY", hot: false },
  { kind: "UPSTREAM_DRIFT", hot: false },
  { kind: "BENCH_REGRESS", hot: false },
] as const;

const CASHOUT_STEPS = [
  {
    title: "Check what you hold — and where",
    detail:
      "My Miners → Stake Portfolio shows α staked per subnet, the α/TAO pool spot, 24h drift, and the coldkey's free TAO. Cross-check with btcli wallet overview. Prefer unstaking from deep pools (e.g. Chutes α64) — thin pools move the price against you.",
    code: "btcli wallet overview --network finney",
  },
  {
    title: "Unstake: sell alpha for TAO onto the coldkey",
    detail:
      "btcli stake remove is interactive (wallet → hotkey → subnet → amount). No lockups — the TAO lands within seconds to a few blocks. Newer btcli versions offer --safe-staking to split large unstakes into chunks; run btcli stake remove --help for the current flags.",
    code: "btcli stake remove \\\n  --wallet.name <wallet> --wallet.hotkey <hotkey> \\\n  --netuid 64 --amount 1.2 --network finney\n\n# all alpha from one subnet:\nbtcli stake remove --wallet.name <wallet> --netuid 64 --all-alpha",
  },
  {
    title: "Confirm the TAO arrived on the coldkey",
    detail:
      "The Stake Portfolio card's “Free TAO on coldkeys” ticks up after the unstake. btcli wallet balance shows the same number chain-side.",
    code: "btcli wallet balance --network finney",
  },
  {
    title: "Optional: move TAO to an exchange",
    detail:
      "Kraken, Binance, MEXC and Gate.io all list TAO. Send a small test amount first and make sure the destination is a Bittensor (TAO chain) address — never an EVM/0x address.",
    code: "btcli wallet transfer \\\n  --dest <exchange-deposit-address> \\\n  --amount 0.5 --network finney",
  },
] as const;

const CASHOUT_WARNINGS = [
  {
    title: "Rate = pool price at execution",
    detail:
      "You get the pool rate when the unstake executes, minus pool impact and a small protocol swap fee. Check the 24h drift on the Stake Portfolio card before pulling the trigger on a large position.",
  },
  {
    title: "Root stake needs no conversion",
    detail:
      "Root (netuid 0) stake is already TAO-denominated — only subnet alpha needs the unstake step.",
  },
  {
    title: "The mnemonic never goes online",
    detail:
      "Staking operations run locally with your wallet files — no seed phrase belongs in any website or support ticket. Anyone asking for it is a scammer.",
  },
  {
    title: "Test-transfer rule",
    detail:
      "First time moving TAO anywhere: send the minimum, confirm arrival, then send the rest. Addresses on Bittensor cannot be un-sent from.",
  },
] as const;
