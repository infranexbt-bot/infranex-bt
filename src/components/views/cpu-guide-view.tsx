"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Check,
  ChevronDown,
  Copy,
  Cpu,
  ExternalLink,
  Flame,
  Gavel,
  Landmark,
  ListChecks,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import {
  useNetwork,
  mergeOpportunities,
  type LiveOpportunity,
} from "@/lib/infranex/use-network";
import { useProfitabilityConfig } from "@/lib/infranex/use-profitability";
import type { LiveNetworkSnapshot } from "@/lib/infranex/chain";
import type { ViewKey } from "@/lib/infranex/types";

// ---------------------------------------------------------------------------
// CPU-GUIDE — the CPU mining path, in-app, for EVERY CPU-classified subnet.
//
// The network runs more than one CPU-mineable subnet. SN67 Harnyx (script
// mining) is the flagship with a fully researched deep guide; SN62 Ridges,
// SN13 Data Universe, SN50 Synth, SN75 Hippius and SN6 Numinous are hand-
// verified entries with real repo/docs links. Every other subnet the work-
// type classifier marks CPU-only (the same classifier the Opportunities
// scanner uses) gets a live-generated guide: universal 9-phase path,
// parameterized btcli commands and live chain economics — with honest
// "verify the repo specifics" notes instead of fabricated deep detail.
//
// What this view does:
//   1. Subnet picker — every live opportunity with minVramGb ≤ 0, scored,
//      verified profiles pinned on top.
//   2. Live per-subnet economics strip — same chain numbers as Opportunities.
//   3. Golden-order banner — register LAST, after the Validator Lab gate is green.
//   4. Nine phase cards (0-8) with copyable commands, cost badges and
//      per-user per-subnet progress (localStorage).
//   5. Validator Lab gate card — SN67 case study proves the gate; sync works
//      for any netuid.
//   6. Honest boundaries — what the app deliberately does NOT do on this path.
// ---------------------------------------------------------------------------

// --- Verified CPU subnet profiles --------------------------------------------
// Every link here was hand-checked against the subnet team's own materials.
// A subnet without a profile still gets a guide (generic path), it just
// doesn't get links this platform cannot vouch for.

interface CpuProfile {
  netuid: number;
  slug: string; // wallet name
  work: string; // what miners actually produce
  minerModel:
    | "script-mining"
    | "long-running miner"
    | "storage node"
    | "forecasting agents";
  /** How mining mechanically works — what runs where. */
  mechanics: string;
  /** What the CPU box actually does (drives the budget card). */
  hardwareNote: string;
  /** Deep guide exists (SN67) — richer copy, validator weights, gate numbers. */
  deep?: boolean;
  /** Hand-verified links only. */
  links: [string, string][];
}

const CPU_PROFILES: CpuProfile[] = [
  {
    netuid: 67,
    slug: "harnyx",
    work: "deep-research agent scripts — validators execute your Python agent in sandboxes",
    minerModel: "script-mining",
    mechanics:
      "You write a Python agent inside the harnyx-miner-sdk harness and submit it; validators run it against live research queries and score latency, price, quality and throughput every epoch. No long-running process of yours serves traffic — the script is the miner.",
    hardwareNote:
      "an existing CPU box is fine — validators run the workload, your box only builds and submits the script",
    deep: true,
    links: [
      ["harnyx.ai", "https://harnyx.ai"],
      ["github.com/harnyx/harnyx", "https://github.com/harnyx/harnyx"],
      ["dashboard.harnyx.ai/benchmark", "https://dashboard.harnyx.ai/benchmark"],
    ],
  },
  {
    netuid: 62,
    slug: "ridges",
    work: "software-engineering agents — your agent solves real GitHub issues in validator sandboxes",
    minerModel: "script-mining",
    mechanics:
      "Ridges is an open agent competition: you upload your agent as Python files via the Ridges CLI, validators run it against SWE-style tasks and score solves. Like SN67, the code you ship is the miner — your box develops and uploads, the sandbox executes.",
    hardwareNote:
      "a CPU box is enough to develop and upload the agent — execution happens in validator sandboxes",
    links: [
      ["github.com/ridgesai/ridges", "https://github.com/ridgesai/ridges"],
      ["github.com/ridgesai (org)", "https://github.com/ridgesai"],
    ],
  },
  {
    netuid: 13,
    slug: "datauniverse",
    work: "scraped social data — miners crawl defined DataSources (X, Reddit) and serve it to validators",
    minerModel: "long-running miner",
    mechanics:
      "Miners run the Data Universe miner process with scraping workers for the DataSources they choose; validators query recent data and score freshness, coverage and correctness. Unlike script-mining, your miner runs continuously on your box.",
    hardwareNote:
      "CPU plus bandwidth and proxies — scraping is network-bound, not compute-bound; expect proxy costs",
    links: [
      [
        "github.com/Wondamonstaa/Data-Universe",
        "https://github.com/Wondamonstaa/Data-Universe",
      ],
      ["docs.macrocosmos.ai (SN13 guide)", "https://docs.macrocosmos.ai"],
    ],
  },
  {
    netuid: 50,
    slug: "synth",
    work: "probabilistic price paths — miners generate millions of synthetic forecast paths for BTC, ETH, SOL, gold",
    minerModel: "forecasting agents",
    mechanics:
      "Miners run the synth-subnet forecasting stack, producing distributional price paths daily; validators score them by CRPS against real market outcomes. Monte Carlo generation runs happily on CPU cores — more cores, more paths, tighter scores.",
    hardwareNote:
      "multi-core CPU helps — path generation is embarrassingly parallel; GPU optional for speed",
    links: [
      ["synthdata.co", "https://synthdata.co"],
      ["github.com/synthdataco/synth-subnet", "https://github.com/synthdataco/synth-subnet"],
    ],
  },
  {
    netuid: 75,
    slug: "hippius",
    work: "decentralized storage — miners provide IPFS-backed disk capacity with ZFS reliability",
    minerModel: "storage node",
    mechanics:
      "You deploy a storage miner (IPFS node backed by ZFS) and register it on Hippius; validators probe availability, durability and retrieval. The miner process runs on your box around the clock — your disk IS the commodity.",
    hardwareNote:
      "CPU plus real disks — budget for storage hardware and ZFS mirrors, not GPU",
    links: [
      [
        "github.com/thenervelab/hippius-storage-miner",
        "https://github.com/thenervelab/hippius-storage-miner",
      ],
      ["subnetalpha.ai/subnet/hippius", "https://subnetalpha.ai/subnet/hippius"],
    ],
  },
  {
    netuid: 6,
    slug: "numinous",
    work: "forecasting agents — miners aggregate predictive signals into the protocol's forecasts",
    minerModel: "forecasting agents",
    mechanics:
      "Numinous aggregates agent forecasts into a superhuman predictive layer; miners run forecasting agents whose calibration and edge are scored over time. Expect to iterate on model logic locally and serve predictions through the subnet's miner stack.",
    hardwareNote:
      "CPU-class per the work-type classifier — verify exact requirements in the subnet's repo before burning",
    links: [
      ["subnetalpha.ai/subnet/numinous", "https://subnetalpha.ai/subnet/numinous"],
    ],
  },
];

