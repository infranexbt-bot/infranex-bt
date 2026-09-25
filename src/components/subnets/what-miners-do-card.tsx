"use client";

// "WHAT MINERS DO HERE" card — shown inside the subnet requirements dialog,
// directly under the GPU hosting compat card. Answers, in plain English:
//   1. What does this subnet do?        (whatItDoes)
//   2. What exactly does the miner do?  (whatMinerDoes — the centerpiece)
//   3. How do validators score you?     (whatValidatorDoes + rewardBasis)
// Backed by SUBNET_JOBS_SEED (subnet-info-1: 96 README-verified, 16 web
// research, 17 chain-identity-only) — the confidence tier is always shown.

import { Badge } from "@/components/ui/badge";
import {
  Briefcase,
  Cpu,
  Network,
  Scale,
  Target,
  BookOpenCheck,
  Globe,
  Link2,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SUBNET_JOBS_SEED, type SubnetJobSeedEntry } from "@/lib/infranex/subnet-jobs-seed";

/** Category → chip tone (subtle border/bg/text). */
const CATEGORY_TONE: Record<string, string> = {
  "AI Training / Fine-tuning": "border-violet-500/40 bg-violet-500/[0.08] text-violet-600 dark:text-violet-400",
  "AI Inference / LLM Serving": "border-sky-500/40 bg-sky-500/[0.08] text-sky-600 dark:text-sky-400",
  "AI Agents / Assistants": "border-fuchsia-500/40 bg-fuchsia-500/[0.08] text-fuchsia-600 dark:text-fuchsia-400",
  "Data / Scraping / Knowledge": "border-cyan-500/40 bg-cyan-500/[0.08] text-cyan-600 dark:text-cyan-400",
  "Prediction Markets / Trading": "border-emerald-500/40 bg-emerald-500/[0.08] text-emerald-600 dark:text-emerald-400",
  "Finance / Market Data": "border-green-500/40 bg-green-500/[0.08] text-green-600 dark:text-green-400",
  "Compute / Decentralized Infra": "border-blue-500/40 bg-blue-500/[0.08] text-blue-600 dark:text-blue-400",
  "Storage": "border-teal-500/40 bg-teal-500/[0.08] text-teal-600 dark:text-teal-400",
  "Media / Creative": "border-pink-500/40 bg-pink-500/[0.08] text-pink-600 dark:text-pink-400",
  "Science / Bio / Health": "border-lime-500/40 bg-lime-500/[0.08] text-lime-600 dark:text-lime-400",
  "Social / Communication": "border-orange-500/40 bg-orange-500/[0.08] text-orange-600 dark:text-orange-400",
  "Gaming / Entertainment": "border-amber-500/40 bg-amber-500/[0.08] text-amber-600 dark:text-amber-400",
  "IoT / Edge": "border-yellow-500/40 bg-yellow-500/[0.08] text-yellow-600 dark:text-yellow-400",
  "Parked / Placeholder / Deprecated": "border-border/60 bg-muted/40 text-muted-foreground",
  "Other": "border-border/60 bg-muted/40 text-muted-foreground",
};

const CONFIDENCE_META: Record<
  SubnetJobSeedEntry["confidence"],
  { label: string; dot: string; icon: typeof BookOpenCheck }
> = {
  readme: {
    label: "README-verified",
    dot: "bg-emerald-500",
    icon: BookOpenCheck,
  },
  research: {
    label: "Web research",
    dot: "bg-amber-500",
    icon: Globe,
  },
  "chain-only": {
    label: "Chain identity only",
    dot: "bg-slate-400",
    icon: Link2,
  },
};

function Block({
  icon,
  label,
  children,
  emphasize,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border p-3", emphasize ? "border-primary/25 bg-primary/[0.04]" : "border-border/60 bg-card/40")}>
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon}
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className={cn("leading-relaxed", emphasize ? "text-sm text-foreground/95" : "text-xs text-muted-foreground")}>
        {children}
      </p>
    </div>
  );
}

export function WhatMinersDoCard({ netuid }: { netuid: number }) {
  const job = SUBNET_JOBS_SEED[netuid];

  if (!job) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        No capability profile documented yet for subnet {netuid} — check the subnet&apos;s repo or Discord.
      </div>
    );
  }

  const conf = CONFIDENCE_META[job.confidence] ?? CONFIDENCE_META["chain-only"];
  const ConfIcon = conf.icon;
  const tone = CATEGORY_TONE[job.category] ?? CATEGORY_TONE.Other;
  const parked = job.category === "Parked / Placeholder / Deprecated";
  const repoSlug = job.confidence === "readme" && job.source && job.source !== "web" && job.source !== "chain" ? job.source : null;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/60 bg-card/40 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Briefcase className="h-4 w-4 shrink-0" />
          <p className="text-sm font-semibold">What miners do here</p>
          <Badge variant="outline" className={cn("ml-auto text-[10px]", tone)}>
            {job.category}
          </Badge>
        </div>

        {parked ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {job.whatMinerDoes} {job.whatItDoes}
          </p>
        ) : (
          <div className="mt-3 space-y-2.5">
            <Block icon={<Network className="h-3 w-3 text-muted-foreground" />} label="The subnet">
              {job.whatItDoes}
            </Block>
            <Block
              icon={<Cpu className="h-3 w-3 text-primary" />}
              label="The miner's job"
              emphasize
            >
              {job.whatMinerDoes}
            </Block>
            <div className="flex flex-wrap gap-1.5">
              {job.minerWorkType && (
                <Badge variant="outline" className="text-[10px]">
                  {job.minerWorkType}
                </Badge>
              )}
              {job.rewardBasis && (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Target className="h-2.5 w-2.5" />
                  rewards: {job.rewardBasis}
                </Badge>
              )}
            </div>
            {job.whatValidatorDoes && (
              <Block icon={<Scale className="h-3 w-3 text-muted-foreground" />} label="How validators score you">
                {job.whatValidatorDoes}
              </Block>
            )}
          </div>
        )}

        {/* Evidence tier footer */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", conf.dot)} />
            <ConfIcon className="h-3 w-3" />
            {conf.label}
          </span>
          {repoSlug && <span className="text-[10px]">· {repoSlug}</span>}
        </div>
      </div>
    </div>
  );
}
