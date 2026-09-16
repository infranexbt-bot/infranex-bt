"use client";

/**
 * MECHANICS-1 UI — official mechanics evidence block.
 *
 * Surfaces the curated per-subnet mechanics layer (mechanics.ts): the
 * official reward window, bounty programs, GPU-variety guidance, validated
 * topologies, optimization targets and operational rules — each with
 * verbatim quotes and links to the repos they were verified against.
 * Rendered in the opportunity detail dialog and the runbook reference.
 */

import { Badge } from "@/components/ui/badge";
import { BookOpen, Quote, Target, Zap } from "lucide-react";
import type { SubnetMechanics } from "@/lib/infranex/mechanics";

/** Inline note for the ramp-up stat — explains WHY the ramp is short. */
export function rampWeeksSourceNote(m: SubnetMechanics | null): string | null {
  if (m?.rewardWindowDays == null) return null;
  const w = Math.round((m.rewardWindowDays / 7) * 10) / 10;
  return `official ${m.rewardWindowDays}-day reward window → ~${w} wk to full weight`;
}

/** Compact chip row — for cards/tables. */
export function MechanicsChips({
  mechanics,
  className,
}: {
  mechanics: SubnetMechanics;
  className?: string;
}) {
  const chips: string[] = [];
  if (mechanics.rewardWindowDays != null)
    chips.push(`${mechanics.rewardWindowDays}-day reward window`);
  if (mechanics.bountyQuote) chips.push("First-inference bounties");
  if (mechanics.gpuVariety) chips.push("GPU variety advised");
  if (chips.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className ?? ""}`}>
      {chips.map((c) => (
        <Badge
          key={c}
          variant="outline"
          className="border-primary/30 bg-primary/5 px-1.5 py-0 text-[9px] font-medium text-primary"
        >
          {c}
        </Badge>
      ))}
    </div>
  );
}

/** Full evidence block — for the detail dialog + runbook. */
export function OfficialMechanicsBlock({
  mechanics,
}: {
  mechanics: SubnetMechanics;
}) {
  return (
    <div className="rounded-lg border border-primary/25 bg-primary/[0.04] px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-eyebrow text-[10px] text-primary">
        <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
        Official mechanics — verified against {mechanics.subnetName}&apos;s own repos
      </p>

      {/* Reward window — the number that replaced the ramp heuristic */}
      {mechanics.rewardWindowDays != null && (
        <div className="mt-2">
          <p className="text-xs font-medium">
            Reward window: {mechanics.rewardWindowDays} days{" "}
            <span className="font-normal text-muted-foreground">
              → newcomer ramp ≈ {Math.round((mechanics.rewardWindowDays / 7) * 10) / 10} wk
              (chain-window math, not the generic bond-EMA guess)
            </span>
          </p>
          {mechanics.rewardWindowQuote && (
            <p className="mt-1 border-l-2 border-primary/30 pl-2 text-[11px] italic text-muted-foreground">
              &ldquo;{mechanics.rewardWindowQuote}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* Bounties */}
      {mechanics.bountyQuote && (
        <div className="mt-2">
          <p className="flex items-center gap-1 text-xs font-medium">
            <Zap className="h-3 w-3 text-primary" aria-hidden="true" /> Bounty path
          </p>
          <p className="mt-1 border-l-2 border-primary/30 pl-2 text-[11px] italic text-muted-foreground">
            &ldquo;{mechanics.bountyQuote}&rdquo;
          </p>
        </div>
      )}

      {/* GPU variety */}
      {mechanics.gpuVariety && (
        <div className="mt-2">
          <p className="text-xs font-medium">GPU-variety guidance</p>
          <p className="mt-1 border-l-2 border-primary/30 pl-2 text-[11px] italic text-muted-foreground">
            &ldquo;{mechanics.gpuVariety.quote}&rdquo;
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {mechanics.gpuVariety.catalog.slice(0, 10).map((g) => (
              <Badge
                key={g}
                variant="outline"
                className="border-border/60 bg-background/60 px-1.5 py-0 text-[9px] text-muted-foreground"
              >
                {g}
              </Badge>
            ))}
            {mechanics.gpuVariety.catalog.length > 10 && (
              <Badge
                variant="outline"
                className="border-border/60 bg-background/60 px-1.5 py-0 text-[9px] text-muted-foreground"
              >
                +{mechanics.gpuVariety.catalog.length - 10} more supported
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Validated topologies */}
      {mechanics.validatedTopologies && mechanics.validatedTopologies.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium">Validated topologies</p>
          <ul className="mt-1 space-y-0.5">
            {mechanics.validatedTopologies.map((t) => (
              <li key={t} className="text-[11px] text-muted-foreground">
                · {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Optimization targets */}
      {mechanics.optimizationTargets.length > 0 && (
        <div className="mt-2">
          <p className="flex items-center gap-1 text-xs font-medium">
            <Target className="h-3 w-3 text-primary" aria-hidden="true" /> What actually
            moves rewards
          </p>
          <ol className="mt-1 space-y-0.5">
            {mechanics.optimizationTargets.map((t, i) => (
              <li key={t} className="text-[11px] text-muted-foreground">
                {i + 1}. {t}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Operational rules */}
      {mechanics.operations.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium">Operational rules</p>
          <div className="mt-1 space-y-1.5">
            {mechanics.operations.map((op) => (
              <div key={op.title}>
                <p className="text-[11px] font-medium text-foreground/90">{op.title}</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {op.detail}
                </p>
                {op.quote && (
                  <p className="mt-0.5 border-l-2 border-primary/30 pl-2 text-[11px] italic text-muted-foreground">
                    &ldquo;{op.quote}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sources */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-primary/15 pt-1.5">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
          <Quote className="h-3 w-3" aria-hidden="true" /> Verified {mechanics.curatedAt}
        </span>
        {mechanics.sources.map((s) => (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-muted-foreground underline decoration-dotted hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            {s.label}
          </a>
        ))}
      </div>
    </div>
  );
}