/** Generic honest profile for CPU-classified subnets without hand-verified
 *  research. No links this platform can't vouch for — the app's own Subnets
 *  view (live on-chain identity) and docs.bittensor.com fill that role. */
function genericProfile(netuid: number, name: string): CpuProfile {
  return {
    netuid,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16) || `sn${netuid}`,
    work: "CPU-classified work per the live work-type classifier (agents, markets, scraping, storage families)",
    minerModel: "long-running miner",
    mechanics:
      "The exact miner mechanics are subnet-specific: most run a long-running miner process from the subnet's official repo, a few (like SN67/SN62) accept submitted code that validators execute. Verify in the subnet's own docs before building.",
    hardwareNote:
      "CPU VPS class (~$20-50/mo) per the classifier — confirm against the subnet's min_compute.yml before burning",
    links: [],
  };
}

// --- Session-scoped progress -------------------------------------------------

interface SessionShape {
  user?: { userId?: string };
}

function useSessionUserId() {
  const { data } = useQuery<SessionShape>({
    queryKey: ["auth-session"],
    queryFn: async () => {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (!res.ok) throw new Error("not signed in");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data?.user?.userId ?? null;
}

/** Per-user, PER-SUBNET phase checklist. SN67 keeps the legacy key so
 *  progress made before the guide went multi-subnet survives. Loads
 *  asynchronously once the session resolves — never a synchronous setState
 *  in an effect (react-hooks lint rule). */
function progressKey(userId: string, netuid: number) {
  return netuid === 67
    ? `infranex.cpu-guide.v1.${userId}`
    : `infranex.cpu-guide.v1.${userId}.sn${netuid}`;
}

function usePhaseProgress(userId: string | null, netuid: number) {
  const [done, setDone] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!userId) return; // wait for the session to resolve
      let list: string[] = [];
      try {
        const raw = localStorage.getItem(progressKey(userId, netuid));
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) list = parsed.filter((x) => typeof x === "string");
      } catch {
        /* corrupted storage — start clean */
      }
      if (!cancelled) {
        setDone(list);
        setLoaded(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, netuid]);

  const toggle = (id: string) => {
    setDone((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      if (userId) {
        try {
          localStorage.setItem(progressKey(userId, netuid), JSON.stringify(next));
        } catch {
          /* private mode — progress stays in-memory */
        }
      }
      return next;
    });
  };

  return { done, toggle, loaded };
}

// --- Small building blocks ---------------------------------------------------

function CostBadge({ tier }: { tier: "free" | "paid" | "burn" }) {
  if (tier === "burn")
    return (
      <Badge variant="outline" className="gap-1 border-warning/50 bg-warning/10 text-warning">
        <Flame className="h-3 w-3" aria-hidden="true" /> burn
      </Badge>
    );
  if (tier === "paid")
    return (
      <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
        paid
      </Badge>
    );
  return (
    <Badge variant="outline" className="border-border/70 text-muted-foreground">
      free
    </Badge>
  );
}

function CopyCmd({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable (http / permissions) — text remains selectable */
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

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-card/60 px-3.5 py-3">
      <p className="text-eyebrow text-muted-foreground/70">{label}</p>
      <p className="mono mt-1.5 truncate text-base font-semibold tabular text-foreground">
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</p>
      ) : null}
    </div>
  );
}

// --- Phase model --------------------------------------------------------------

interface Phase {
  id: string;
  n: number;
  title: string;
  cost: "free" | "paid" | "burn";
  why: string;
  steps: string[];
  commands?: string[];
  appNote: string;
}

// --- SN67 deep phases (the researched flagship — preserved verbatim) ----------

