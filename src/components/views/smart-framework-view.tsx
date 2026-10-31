"use client";

// SMART-FRAMEWORK-1 — Operator goal engine view.
// SMART = Specific · Measurable · Achievable · Relevant · Time-bound.
// Turns "I want to earn more from mining" into a tracked, dated, numbered
// objective with milestones — grounded in this platform's real flows
// (subnet registration, GPU miner rollout, host-and-earn onboarding).

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSmartGoals,
  type SmartGoal,
  type SmartMilestone,
} from "@/hooks/use-smart-goals";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Crosshair,
  Plus,
  Pencil,
  Trash2,
  CalendarDays,
  TrendingUp,
  Target,
  ListChecks,
  Sparkles,
  CircleCheck,
} from "lucide-react";

type GoalStatus = SmartGoal["status"];

const STATUS_META: Record<GoalStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "text-muted-foreground border-border" },
  active: { label: "Active", className: "text-primary border-primary/40 bg-primary/10" },
  achieved: { label: "Achieved", className: "text-success border-success/40 bg-success/10" },
  "at-risk": { label: "At risk", className: "text-warning border-warning/40 bg-warning/10" },
  abandoned: { label: "Dropped", className: "text-muted-foreground/60 border-border" },
};

const SMART_LETTERS: { letter: string; word: string; blurb: string }[] = [
  { letter: "S", word: "Specific", blurb: "One concrete outcome — a subnet, an action, a number. Not \"earn more\"." },
  { letter: "M", word: "Measurable", blurb: "A metric that proves it: alpha/day, uptime %, UIDs live." },
  { letter: "A", word: "Achievable", blurb: "Hardware, budget and skills you actually have today." },
  { letter: "R", word: "Relevant", blurb: "Ties to your strategy: emission economics, runway, risk." },
  { letter: "T", word: "Time-bound", blurb: "A deadline and milestones that pace the work." },
];

interface Template {
  id: string;
  name: string;
  hint: string;
  draft: {
    title: string;
    specific: string;
    metric: string;
    target: number;
    current: number;
    achievable: string;
    confidence: number;
    relevant: string;
    deadlineDays: number;
    milestones: SmartMilestone[];
    status: GoalStatus;
  };
}

