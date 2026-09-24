"use client";

// GPU hosting compatibility badge + legend.
//
// Shows one color-coded tier badge per subnet (red = bare metal only,
// amber = TEE, green = clouds OK, ...) with a hover/focus popover that spells
// out what the tier means for an operator.

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle, AlertTriangle } from "lucide-react";
import { COMPAT_TIER_META, type SubnetCompat } from "@/lib/infranex/compat";
import { cn } from "@/lib/utils";

export function CompatBadge({
  compat,
  compact,
}: {
  compat: SubnetCompat;
  compact?: boolean;
}) {
  const meta = COMPAT_TIER_META[compat.tier];
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`GPU compatibility: ${meta.label}. Show details.`}
            className={cn(
              "inline-flex max-w-[220px] items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              meta.badgeClass
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {meta.caveat && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
            <span className="truncate">{compact ? meta.short : meta.label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="w-80 whitespace-normal text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", meta.dotClass)} />
              <p className="font-semibold">{meta.label}</p>
              <span className="ml-auto rounded border border-border/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                {compat.source}
              </span>
            </div>
            <p className="leading-relaxed text-foreground/90">{compat.instructions}</p>
            {compat.requirements.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {compat.requirements.map((r) => (
                  <Badge key={r} variant="outline" className="text-[10px]">
                    {r}
                  </Badge>
                ))}
              </div>
            )}
            {compat.quote && (
              <p className="border-l-2 border-border pl-2 italic text-muted-foreground">
                &ldquo;{compat.quote}&rdquo;
                {compat.evidenceSource && (
                  <span className="mt-0.5 block text-[10px] not-italic">
                    — {compat.evidenceSource}
                  </span>
                )}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Verified {compat.verifiedAt} · {meta.description}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** One-line legend row explaining the tier color system. */
export function CompatLegend() {
  const tiers: Array<[string, string, string]> = [
    ["bare-metal-only", "Bare metal only", "RunPod/Vast banned by the subnet"],
    ["tee-required", "TEE required", "Intel TDX / CC-mode hardware"],
    ["provider-friendly", "Cloud OK", "README ships cloud guides"],
    ["gpu-flexible", "Flexible", "No restriction stated"],
    ["cpu-only", "CPU / non-GPU", "No GPU needed"],
    ["unclear", "Caveats", "Discord-only or no public repo"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {tiers.map(([tier, label, hint]) => {
        const meta = COMPAT_TIER_META[tier as keyof typeof COMPAT_TIER_META];
        return (
          <span
            key={tier}
            title={meta.description}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span className={cn("h-2 w-2 rounded-full", meta.dotClass)} />
            {label}
            <span className="hidden text-[10px] opacity-70 lg:inline">— {hint}</span>
          </span>
        );
      })}
      <HelpCircle className="h-3 w-3 text-muted-foreground" />
    </div>
  );
}