const DEEP_SN67_PHASES: Phase[] = [
  {
    id: "p0",
    n: 0,
    title: "Size the deal before you touch anything",
    cost: "free",
    why: "The Opportunities scanner found SN67 for you: classified CPU-only (\"Agents & logic\", min VRAM 0), scored 65.5 with a ~$100/mo base-case net. Watch the economics first so the budget you commit is sized honestly, not on hope.",
    steps: [
      "Open Opportunities and filter by \"CPU-only work\" — SN67 is the cheapest live hit.",
      "Open the SN67 detail: score 65.5, gross ~$234/mo, net ~$100/mo base (bear −$37 / bull +$179).",
      "Re-read the strip below each week — a subnet this cheap can also get cheaper.",
    ],
    appNote:
      "This is literally how the opportunity surfaced: the scanner runs on live chain snapshots, and the strip below is the same data.",
  },
  {
    id: "p1",
    n: 1,
    title: "Create wallet keys (cold + hot)",
    cost: "free",
    why: "Registration and mining both identify through a Bittensor wallet: a coldkey holds your funds, a hotkey does the work. Keys are generated locally on your own machine — nothing here ever sees a mnemonic.",
    steps: [
      "Generate a coldkey and a hotkey on your CPU box (commands below).",
      "Back up the mnemonic offline, on paper. If it leaks, your TAO leaks.",
      "Record the hotkey's ss58 address in the app's Wallets view for reference.",
    ],
    commands: [
      "btcli wallet new-coldkey --wallet.name harnyx --wallet.path ~/.bittensor/wallets",
      "btcli wallet new-hotkey --wallet.name harnyx --wallet.hotkey sn67miner",
    ],
    appNote:
      "The Wallets view stores records (metadata only — never mnemonics). Copy addresses, never seed phrases.",
  },
  {
    id: "p2",
    n: 2,
    title: "Get the Harnyx code",
    cost: "free",
    why: "SN67's miner is a Python agent script, not a long-running binary. The repo ships the harnyx-miner-sdk that wraps the network protocol — you only write the agent logic inside its harness.",
    steps: [
      "Clone the repo (github.com/harnyx/harnyx) into a small Python venv.",
      "Install the miner SDK in editable mode so you can iterate on the agent.",
      "Skim the miner example end to end before changing anything.",
    ],
    commands: [
      "git clone https://github.com/harnyx/harnyx.git && cd harnyx",
      "python -m venv .venv && source .venv/bin/activate",
      "pip install -e harnyx-miner-sdk",
    ],
    appNote:
      "Subnets view → SN67 shows the live on-chain identity, repo link, seat count and burn cost in one place.",
  },
  {
    id: "p3",
    n: 3,
    title: "Study the champion + mine the validator profile",
    cost: "free",
    why: "SN67 clears the market on Price (56% of the reward weight) with Quality at 19%, a ~30 s response deadline, a ~$0.50/1M price reference and ~25 tps throughput reference. That mix is the validator's actual scoring shape — mined live, not guessed.",
    steps: [
      "Validator Lab → Sync netuid 67 — the profile arrives in ~15 s from the repo + chain.",
      "Probe the top miner through the champion endpoint (MCP: api.harnyx.ai/mcp) — read its latency, price and citation style.",
      "Write the three numbers on a sticky note: <30 s, ≤$0.50/1M, ≥25 tps.",
    ],
    appNote:
      "Validator Lab (nav 04) is your free sparring partner — no burn needed to see the validator's shape.",
  },
  {
    id: "p4",
    n: 4,
    title: "Build the agent (your CPU is the forge)",
    cost: "free",
    why: "Validators execute your script in sandboxes, so the hardware that matters is theirs. Your box only needs to produce the script. Optimize for the validator's shape: fast, cheap, good-enough quality with citations.",
    steps: [
      "Implement the agent inside the harnyx-miner-sdk harness.",
      "Tune response time under the ~30 s deadline — slow answers lose on Market Clearing.",
      "Price at or below the ~$0.50/1M reference; keep quality ≥80% with citations.",
      "Target ≥25 tps throughput — the validator rewards speed per token, not just total time.",
    ],
    appNote:
      "CPU is enough — this is the one mining path where the GPU wizard, CUDA config and nvidia-smi telemetry stay out of your way.",
  },
  {
    id: "p5",
    n: 5,
    title: "Local eval — spar with Validator Lab until the gate is green",
    cost: "free",
    why: "Re-run the simulation after every design change. The validator sim scores your agent's latency / quality / price / throughput mix into a composite — before you ever spend a wei of burn. Proof from the last pre-flight: a slow-but-deep agent (240 s, $0.60, 72%) scored 41.9 = weak; a tuned fast+cheap one scored 62.1 = competitive ≈ p90 (1.87× the median).",
    steps: [
      "Validator Lab → netuid 67 → drag the sliders to your agent's real numbers.",
      "Read the verdict: weak / below-median / competitive — and the p-position.",
      "Iterate: cut latency, cut price, hold quality — re-simulate each time.",
    ],
    appNote:
      "Same discipline that gated the SN64 pre-flight: no green verdict, no burn.",
  },
  {
    id: "p6",
    n: 6,
    title: "Register the hotkey — the ONE burn",
    cost: "burn",
    why: "Registration burns ~0.05 TAO (≈$12 — the cheapest entry seen in the network vs ~1 TAO on SN64) and takes a seat on SN67. It floats with demand, so check the strip before executing. This is the point of no return — the gate must be green first.",
    steps: [
      "Confirm the Validator Lab gate card below shows competitive (~p90) or better.",
      "Check the burn cost in the strip — if it spiked, the seat demand changed.",
      "Register (command below), then verify the hotkey appears in the SN67 metagraph.",
    ],
    commands: [
      "btcli subnet register --netuid 67 --wallet.name harnyx --wallet.hotkey sn67miner",
    ],
    appNote:
      "The pre-burn gate lives in this app: check \"gate green?\" here before btcli does the irreversible part.",
  },
  {
    id: "p7",
    n: 7,
    title: "Submit your agent script",
    cost: "free",
    why: "Once registered, submit the agent through the Harnyx miner tooling. Validators pick it up, execute it in sandboxes against live queries, and score it every epoch. Keep the repo's submission flow as the source of truth — it is the SDK's job, not this app's.",
    steps: [
      "Package the agent per the repo's harnyx-miner-sdk instructions.",
      "Submit with your harnyx wallet keys (coldkey signs, hotkey serves).",
      "Watch the first epochs on the Harnyx dashboard before celebrating.",
    ],
    appNote:
      "The app deliberately has NO script-upload path — submission belongs to the Harnyx CLI. Nothing missing: the app was never meant to do this step.",
  },
  {
    id: "p8",
    n: 8,
    title: "Monitor & earn — the weekly \"is this still worth it?\"",
    cost: "free",
    why: "Emissions move. SN67 currently pays miners ~9.8 TAO/day across ~222 rewarded seats with a wide spread (top 10% hold ~24% of incentive — mid-pack miners keep their seats). A weekly glance catches a dying alpha price or a tightening spread before it eats your ROI.",
    steps: [
      "Weekly: re-read the strip — alpha price trend, miner emission/day, seat churn.",
      "Scores: MCP (api.harnyx.ai/mcp) + dashboard.harnyx.ai/benchmark for your agent's rank.",
      "Payouts: taostats for the coldkey's actual TAO flow — the ground truth.",
      "Decision rule: if net expectation drops under your target for weeks, deregister and move the burn elsewhere.",
    ],
    appNote:
      "Opportunities / Subnets views are the standing \"is this deal still good?\" check — same engine that found it.",
  },
];