const TEMPLATES: Template[] = [
  {
    id: "sn53-miner",
    name: "SN53 GPU miner → first α",
    hint: "sglang serving miner, TOPLOC-proven",
    draft: {
      title: "Run a profitable SN53 GPU miner",
      specific: "Deploy the sglang miner stack (Qwen3.6-35B-A3B-FP8, 4×24 GB GPU), register a UID on subnet 53 and keep TOPLOC proofs passing so the validator assigns incentive.",
      metric: "alpha/day",
      target: 50,
      current: 0,
      achievable: "Rent 4× RTX 4090 (or own 141 GB+ VRAM). Burn registration ≈ 0.0005 TAO. Miner connects outbound to wss://api.engy.ai/gw — no open ports needed.",
      confidence: 3,
      relevant: "SN53 pays miners in alpha (~0.033 TAO/α moving price). Building the stack before registering survives the ~1-block immunity window.",
      deadlineDays: 30,
      milestones: [
        { text: "GPU capacity secured (4×24 GB, CUDA 12+)", done: false },
        { text: "sglang server healthy with hidden-states enabled", done: false },
        { text: "Miner key + outbound gateway connection verified", done: false },
        { text: "UID registered on SN53", done: false },
        { text: "First nonzero incentive epoch", done: false },
      ],
      status: "draft",
    },
  },
  {
    id: "first-registration",
    name: "First subnet registration",
    hint: "pick a subnet, burn, hold a UID",
    draft: {
      title: "Register my first subnet UID",
      specific: "Choose one subnet from Miner Fit / Opportunities, confirm its registration window and burn cost, then register the hotkey and hold the UID past immunity.",
      metric: "UIDs registered",
      target: 1,
      current: 0,
      achievable: "Wallet funded with registration burn + small stake. No code required for stake-mined subnets; recipe guides live in Runbook.",
      confidence: 4,
      relevant: "Holding a UID is the entry ticket to every mining strategy — nothing earns before this.",
      deadlineDays: 7,
      milestones: [
        { text: "Subnet selected and mechanics read", done: false },
        { text: "Registration cost checked at current burn", done: false },
        { text: "Registered and UID visible in metagraph", done: false },
      ],
      status: "draft",
    },
  },
  {
    id: "host-earn",
    name: "Host & Earn provider",
    hint: "SN51 lium.io onboarding path",
    draft: {
      title: "Onboard as an SN51 GPU host",
      specific: "List idle GPU capacity on lium.io via the Host & Earn path, pass provider checks and serve the first renter job.",
      metric: "uptime %",
      target: 95,
      current: 0,
      achievable: "One 24 GB GPU, stable connection, docker installed. Follow the Setup Guide section 05e step by step.",
      confidence: 4,
      relevant: "Host income is the lowest-risk lane: no incentive race, rent paid per hour of uptime.",
      deadlineDays: 21,
      milestones: [
        { text: "Provider account + key configured", done: false },
        { text: "Host passed checks and is listed", done: false },
        { text: "First paid rental completed", done: false },
      ],
      status: "draft",
    },
  },
  {
    id: "diversify",
    name: "Diversify emissions",
    hint: "stop single-subnet dependency",
    draft: {
      title: "Earn from 3 subnets simultaneously",
      specific: "Grow from a single-subnet position to three income sources so one deregistration or emission cut cannot zero the operation.",
      metric: "subnets earning",
      target: 3,
      current: 1,
      achievable: "Reuse existing hardware where possible; add CPU-mined subnets from the CPU Guide to avoid new GPU spend.",
      confidence: 3,
      relevant: "Concentration is the top killer seen in the payout audits — top-heavy reward curves can cut a miner to zero within weeks.",
      deadlineDays: 60,
      milestones: [
        { text: "Second subnet chosen and stack built", done: false },
        { text: "Third subnet chosen and stack built", done: false },
        { text: "All three paying for 2 consecutive weeks", done: false },
      ],
      status: "draft",
    },
  },
];

