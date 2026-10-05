"use client";

// MINER-FIT VIEW — 4-question wizard → honest personal shortlist.
// Non-technical first: plain-English options, plain-English reasons.
import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNetwork, mergeOpportunities } from "@/hooks/use-network";
import { useProfitabilityConfig } from "@/hooks/use-profitability";
import { useSubnetOverrides } from "@/hooks/use-subnet-overrides";
import {
  computeMinerFit,
  MINER_FIT_STORAGE_KEY,
  type MinerFitProfile,
  type MinerFitResult,
} from "@/lib/infranex/miner-fit";
import { cn } from "@/lib/utils";
import {
  UserCheck,
  Wallet,
  Cpu,
  Clock,
  Sparkles,
  RotateCcw,
  CircleCheck,
  TriangleAlert,
  CircleX,
  ArrowRight,
  PiggyBank,
} from "lucide-react";
import type { Opportunity, ViewKey } from "@/lib/infranex/types";

interface FitViewProps {
  onSelectOpportunity: (o: Opportunity) => void;
  onStartMining?: (o: Opportunity) => void;
  onNavigate?: (v: ViewKey) => void;
}

type QuestionKey = keyof MinerFitProfile;

const QUESTIONS: {
  key: QuestionKey;
  title: string;
  sub: string;
  icon: typeof UserCheck;
  options: { value: string; label: string; hint: string }[];
}[] = [
  {
    key: "techLevel",
    title: "How technical are you?",
    sub: "Honest answer works best — this decides which subnets are realistic.",
    icon: UserCheck,
    options: [
      { value: "none", label: "Not technical", hint: "I don't write code and prefer not to touch terminals" },
      { value: "basic", label: "I can follow recipes", hint: "Copy-paste commands, install things, read English" },
      { value: "coder", label: "I code", hint: "Comfortable with Python / JavaScript / Docker" },
    ],
  },
  {
    key: "hardware",
    title: "What hardware do you have?",
    sub: "Pick the biggest thing you own or plan to own.",
    icon: Cpu,
    options: [
      { value: "none", label: "Nothing yet", hint: "No server, no GPU — I'd rent or buy later" },
      { value: "cpu-vps", label: "A small server / VPS", hint: "CPU box without a gaming GPU (~$30–50/mo to rent)" },
      { value: "gpu-24gb", label: "One gaming GPU (24 GB)", hint: "RTX 3090 / 4090 class" },
      { value: "gpu-80gb", label: "Datacenter GPU (80 GB)", hint: "A100 / H100 class" },
      { value: "gpu-140gb", label: "Multi-GPU rig / farm", hint: "Several big GPUs totalling 141 GB+" },
    ],
  },
  {
    key: "budget",
    title: "Monthly running budget?",
    sub: "Rent, power and infrastructure — separate from hardware purchase.",
    icon: Wallet,
    options: [
      { value: "lt100", label: "Under $100/mo", hint: "Keep fixed costs tiny" },
      { value: "500", label: "Up to $500/mo", hint: "One rented GPU or a solid VPS setup" },
      { value: "2000plus", label: "$2,000+/mo", hint: "Serious run-rate, farm territory" },
    ],
  },
  {
    key: "hoursPerWeek",
    title: "Hours per week can you spend?",
    sub: "Every subnet needs some attention — how much is honest for you?",
    icon: Clock,
    options: [
      { value: "0", label: "Almost zero", hint: "Truly passive — I check in once a month" },
      { value: "2-4", label: "2–4 hours", hint: "A little weekly maintenance" },
      { value: "10", label: "10+ hours", hint: "I'll actively work on it" },
    ],
  },
];

const DEFAULT_PROFILE: MinerFitProfile = {
  techLevel: "none",
  budget: "lt100",
  hardware: "none",
  hoursPerWeek: "0",
};

const OPTION_KEYS: Record<QuestionKey, MinerFitProfile[QuestionKey][]> = {
  techLevel: ["none", "basic", "coder"],
  hardware: ["none", "cpu-vps", "gpu-24gb", "gpu-80gb", "gpu-140gb"],
  budget: ["lt100", "500", "2000plus"],
  hoursPerWeek: ["0", "2-4", "10"],
};