// --- Generic phase builder (any CPU-classified subnet) ------------------------
// Honest by construction: live economics from the chain, universal Bittensor
// discipline, and explicit "verify in the subnet's docs" where a deep guide
// would otherwise be fabricated.

interface GenericCtx {
  profile: CpuProfile;
  name: string;
  netuid: number;
  opp?: LiveOpportunity;
  burnTao: number | null;
  burnUsd: number | null;
}

function fmtUsd(v: number | null | undefined): string {
  return v != null ? `$${Math.round(v)}` : "—";
}

function genericPhases(ctx: GenericCtx): Phase[] {
  const { profile, name, netuid, opp, burnTao, burnUsd } = ctx;
  const score = opp?.score != null ? Math.round(opp.score) : null;
  const net =
    opp?.netMonthlyUsd ?? opp?.profitability?.scenarios?.base?.netMonthlyUsd ?? null;
  const bear = opp?.profitability?.scenarios?.bear?.netMonthlyUsd ?? null;
  const bull = opp?.profitability?.scenarios?.bull?.netMonthlyUsd ?? null;
  const earnPct = opp?.earnChance?.pct;
  const burnTxt =
    burnTao != null
      ? `${burnTao.toFixed( burnTao < 0.01 ? 4 : 3 )} τ${burnUsd != null ? ` (≈$${Math.round(burnUsd)})` : ""}`
      : "live in the strip below";
  const w = profile.slug;
  const repoNote = profile.links.length
    ? undefined
    : "no hand-verified repo link for this subnet — take the repo ONLY from the subnet's on-chain identity (Subnets view) or docs.bittensor.com, never from a random mirror";

  return [
    {
      id: "p0",
      n: 0,
      title: `Size the ${name} deal before you touch anything`,
      cost: "free",
      why: `The Opportunities scanner classifies SN${netuid} as CPU-only work (min VRAM 0)${
        score != null ? `, scored ${score} against the five-pillar ledger` : ""
      }${
        net != null
          ? `, with a base-case net of ~${fmtUsd(net)}/mo${
              bear != null && bull != null ? ` (bear ${fmtUsd(bear)} / bull ${fmtUsd(bull)})` : ""
            }`
          : ""
      }. ${name}'s miners ${profile.work}. Watch the economics first so the budget you commit is sized honestly, not on hope.`,
      steps: [
        "Open Opportunities and filter by \"CPU-only work\" — find this subnet's row and read the full P&L.",
        earnPct != null
          ? `Check the earn chance (${earnPct}%) — seats and reward concentration decide whether a new UID actually gets paid.`
          : "Check the earn chance on the row — seats and reward concentration decide whether a new UID actually gets paid.",
        "Re-read the strip below each week — CPU deals are cheap to enter and cheap to leave, but the burn is still irreversible.",
      ],
      appNote:
        "The scanner and this strip run on the same live chain snapshot — no hand-typed numbers anywhere in this guide.",
    },
    {
      id: "p1",
      n: 1,
      title: "Create wallet keys (cold + hot)",
      cost: "free",
      why: "Every Bittensor subnet identifies miners the same way: a coldkey holds your funds, a hotkey does the work. Keys are generated locally on your own machine — nothing here ever sees a mnemonic. Use a wallet name you'll recognize in taostats later.",
      steps: [
        "Generate a coldkey and a hotkey on your CPU box (commands below).",
        "Back up the mnemonic offline, on paper. If it leaks, your TAO leaks.",
        "Record the hotkey's ss58 address in the app's Wallets view for reference.",
      ],
      commands: [
        `btcli wallet new-coldkey --wallet.name ${w} --wallet.path ~/.bittensor/wallets`,
        `btcli wallet new-hotkey --wallet.name ${w} --wallet.hotkey sn${netuid}miner`,
      ],
      appNote:
        "The Wallets view stores records (metadata only — never mnemonics). Copy addresses, never seed phrases.",
    },
    {
      id: "p2",
      n: 2,
      title: "Get the official code — and only the official code",
      cost: "free",
      why: `${profile.mechanics} The one rule that never bends: the repo comes from the subnet team's own materials, verified twice.${repoNote ? ` ${repoNote}.` : ""}`,
      steps: [
        profile.links.some(([l]) => l.includes("github.com"))
          ? "Clone the verified repo (linked in the Official links card below) into a small Python venv."
          : "Find the official repo via the Subnets view (live on-chain identity) and verify its history before cloning.",
        "Read the README's miner section end to end before installing anything.",
        "Skim the reward function — it is the ground truth for what validators actually pay for.",
      ],
      ...(profile.links.some(([l]) => l.includes("github.com"))
        ? {
            commands: [
              `git clone ${profile.links.find(([l]) => l.includes("github.com"))![1]}.git && cd ${profile.links.find(([l]) => l.includes("github.com"))![0].split("/").pop()}`,
              "python -m venv .venv && source .venv/bin/activate",
            ],
          }
        : {}),
      appNote:
        "Subnets view → this subnet shows the live on-chain identity, seat count and burn cost in one place.",
    },
    {
      id: "p3",
      n: 3,
      title: "Mine the validator profile in Validator Lab — free",
      cost: "free",
      why: "Validator Lab mines the subnet's actual scoring shape from the repo + chain before you spend anything. For SN67 the profile is deep (weights, deadlines, price references); for other subnets the profile may be partial — treat it as a map with gaps, and cross-check the repo's reward function where the profile is thin.",
      steps: [
        `Validator Lab → Sync netuid ${netuid} — the profile arrives from the repo + chain.`,
        "Read the mined weights: which axis (speed, price, quality, coverage) actually moves rewards here.",
        "If the profile looks incomplete, say so in your notes and lean on the repo's reward function instead.",
      ],
      appNote:
        "Validator Lab (nav 04) is your free sparring partner — no burn needed to see the validator's shape.",
    },
    {
      id: "p4",
      n: 4,
      title: "Build the miner (your CPU is the forge)",
      cost: "free",
      why: `${profile.hardwareNote.charAt(0).toUpperCase()}${profile.hardwareNote.slice(1)}. Build toward the validator's shape from Phase 3, not toward guesswork — and keep the implementation inside the repo's own miner harness so protocol updates don't strand you.`,
      steps: [
        "Implement the miner per the repo's own harness/examples — resist custom plumbing.",
        "Match the mined validator weights: optimize what is actually scored, ignore what isn't.",
        "Dry-run against the testnet first (docs.bittensor.com) — mainnet epochs score for real.",
      ],
      appNote:
        "CPU is enough — this is the mining path where the GPU wizard, CUDA config and nvidia-smi telemetry stay out of your way.",
    },
    {
      id: "p5",
      n: 5,
      title: "Local eval — spar with Validator Lab until the gate is green",
      cost: "free",
      why: "Re-run the simulation after every design change, before you ever spend a wei of burn. The SN67 case study below proves the gate catches weak miners: a slow-but-deep agent scored 41.9 = weak; a tuned one scored 62.1 = competitive ≈ p90. The same discipline transfers to every subnet — simulate, iterate, only burn on competitive.",
      steps: [
        `Validator Lab → netuid ${netuid} → drag the sliders to your miner's real numbers.`,
        "Read the verdict: weak / below-median / competitive — and the p-position.",
        "Iterate: cut the weak axis, hold the strong one — re-simulate each time.",
      ],
      appNote:
        "Same discipline that gated the SN64 pre-flight: no green verdict, no burn.",
    },
    {
      id: "p6",
      n: 6,
      title: "Register the hotkey — the ONE burn",
      cost: "burn",
      why: `Registration burns ${burnTxt} and takes a seat on SN${netuid}. It floats with demand, so check the strip before executing. This is the point of no return — the gate must be green first, and every phase before this one was free on purpose.`,
      steps: [
        "Confirm the Validator Lab gate card below shows competitive or better.",
        "Check the burn cost in the strip — if it spiked, the seat demand changed.",
        `Register (command below), then verify the hotkey appears in the SN${netuid} metagraph.`,
      ],
      commands: [
        `btcli subnet register --netuid ${netuid} --wallet.name ${w} --wallet.hotkey sn${netuid}miner`,
      ],
      appNote:
        "The pre-burn gate lives in this app: check \"gate green?\" here before btcli does the irreversible part.",
    },
    {
      id: "p7",
      n: 7,
      title:
        profile.minerModel === "script-mining"
          ? "Submit your code to the subnet"
          : profile.minerModel === "storage node"
            ? "Bring the storage node online"
            : "Run the miner — steady beats heroic",
      cost: "free",
      why:
        profile.minerModel === "script-mining"
          ? "Once registered, submit through the subnet's own CLI/SDK. Validators execute your code in sandboxes and score it every epoch. The repo's submission flow is the source of truth — it is the tooling's job, not this app's."
          : profile.minerModel === "storage node"
            ? "Storage mining is an uptime business: the node serves retrievals around the clock, and validators probe availability continuously. Disk health and redundancy (ZFS mirrors) matter more than raw capacity."
            : "Long-running miners earn by staying up and responding inside the scoring window: keep the process supervised (systemd), watch logs after every repo update, and never let a stale version serve traffic.",
      steps: [
        profile.minerModel === "script-mining"
          ? "Package and submit per the repo's instructions (coldkey signs, hotkey serves)."
          : profile.minerModel === "storage node"
            ? "Provision disks + ZFS pool per the repo's deployment guide, then start the miner service."
            : "Start the miner under a supervisor (systemd unit) with logs you actually read.",
        "Watch the first epochs before walking away — early scores expose config mistakes cheaply.",
        "Set a weekly check-in: strip below + the subnet's own dashboard.",
      ],
      appNote:
        "The app deliberately has NO miner-submission path — running the miner belongs to the subnet's own tooling. Nothing missing: the app was never meant to do this step.",
    },
    {
      id: "p8",
      n: 8,
      title: "Monitor & earn — the weekly \"is this still worth it?\"",
      cost: "free",
      why: `Emissions move. The strip below shows ${name}'s live alpha price, miner emission and seat churn; the Opportunities row keeps scoring the deal against your profitability rule. A weekly glance catches a dying alpha price or a tightening spread before it eats your ROI.`,
      steps: [
        "Weekly: re-read the strip — alpha price trend, miner emission/day, seat churn.",
        "Scores: the subnet's own dashboard/taostats for your hotkey's rank.",
        "Payouts: taostats for the coldkey's actual TAO flow — the ground truth.",
        "Decision rule: if net expectation drops under your target for weeks, deregister and move the burn elsewhere.",
      ],
      appNote:
        "Opportunities / Subnets views are the standing \"is this deal still good?\" check — same engine that found it.",
    },
  ];
}