function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function progressPct(goal: SmartGoal): number {
  if (goal.target <= 0) return goal.status === "achieved" ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((goal.current / goal.target) * 100)));
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function SmartFrameworkView() {
  const { goals, isLoading, error, updateGoal, deleteGoal } = useSmartGoals();
  const { toast } = useToast();

  const [filter, setFilter] = useState<"all" | GoalStatus>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SmartGoal | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: goals.length };
    for (const g of goals) c[g.status] = (c[g.status] ?? 0) + 1;
    return c;
  }, [goals]);

  const filtered = useMemo(
    () => (filter === "all" ? goals : goals.filter((g) => g.status === filter)),
    [goals, filter]
  );

  const stats = useMemo(() => {
    const active = goals.filter((g) => g.status === "active" || g.status === "at-risk");
    const avg = active.length
      ? Math.round(active.reduce((s, g) => s + progressPct(g), 0) / active.length)
      : 0;
    const next = goals
      .filter((g) => g.deadline && g.status !== "achieved" && g.status !== "abandoned")
      .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0];
    return { total: goals.length, active: active.length, avg, next };
  }, [goals]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (g: SmartGoal) => {
    setEditing(g);
    setDialogOpen(true);
  };

  const applyTemplate = (t: Template) => {
    const d = t.draft;
    const deadline = new Date(Date.now() + d.deadlineDays * 86_400_000);
    setEditing(null);
    setDialogOpen(true);
    // Hand the pre-filled draft to the dialog through editing==null + a draft seed.
    setSeed({ ...d, deadline: deadline.toISOString().slice(0, 10) });
  };

  const [seed, setSeed] = useState<null | (Template["draft"] & { deadline: string })>(null);

  const toggleMilestone = (g: SmartGoal, idx: number) => {
    const milestones = g.milestones.map((m, i) => (i === idx ? { ...m, done: !m.done } : m));
    updateGoal.mutate(
      { id: g.id, milestones },
      { onError: (e) => toast({ title: "Update failed", description: e.message, variant: "destructive" }) }
    );
  };

  const removeGoal = (g: SmartGoal) => {
    if (confirmDelete !== g.id) {
      setConfirmDelete(g.id);
      setTimeout(() => setConfirmDelete((c) => (c === g.id ? null : c)), 3000);
      return;
    }
    setConfirmDelete(null);
    deleteGoal.mutate(g.id, {
      onSuccess: () => toast({ title: "Goal deleted", description: g.title }),
      onError: (e) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Framework explainer strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {SMART_LETTERS.map((l) => (
          <Card key={l.letter} className="border-border/60 bg-card/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2.5">
                <span className="mono flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-sm font-bold text-primary">
                  {l.letter}
                </span>
                <p className="text-display text-sm font-semibold tracking-tight">{l.word}</p>
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{l.blurb}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stats + actions bar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Crosshair className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span className="mono tabular font-semibold text-foreground/90">{stats.total}</span> goals
          </span>
          <span className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span className="mono tabular font-semibold text-foreground/90">{stats.active}</span> active · avg{" "}
            <span className="mono tabular font-semibold text-foreground/90">{stats.avg}%</span>
          </span>
          {stats.next && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              next: <span className="max-w-44 truncate text-foreground/80">{stats.next.title}</span>
              <span className="mono tabular">· {daysLeft(stats.next.deadline)}d</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select onValueChange={(id) => applyTemplate(TEMPLATES.find((t) => t.id === id)!)} value="">
            <SelectTrigger className="h-9 w-56" aria-label="Start from a template">
              <SelectValue placeholder={<span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Start from template…</span>} />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex flex-col">
                    <span>{t.name}</span>
                    <span className="text-xs text-muted-foreground">{t.hint}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} size="sm" className="h-9">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New goal
          </Button>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {(["all", "active", "draft", "achieved", "at-risk", "abandoned"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "mono rounded-full border px-3 py-1 text-[11px] uppercase tracking-wide transition-colors",
              filter === s
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            {s === "all" ? "All" : STATUS_META[s].label} · {counts[s] ?? 0}
          </button>
        ))}
      </div>

      {/* Loading / error / empty / list */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Card key={i} className="animate-pulse border-border/60">
              <CardContent className="h-48 p-6" />
            </Card>
          ))}
        </div>
      )}

      {!isLoading && error && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <Trash2 className="h-4 w-4" aria-hidden="true" /> Failed to load goals: {error.message}
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && goals.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
              <Target className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-display text-lg font-semibold tracking-tight">No goals yet</p>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
                A goal without a number and a date is a wish. Define your first SMART
                objective — or start from a template built on this platform&apos;s mining flows.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={openCreate} size="sm">
                <Plus className="h-4 w-4" aria-hidden="true" /> Define a goal
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onEdit={() => openEdit(g)}
              onDelete={() => removeGoal(g)}
              confirmDelete={confirmDelete === g.id}
              onToggleMilestone={(idx) => toggleMilestone(g, idx)}
              onUpdateCurrent={(v) =>
                updateGoal.mutate(
                  { id: g.id, current: v },
                  { onError: (e) => toast({ title: "Update failed", description: e.message, variant: "destructive" }) }
                )
              }
              onStatus={(s) =>
                updateGoal.mutate(
                  { id: g.id, status: s },
                  { onError: (e) => toast({ title: "Update failed", description: e.message, variant: "destructive" }) }
                )
              }
              busy={updateGoal.isPending || deleteGoal.isPending}
            />
          ))}
        </div>
      )}

      <GoalDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setSeed(null);
        }}
        editing={editing}
        seed={seed}
        onSaved={(title, created) =>
          toast({
            title: created ? "Goal created" : "Goal updated",
            description: title,
          })
        }
        onError={(e) => toast({ title: "Save failed", description: e.message, variant: "destructive" })}
      />
    </div>
  );
}