export function FitView({ onSelectOpportunity, onStartMining }: FitViewProps) {
  const [profile, setProfile] = useState<MinerFitProfile | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<MinerFitProfile>({ ...DEFAULT_PROFILE });
  const { data: snap } = useNetwork();
  const { data: profConfig } = useProfitabilityConfig();
  const { data: overrides } = useSubnetOverrides();
  const opportunities = useMemo(
    () => mergeOpportunities(snap, profConfig, overrides),
    [snap, profConfig, overrides]
  );

  // Restore a saved profile — the wizard is skippable for return visits.
  // Deferred past the hydration pass so SSR markup stays deterministic.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(MINER_FIT_STORAGE_KEY); } catch { /* ignore */ }
    if (!saved) return;
    const t = setTimeout(() => {
      try {
        const parsed = JSON.parse(saved!) as MinerFitProfile;
        if (parsed.techLevel && parsed.hardware && parsed.budget && parsed.hoursPerWeek) {
          setProfile(parsed);
          setStep(QUESTIONS.length);
        }
      } catch { /* ignore */ }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const report = useMemo(
    () => (profile ? computeMinerFit(opportunities, profile, snap?.taoPriceUsd) : null),
    [opportunities, profile, snap?.taoPriceUsd]
  );

  const choose = (key: QuestionKey, value: string) => {
    const next = { ...answers, [key]: value } as MinerFitProfile;
    setAnswers(next);
    if (step + 1 < QUESTIONS.length) {
      setStep(step + 1);
    } else {
      setProfile(next);
      setStep(QUESTIONS.length);
      try { localStorage.setItem(MINER_FIT_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    }
  };

  const retake = () => {
    setProfile(null);
    setStep(0);
    setAnswers({ ...DEFAULT_PROFILE });
    try { localStorage.removeItem(MINER_FIT_STORAGE_KEY); } catch { /* ignore */ }
  };

  // ---------- Wizard ----------
  if (!report) {
    const q = QUESTIONS[step];
    const QIcon = q.icon;
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-center gap-2" aria-label={`Question ${step + 1} of ${QUESTIONS.length}`}>
          {QUESTIONS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i < step ? "w-8 bg-success" : i === step ? "w-12 bg-primary" : "w-8 bg-muted"
              )}
            />
          ))}
        </div>
        <Card>
          <CardContent className="p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
                <QIcon className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <p className="text-eyebrow text-muted-foreground">
                  Question {step + 1} of {QUESTIONS.length}
                </p>
                <h2 className="text-display text-xl font-bold">{q.title}</h2>
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{q.sub}</p>
            <div className="mt-5 grid gap-3">
              {q.options.map((opt) => {
                const selected = answers[q.key] === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => choose(q.key, opt.value)}
                    className={cn(
                      "group flex min-h-[72px] items-center gap-4 rounded-xl border p-4 text-left transition-all",
                      "hover:border-primary/50 hover:bg-primary/5",
                      selected ? "border-primary bg-primary/10" : "border-border bg-card"
                    )}
                  >
                    <div className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      selected ? "border-primary bg-primary" : "border-muted-foreground/40"
                    )}>
                      {selected && <CircleCheck className="h-4 w-4 text-primary-foreground" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.hint}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            {step > 0 && (
              <Button variant="ghost" size="sm" className="mt-4" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------- Results ----------
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-display text-lg font-bold">Your personal fits</h2>
            <p className="text-xs text-muted-foreground">
              {report.scanned} live subnets scanned · profile:{" "}
              {QUESTIONS[0].options.find((o) => o.value === report.profile.techLevel)?.label.toLowerCase()} ·{" "}
              {QUESTIONS[1].options.find((o) => o.value === report.profile.hardware)?.label.toLowerCase()} ·{" "}
              {QUESTIONS[2].options.find((o) => o.value === report.profile.budget)?.label.toLowerCase()} ·{" "}
              {QUESTIONS[3].options.find((o) => o.value === report.profile.hoursPerWeek)?.label.toLowerCase()}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={retake}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" /> Retake
        </Button>
      </div>

      {report.fits.length === 0 && report.stretch.length === 0 && (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">
              No subnet fits this profile today — that is an honest answer, not a bug.
              Loosen one answer (budget, hardware or hours) and retake, or consider the
              staking baseline below.
            </p>
          </CardContent>
        </Card>
      )}

      {/* FITS */}
      {report.fits.length > 0 && (
        <section aria-label="Top fits">
          <h3 className="text-eyebrow mb-3 text-muted-foreground">Top fits — start here</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {report.fits.map((r) => (
              <FitCard key={r.netuid} r={r} kind="fit"
                onSelectOpportunity={onSelectOpportunity} onStartMining={onStartMining} />
            ))}
          </div>
        </section>
      )}

      {/* STRETCH */}
      {report.stretch.length > 0 && (
        <section aria-label="Close but one blocker">
          <h3 className="text-eyebrow mb-3 text-muted-foreground">Close — one fixable blocker</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {report.stretch.map((r) => (
              <FitCard key={r.netuid} r={r} kind="stretch"
                onSelectOpportunity={onSelectOpportunity} onStartMining={onStartMining} />
            ))}
          </div>
        </section>
      )}

      {/* EXCLUDED SAMPLES */}
      {report.excludedSamples.length > 0 && (
        <section aria-label="Excluded examples">
          <h3 className="text-eyebrow mb-3 text-muted-foreground">
            Honest exclusions — {report.excludedCount} subnets don&apos;t fit you today. Worst offenders:
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {report.excludedSamples.map((r) => (
              <Card key={r.netuid} className="border-border/50">
                <CardContent className="flex items-start gap-3 p-4">
                  <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      SN{r.netuid} · {r.subnetName}
                    </p>
                    {r.blockers.map((b, i) => (
                      <p key={i} className="text-xs text-muted-foreground">— {b}</p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* STAKING BASELINE */}
      <Card className="border-primary/25 bg-primary/[0.04]">
        <CardContent className="flex items-start gap-3 p-5">
          <PiggyBank className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">The bar to beat</p>
            <p className="mt-1 text-sm text-muted-foreground">{report.stakingNote}</p>
          </div>
        </CardContent>
      </Card>

      <p className="pb-2 text-xs text-muted-foreground">
        Fits are filtered from live on-chain data (demand, entry odds, costs, profit engine).
        Modeled earnings assume a mid-pack miner — the bottom half of any full subnet earns
        less, and chain signals can&apos;t see off-chain customers.
      </p>
    </div>
  );
}

function FitCard({
  r,
  kind,
  onSelectOpportunity,
  onStartMining,
}: {
  r: MinerFitResult;
  kind: "fit" | "stretch";
  onSelectOpportunity: (o: Opportunity) => void;
  onStartMining?: (o: Opportunity) => void;
}) {
  const [open, setOpen] = useState(false);
  const bandColor =
    r.demandBand === "real-demand"
      ? "text-success border-success/40 bg-success/10"
      : r.demandBand === "emission-funded"
        ? "text-destructive border-destructive/40 bg-destructive/10"
        : "text-warning border-warning/40 bg-warning/10";

  // Fake-but-typed Opportunity for the existing dialog / deploy preselect —
  // the dialog only reads common fields we carry over.
  const stub: Opportunity = {
    id: `opp-live-${r.netuid}`,
    netuid: r.netuid,
    subnetName: r.subnetName,
    subnetSymbol: r.subnetSymbol,
  } as Opportunity;

  return (
    <Card className={cn("h-full", kind === "fit" ? "border-success/30" : "border-warning/30")}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="mono">SN{r.netuid}</Badge>
              <p className="truncate text-display font-bold">{r.subnetName}</p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={cn("rounded-md border px-2 py-0.5 font-medium", bandColor)}>
                {r.demandBand === "real-demand" ? "green demand" : r.demandBand === "emission-funded" ? "red demand" : "amber demand"}
              </span>
              <span className="text-muted-foreground">
                entry chance {r.entryChancePct != null ? `${r.entryChancePct}%` : "—"}
              </span>
              <span className="text-muted-foreground">risk {r.riskLevel}</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className={cn("text-display text-2xl font-bold", kind === "fit" ? "text-success" : "text-warning")}>
              {r.fitScore}
            </p>
            <p className="text-eyebrow text-muted-foreground">fit score</p>
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          {r.monthlyNetUsd != null && r.monthlyNetUsd > 0 ? (
            <p className="text-lg font-bold">
              ≈${Math.round(r.monthlyNetUsd).toLocaleString()}
              <span className="text-xs font-normal text-muted-foreground"> /mo net (modeled)</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Modeled net: —</p>
          )}
        </div>

        <ul className="mt-3 space-y-1.5">
          {r.reasons.map((reason, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
              <span className="text-muted-foreground">{reason}</span>
            </li>
          ))}
          {r.blockers.map((b, i) => (
            <li key={`b${i}`} className="flex items-start gap-2 text-xs">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
              <span className="text-muted-foreground">{b}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={() => setOpen(!open)}
          className="mt-3 text-xs font-medium text-primary hover:underline"
          aria-expanded={open}
        >
          {open ? "Hide" : "What it takes →"}
        </button>
        {open && (
          <div className="mt-2 space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-xs"><span className="font-semibold">Hardware:</span> <span className="text-muted-foreground">{r.needs.hardware}</span></p>
            <p className="text-xs"><span className="font-semibold">Money:</span> <span className="text-muted-foreground">{r.needs.capital}</span></p>
            <p className="text-xs"><span className="font-semibold">Skill:</span> <span className="text-muted-foreground">{r.needs.skill}</span></p>
            <p className="text-xs"><span className="font-semibold">Time:</span> <span className="text-muted-foreground">{r.needs.time}</span></p>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onSelectOpportunity(stub)}>
            Details
          </Button>
          {kind === "fit" && onStartMining && (
            <Button size="sm" onClick={() => onStartMining(stub)}>
              Start mining
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