// --- View ---------------------------------------------------------------------

const PICKER_KEY = "infranex.cpu-guide.subnet";

export function CpuGuideView({ onNavigate }: { onNavigate: (v: ViewKey) => void }) {
  const { data: snap } = useNetwork();
  const { data: profConfig } = useProfitabilityConfig();
  const userId = useSessionUserId();

  const [selected, setSelected] = useState<number>(67);

  // All live opportunities the classifier marks CPU-only (min VRAM 0) — the
  // same engine + profitability config the Opportunities view runs.
  const cpuOpps = mergeOpportunities(snap, profConfig).filter(
    (o) => (o.minVramGb ?? 0) <= 0
  );

  // Picker rows: hand-verified profiles pinned first (stable order), then the
  // rest of the CPU-classified field by score.
  const profileNetuids = new Set(CPU_PROFILES.map((p) => p.netuid));
  const pinned = CPU_PROFILES.map((p) => ({
    netuid: p.netuid,
    name: snap?.subnets.find((s) => s.netuid === p.netuid)?.name ?? `SN${p.netuid}`,
    opp: cpuOpps.find((o) => o.netuid === p.netuid),
    verified: true,
  }));
  const rest = cpuOpps
    .filter((o) => !profileNetuids.has(o.netuid))
    .map((o) => ({ netuid: o.netuid, name: o.subnetName, opp: o, verified: false }));
  const pickerRows = [...pinned, ...rest];

  // Restore the miner's last picked subnet across visits. Deferred past the
  // hydration pass so SSR markup stays deterministic.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(PICKER_KEY);
    } catch {
      /* ignore */
    }
    if (!saved) return;
    const n = parseInt(saved, 10);
    if (Number.isFinite(n) && n > 0) {
      setTimeout(() => setSelected(n), 0);
    }
  }, []);

  const pick = (netuid: number) => {
    setSelected(netuid);
    try {
      localStorage.setItem(PICKER_KEY, String(netuid));
    } catch {
      /* private mode — selection stays in-memory */
    }
  };

  // --- Selected subnet data ---------------------------------------------------
  const netuid = selected;
  const profile =
    CPU_PROFILES.find((p) => p.netuid === netuid) ?? genericProfile(netuid, `SN${netuid}`);
  const opp = cpuOpps.find((o) => o.netuid === netuid);
  const sn = snap?.subnets.find((s) => s.netuid === netuid);
  const name = sn?.name ?? opp?.subnetName ?? `SN${netuid}`;
  const isDeep = Boolean(profile.deep);

  const tao = snap?.taoPriceUsd ?? null;
  const burnTao = sn?.burnCostTao ?? null;
  const burnUsd = burnTao != null && tao ? burnTao * tao : null;
  const alpha = sn?.movingPrice ?? null;
  const minerEm = sn?.minerEmissionTaoPerDay ?? null;
  const seatsUsed = sn?.minersCount ?? null;
  const seatsMax = sn?.maxUids ?? null;
  const rewarded = sn?.rewardedMiners ?? null;

  const phases = isDeep ? DEEP_SN67_PHASES : genericPhases({ profile, name, netuid, opp, burnTao, burnUsd });
  const { done, toggle, loaded } = usePhaseProgress(userId, netuid);
  const doneCount = phases.filter((p) => done.includes(p.id)).length;
  const pct = Math.round((doneCount / phases.length) * 100);

  const baseNet = isDeep
    ? null
    : (opp?.netMonthlyUsd ?? opp?.profitability?.scenarios?.base?.netMonthlyUsd ?? null);
  const bearNet = isDeep ? null : (opp?.profitability?.scenarios?.bear?.netMonthlyUsd ?? null);
  const bullNet = isDeep ? null : (opp?.profitability?.scenarios?.bull?.netMonthlyUsd ?? null);

  const links: [string, string][] = [
    ...profile.links,
    ["docs.bittensor.com", "https://docs.bittensor.com"],
    ["taostats.io", "https://taostats.io"],
  ];

  return (
    <div className="space-y-6">
      {/* Header + progress */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-eyebrow text-muted-foreground">Section · 05 · CPU mining guide</p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {isDeep ? (
              <>
                The complete Harnyx (SN67) path — the cheapest live entry in the network:
                no GPU, no always-on box, one ~$12 burn. Follow the phases in order; the
                register step is gated on Validator Lab by design.
              </>
            ) : (
              <>
                The CPU path for {name} (SN{netuid}) — no GPU required. Live economics
                below, the universal 9-phase order, and honest pointers to the
                subnet&apos;s own docs where deep research hasn&apos;t been done yet.
              </>
            )}
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-right">
          <p className="mono tabular text-lg font-semibold">
            {loaded ? `${doneCount} of ${phases.length} phases` : "…"}
          </p>
          <div className="mt-1.5 h-1.5 w-40 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Subnet picker — every CPU-classified subnet, verified profiles first */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4 text-primary" aria-hidden="true" />
            Pick a CPU subnet
            <span className="text-eyebrow font-normal text-muted-foreground">
              {pickerRows.length} live · verified first
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pickerRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Waiting for the chain scan… CPU-classified subnets appear here once the
              snapshot lands.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pickerRows.map((r) => {
                const isSel = r.netuid === netuid;
                const net = r.opp?.netMonthlyUsd;
                return (
                  <button
                    key={r.netuid}
                    onClick={() => pick(r.netuid)}
                    className={`group inline-flex min-w-0 max-w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition-colors ${
                      isSel
                        ? "border-primary/60 bg-primary/10"
                        : "border-border/60 bg-card/50 hover:border-primary/40"
                    }`}
                  >
                    <span
                      className={`mono shrink-0 text-xs tabular ${isSel ? "text-primary" : "text-muted-foreground"}`}
                    >
                      SN{r.netuid}
                    </span>
                    <span
                      className={`min-w-0 truncate text-sm ${isSel ? "font-medium text-foreground" : "text-foreground/80"}`}
                    >
                      {r.name}
                    </span>
                    {r.verified ? (
                      <span
                        className="shrink-0 rounded border border-success/40 bg-success/10 px-1 py-px text-[10px] font-medium uppercase tracking-wide text-success"
                        title="hand-verified repo + mechanics"
                      >
                        verified
                      </span>
                    ) : null}
                    {net != null ? (
                      <span className="mono hidden shrink-0 text-xs tabular text-muted-foreground sm:inline">
                        ${Math.round(net)}/mo
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {isDeep
              ? "SN67 is the deep guide — every weight, gate number and command below was researched against the live subnet."
              : `${name} runs the same 9-phase order with live economics; the phases flag exactly where to verify subnet-specific details in its own docs before burning.`}
          </p>
        </CardContent>
      </Card>

      {/* Golden order banner */}
      <div className="relative overflow-hidden rounded-xl border border-warning/40 bg-warning/[0.07] px-4 py-3.5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-foreground">
              Golden order — register LAST.
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Never burn before the Validator Lab gate is green. The proof is real: slow agent{" "}
              <span className="mono tabular">41.9</span> ={" "}
              <span className="font-medium text-warning">weak — don&apos;t burn</span>;
              tuned agent <span className="mono tabular">62.1</span> ={" "}
              <span className="font-medium text-success">competitive ≈ p90 — clear</span>.
              Everything up to Phase 5 is free; the burn is one click and irreversible.
            </p>
          </div>
        </div>
      </div>

      {/* Live per-subnet economics strip */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4 text-primary" aria-hidden="true" />
            SN{netuid} {name} live economics
            <span
              className={
                snap?.isLive
                  ? "pulse-dot ml-1 text-success"
                  : "ml-1 h-2 w-2 rounded-full bg-warning"
              }
              aria-hidden="true"
            />
            <span className="text-eyebrow font-normal text-muted-foreground">
              {snap?.isLive ? "live" : "syncing…"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          <Stat
            label="Seats"
            value={
              seatsUsed != null && seatsMax != null ? `${seatsUsed}/${seatsMax}` : "—"
            }
            sub={seatsUsed != null && seatsMax != null && seatsUsed >= seatsMax ? "full — burn is the entry" : "checking…"}
          />
          <Stat label="Earning miners" value={rewarded != null ? String(rewarded) : "—"} sub="rewarded last epoch" />
          <Stat
            label="Burn cost"
            value={burnTao != null ? `${burnTao.toFixed(4)} τ` : "—"}
            sub={burnUsd != null ? `≈ $${burnUsd.toFixed(0)} one-off` : "one-off, floats"}
          />
          <Stat label="Alpha price" value={alpha != null ? alpha.toFixed(6) : "—"} sub="τ per α — watch the trend" />
          <Stat
            label="Miner emission"
            value={minerEm != null ? `${minerEm.toFixed(2)} τ/day` : "—"}
            sub="to miners, whole subnet"
          />
          <Stat label="TAO price" value={tao != null ? `$${tao.toFixed(2)}` : "—"} sub="USD — sizes the budget" />
        </CardContent>
      </Card>

      {/* Phase cards */}
      <div className="space-y-3">
        {phases.map((phase) => {
          const isDone = done.includes(phase.id);
          return (
            <Card key={phase.id} className={isDone ? "border-success/30" : undefined}>
              <Collapsible>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2 min-w-0 flex-1 justify-start gap-2 px-2 sm:flex-none"
                      >
                        <ChevronDown
                          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180"
                          aria-hidden="true"
                        />
                        <span
                          className={`mono shrink-0 text-xs tabular ${isDone ? "text-success" : "text-muted-foreground"}`}
                        >
                          P{phase.n}
                        </span>
                        <span
                          className={`min-w-0 whitespace-normal break-words text-left text-sm font-medium ${isDone ? "text-muted-foreground line-through" : ""}`}
                        >
                          {phase.title}
                        </span>
                      </Button>
                    </CollapsibleTrigger>
                    <div className="ml-auto flex items-center gap-2">
                      <CostBadge tier={phase.cost} />
                      <Button
                        variant={isDone ? "outline" : "secondary"}
                        size="sm"
                        className={
                          isDone
                            ? "h-7 gap-1 border-success/40 text-success hover:text-success"
                            : "h-7"
                        }
                        onClick={() => toggle(phase.id)}
                      >
                        {isDone ? (
                          <>
                            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Done
                          </>
                        ) : (
                          "Mark done"
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-3.5 pt-0">
                    <p className="text-sm leading-relaxed text-muted-foreground">{phase.why}</p>
                    <ol className="space-y-1.5">
                      {phase.steps.map((step, i) => (
                        <li key={i} className="flex gap-2.5 text-sm">
                          <span className="mono mt-0.5 shrink-0 text-xs tabular text-primary">
                            {i + 1}.
                          </span>
                          <span className="min-w-0">{step}</span>
                        </li>
                      ))}
                    </ol>
                    {phase.commands ? (
                      <div className="space-y-1.5">
                        {phase.commands.map((cmd, i) => (
                          <CopyCmd key={i} cmd={cmd} />
                        ))}
                      </div>
                    ) : null}
                    <div className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2">
                      <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <p className="text-xs leading-relaxed text-foreground/80">
                        <span className="font-medium">In this app:</span> {phase.appNote}
                      </p>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      {/* Validator Lab gate card */}
      <Card className="border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gavel className="h-4 w-4 text-primary" aria-hidden="true" />
            The pre-burn gate — Validator Lab (nav 04)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3.5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {isDeep ? (
              <>
                Validator Lab mines the validator&apos;s real behavior from the repo and simulates
                your agent before the burn. Same discipline as the SN64 pre-flight. The two
                outcomes, from the actual run:
              </>
            ) : (
              <>
                Validator Lab syncs per netuid — sync <span className="mono tabular">{netuid}</span>{" "}
                and simulate your miner before the burn. The gate itself is proven on SN67;
                the two outcomes from that pre-flight:
              </>
            )}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-lg border border-warning/40 bg-warning/[0.06] px-3.5 py-3">
              <p className="text-eyebrow text-warning">slow agent — don&apos;t burn</p>
              <p className="mono mt-1 text-2xl font-semibold tabular">41.9</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                240 s · $0.60/1M · 72% quality → <span className="font-medium">weak</span>,
                deep-under-median. burning this = donating $12.
              </p>
            </div>
            <div className="rounded-lg border border-success/40 bg-success/[0.06] px-3.5 py-3">
              <p className="text-eyebrow text-success">tuned agent — clear to burn</p>
              <p className="mono mt-1 text-2xl font-semibold tabular">62.1</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                25 s · $0.45/1M · 80% · 25 tps → <span className="font-medium">competitive</span>{" "}
                ≈ p90, 1.87× median. green gate.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Rule: simulate → iterate → only burn on <span className="font-medium text-foreground">competitive</span> or better.
            </p>
            <Button size="sm" className="gap-1.5" onClick={() => onNavigate("judge")}>
              Open Validator Lab
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Budget at a glance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-primary" aria-hidden="true" />
            Budget at a glance
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2.5 sm:grid-cols-3">
          <div className="rounded-lg border border-border/60 bg-card/50 px-3.5 py-3">
            <p className="text-eyebrow text-muted-foreground/70">Entry (burn)</p>
            <p className="mono mt-1 text-xl font-semibold tabular">
              {burnUsd != null ? `~$${burnUsd.toFixed(0)}` : "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              one-off, irreversible, floats with seat demand
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-card/50 px-3.5 py-3">
            <p className="text-eyebrow text-muted-foreground/70">Hardware</p>
            <p className="mono mt-1 text-xl font-semibold tabular">
              {profile.netuid === 75 ? "$10–60/mo" : "$0–20/mo"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{profile.hardwareNote}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-card/50 px-3.5 py-3">
            <p className="text-eyebrow text-muted-foreground/70">Net expectation</p>
            <p className="mono mt-1 text-xl font-semibold tabular">
              {baseNet != null ? `${baseNet < 0 ? "−" : "~"}$${Math.abs(Math.round(baseNet))}/mo` : "~$100/mo"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {baseNet != null
                ? `base case · bear ${bearNet != null ? `${bearNet < 0 ? "−" : "+"}$${Math.abs(Math.round(bearNet))}` : "—"} · bull ${bullNet != null ? `${bullNet < 0 ? "−" : "+"}$${Math.abs(Math.round(bullNet))}` : "—"} (scanner engine)`
                : "base case · bear −$37 · bull +$179 (scanner engine)"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Honest boundaries */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-primary" aria-hidden="true" />
            What this app deliberately does NOT do on this path
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
              <span>
                <span className="font-medium text-foreground">No CPU pod provisioning</span> —
                the Deploy Wizard rents GPU pods only (CUDA is hardcoded end-to-end). For CPU
                subnets that&apos;s fine: none of them need rented GPUs.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
              <span>
                <span className="font-medium text-foreground">No miner submission</span> —
                the app has no script-upload or miner-launch path and doesn&apos;t need one;
                that&apos;s each subnet&apos;s own CLI&apos;s job (Phase 7).
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
              <span>
                <span className="font-medium text-foreground">
                  No earnings tracking for self-managed miners
                </span>{" "}
                — My Miners tracks deployments the app provisions itself. A miner you run
                via a subnet&apos;s own tooling is invisible to that ledger; external-miner
                tracking could be added later.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
              <span>
                <span className="font-medium text-foreground">
                  Deep ≠ generic, and the guide says which
                </span>{" "}
                — SN67&apos;s weights and gate numbers are researched; other subnets run the
                same discipline with live economics and explicit &quot;verify in docs&quot;
                flags. No fabricated repos, no invented validator weights.
              </span>
            </li>
          </ul>
          <p className="rounded-lg border border-border/60 bg-muted/30 px-3.5 py-2.5 text-sm text-foreground/85">
            <span className="font-medium">One-line picture:</span> the app decides{" "}
            <span className="italic">where</span> to mine and{" "}
            <span className="italic">whether to burn</span>; your CPU builds the miner;
            the subnet&apos;s platform runs it; the app keeps watching whether the deal is
            still good.
          </p>
        </CardContent>
      </Card>

      {/* Official links */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Official links {isDeep ? "" : `— ${name}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {links.map(([label, href]) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/50 px-3 py-1.5 text-xs text-foreground/85 transition-colors hover:border-primary/40 hover:text-primary"
            >
              {label}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ))}
          {!isDeep && profile.links.length === 0 ? (
            <p className="w-full text-xs text-muted-foreground">
              No hand-verified repo link for this subnet yet — take the repo only from the
              on-chain identity (Subnets view) or the subnet team&apos;s own site.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