/* ---------------------------------- card ---------------------------------- */

function GoalCard({
  goal,
  onEdit,
  onDelete,
  confirmDelete,
  onToggleMilestone,
  onUpdateCurrent,
  onStatus,
  busy,
}: {
  goal: SmartGoal;
  onEdit: () => void;
  onDelete: () => void;
  confirmDelete: boolean;
  onToggleMilestone: (idx: number) => void;
  onUpdateCurrent: (v: number) => void;
  onStatus: (s: GoalStatus) => void;
  busy: boolean;
}) {
  const meta = STATUS_META[goal.status];
  const pct = progressPct(goal);
  const dl = daysLeft(goal.deadline);
  const doneMilestones = goal.milestones.filter((m) => m.done).length;
  const [cur, setCur] = useState(String(goal.current));

  return (
    <Card className="flex flex-col border-border/60 bg-card/50">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-display truncate text-[15px] font-semibold tracking-tight" title={goal.title}>
              {goal.title}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={cn("text-[10px]", meta.className)}>
                {meta.label}
              </Badge>
              {dl !== null && goal.status !== "achieved" && goal.status !== "abandoned" && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    dl < 0
                      ? "text-destructive border-destructive/40"
                      : dl <= 7
                        ? "text-warning border-warning/40"
                        : "text-muted-foreground border-border"
                  )}
                >
                  <CalendarDays className="mr-1 h-3 w-3" aria-hidden="true" />
                  {dl < 0 ? `${-dl}d overdue` : dl === 0 ? "due today" : `${dl}d left`}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label={`Edit ${goal.title}`}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", confirmDelete && "text-destructive")}
              onClick={onDelete}
              disabled={busy}
              aria-label={`Delete ${goal.title}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Measurable */}
        <div>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-eyebrow text-muted-foreground/70">
              {goal.metric || "metric"} · confidence {goal.confidence}/5
            </span>
            <span className="mono tabular text-foreground/90">
              {fmtNum(goal.current)} / {fmtNum(goal.target)}
            </span>
          </div>
          <Progress value={pct} className="mt-2 h-1.5" aria-label={`${pct}% toward target`} />
          <div className="mt-2.5 flex items-center gap-2">
            <Input
              value={cur}
              inputMode="decimal"
              onChange={(e) => setCur(e.target.value)}
              onBlur={() => {
                const v = Number(cur);
                if (Number.isFinite(v) && v !== goal.current) onUpdateCurrent(v);
                else setCur(String(goal.current));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="mono h-7 w-24 text-xs tabular"
              aria-label={`Current ${goal.metric || "value"}`}
            />
            <span className="text-[11px] text-muted-foreground">update current value</span>
            <span className="mono ml-auto text-[11px] tabular text-muted-foreground">{pct}%</span>
          </div>
        </div>

        {/* S / A / R */}
        <div className="flex flex-col gap-1.5 text-xs leading-relaxed">
          {goal.specific && (
            <p className="line-clamp-2 text-muted-foreground">
              <span className="mono mr-1.5 font-semibold text-primary">S</span>
              {goal.specific}
            </p>
          )}
          {goal.achievable && (
            <p className="line-clamp-2 text-muted-foreground">
              <span className="mono mr-1.5 font-semibold text-primary">A</span>
              {goal.achievable}
            </p>
          )}
          {goal.relevant && (
            <p className="line-clamp-2 text-muted-foreground">
              <span className="mono mr-1.5 font-semibold text-primary">R</span>
              {goal.relevant}
            </p>
          )}
        </div>

        {/* Milestones */}
        {goal.milestones.length > 0 && (
          <div>
            <p className="text-eyebrow flex items-center gap-1.5 pb-1.5 text-muted-foreground/70">
              <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
              milestones · {doneMilestones}/{goal.milestones.length}
            </p>
            <div className="flex flex-col gap-1">
              {goal.milestones.map((m, i) => (
                <button
                  key={i}
                  onClick={() => onToggleMilestone(i)}
                  className="group flex items-start gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/40"
                  disabled={busy}
                >
                  <CircleCheck
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0 transition-colors",
                      m.done ? "text-success" : "text-muted-foreground/40 group-hover:text-muted-foreground"
                    )}
                    aria-hidden="true"
                  />
                  <span className={cn(m.done ? "text-muted-foreground/60 line-through" : "text-foreground/90")}>
                    {m.text}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status switcher */}
        <div className="mt-auto flex items-center gap-2 border-t border-border/50 pt-3">
          <span className="text-[11px] text-muted-foreground">set status</span>
          <Select value={goal.status} onValueChange={(s) => onStatus(s as GoalStatus)}>
            <SelectTrigger className="h-7 w-32 text-xs" aria-label="Goal status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_META) as GoalStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

/* --------------------------------- dialog --------------------------------- */

type FormState = {
  title: string;
  specific: string;
  metric: string;
  target: string;
  current: string;
  achievable: string;
  confidence: string;
  relevant: string;
  deadline: string;
  status: GoalStatus;
  milestones: SmartMilestone[];
};

function toForm(g: SmartGoal | null, seed: Template["draft"] & { deadline: string } | null): FormState {
  if (g) {
    return {
      title: g.title,
      specific: g.specific,
      metric: g.metric,
      target: String(g.target),
      current: String(g.current),
      achievable: g.achievable,
      confidence: String(g.confidence),
      relevant: g.relevant,
      deadline: g.deadline ? g.deadline.slice(0, 10) : "",
      status: g.status,
      milestones: g.milestones,
    };
  }
  if (seed) {
    return {
      title: seed.title,
      specific: seed.specific,
      metric: seed.metric,
      target: String(seed.target),
      current: String(seed.current),
      achievable: seed.achievable,
      confidence: String(seed.confidence),
      relevant: seed.relevant,
      deadline: seed.deadline,
      status: seed.status,
      milestones: seed.milestones,
    };
  }
  return {
    title: "",
    specific: "",
    metric: "",
    target: "",
    current: "0",
    achievable: "",
    confidence: "3",
    relevant: "",
    deadline: "",
    status: "draft",
    milestones: [{ text: "", done: false }],
  };
}

function GoalDialog({
  open,
  onOpenChange,
  editing,
  seed,
  onSaved,
  onError,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: SmartGoal | null;
  seed: Template["draft"] & { deadline: string } | null;
  onSaved: (title: string, created: boolean) => void;
  onError: (e: Error) => void;
}) {
  const { createGoal, updateGoal } = useSmartGoals();
  const [form, setForm] = useState<FormState>(() => toForm(null, null));
  // Re-seed whenever the dialog opens for a different goal/template.
  const [lastKey, setLastKey] = useState("");
  const key = `${editing?.id ?? ""}|${seed?.title ?? ""}|${open}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setForm(toForm(editing, seed));
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    const payload = {
      title: form.title.trim(),
      specific: form.specific,
      metric: form.metric,
      target: Number(form.target) || 0,
      current: Number(form.current) || 0,
      achievable: form.achievable,
      confidence: Number(form.confidence) || 3,
      relevant: form.relevant,
      deadline: form.deadline ? new Date(`${form.deadline}T12:00:00`).toISOString() : null,
      status: form.status,
      milestones: form.milestones.filter((m) => m.text.trim()),
    };
    if (!payload.title) return;
    if (editing) {
      updateGoal.mutate(
        { id: editing.id, ...payload, milestones: payload.milestones },
        {
          onSuccess: () => {
            onSaved(payload.title, false);
            onOpenChange(false);
          },
          onError,
        }
      );
    } else {
      createGoal.mutate(payload, {
        onSuccess: () => {
          onSaved(payload.title, true);
          onOpenChange(false);
        },
        onError,
      });
    }
  };

  const pending = createGoal.isPending || updateGoal.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto custom-scroll sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-display tracking-tight">
            {editing ? "Edit SMART goal" : "Define a SMART goal"}
          </DialogTitle>
          <DialogDescription>
            Five fields separate a plan from a wish. Only the title is required — but the
            number and the date are what make it trackable.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sg-title">Goal</Label>
            <Input
              id="sg-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Run a profitable SN53 GPU miner"
              maxLength={160}
            />
          </div>

          <LetterField letter="S" word="Specific">
            <Textarea
              value={form.specific}
              onChange={(e) => set("specific", e.target.value)}
              placeholder="What exactly will be true when this is done? Name the subnet, the action, the outcome."
              rows={2}
            />
          </LetterField>

          <LetterField letter="M" word="Measurable">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3 flex flex-col gap-1.5 sm:col-span-1">
                <Label htmlFor="sg-metric" className="text-xs text-muted-foreground">Metric</Label>
                <Input
                  id="sg-metric"
                  value={form.metric}
                  onChange={(e) => set("metric", e.target.value)}
                  placeholder="alpha/day"
                  maxLength={80}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sg-target" className="text-xs text-muted-foreground">Target</Label>
                <Input
                  id="sg-target"
                  value={form.target}
                  inputMode="decimal"
                  onChange={(e) => set("target", e.target.value)}
                  placeholder="50"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sg-current" className="text-xs text-muted-foreground">Current</Label>
                <Input
                  id="sg-current"
                  value={form.current}
                  inputMode="decimal"
                  onChange={(e) => set("current", e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          </LetterField>

          <LetterField letter="A" word="Achievable">
            <Textarea
              value={form.achievable}
              onChange={(e) => set("achievable", e.target.value)}
              placeholder="Hardware, budget, skills — what you already have, what you still need."
              rows={2}
            />
            <div className="mt-2 flex items-center gap-3">
              <Label className="text-xs text-muted-foreground">Confidence</Label>
              <Select value={form.confidence} onValueChange={(v) => set("confidence", v)}>
                <SelectTrigger className="h-8 w-40 text-xs" aria-label="Confidence 1 to 5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["1", "2", "3", "4", "5"].map((n) => (
                    <SelectItem key={n} value={n}>
                      {n} / 5 {n === "1" ? "· long shot" : n === "5" ? "· near certain" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </LetterField>

          <LetterField letter="R" word="Relevant">
            <Textarea
              value={form.relevant}
              onChange={(e) => set("relevant", e.target.value)}
              placeholder="Why this matters for the operation — economics, runway, risk reduction."
              rows={2}
            />
          </LetterField>

          <LetterField letter="T" word="Time-bound">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sg-deadline" className="text-xs text-muted-foreground">Deadline</Label>
                <Input
                  id="sg-deadline"
                  type="date"
                  value={form.deadline}
                  onChange={(e) => set("deadline", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v as GoalStatus)}>
                  <SelectTrigger className="h-9 text-xs" aria-label="Status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_META) as GoalStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_META[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-2.5">
              <Label className="text-xs text-muted-foreground">Milestones</Label>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {form.milestones.map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input
                      value={m.text}
                      onChange={(e) =>
                        set(
                          "milestones",
                          form.milestones.map((x, j) => (j === i ? { ...x, text: e.target.value } : x))
                        )
                      }
                      placeholder={`Milestone ${i + 1}`}
                      maxLength={300}
                      className="h-8 text-xs"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => set("milestones", form.milestones.filter((_, j) => j !== i))}
                      aria-label={`Remove milestone ${i + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {form.milestones.length < 12 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-fit text-xs"
                    onClick={() => set("milestones", [...form.milestones, { text: "", done: false }])}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add milestone
                  </Button>
                )}
              </div>
            </div>
          </LetterField>

          <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-4">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || !form.title.trim()}>
              {pending ? "Saving…" : editing ? "Save changes" : "Create goal"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LetterField({
  letter,
  word,
  children,
}: {
  letter: string;
  word: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/50 p-3.5">
      <div className="flex items-center gap-2 pb-2">
        <span className="mono flex h-6 w-6 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-xs font-bold text-primary">
          {letter}
        </span>
        <p className="text-eyebrow text-foreground/80">{word}</p>
      </div>
      {children}
    </div>
  );
}
