"use client";

/**
 * Hosting-constraint chips — surfaces what the subnet's own repo README
 * demands of the hosting environment (bare metal/VM only, TEE/TDX required,
 * unique static IP + 1:1 port mapping). Data comes from the GitHub scraper
 * (SubnetOverride.hostingRequirements), so the UI can show WHY with quoted
 * evidence lines and a link to the source repo.
 */

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { HostingRequirements } from "@/lib/infranex/github-scraper";

export function hostingFlags(hosting: HostingRequirements): string[] {
  const flags: string[] = [];
  if (hosting.bareMetalOnly) flags.push("Bare metal/VM only");
  if (hosting.teeRequired) flags.push("TEE (Intel TDX)");
  if (hosting.staticIpRequired) flags.push("Static IP + 1:1 ports");
  return flags;
}

/** Compact inline chips — for grid cards and table cells. */
export function HostingChips({
  hosting,
  source,
  className,
}: {
  hosting: HostingRequirements;
  source?: string | null;
  className?: string;
}) {
  const flags = hostingFlags(hosting);
  if (flags.length === 0) return null;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex flex-wrap items-center gap-1", className)}>
            {flags.map((f) => (
              <Badge
                key={f}
                variant="outline"
                className="border-warning/40 bg-warning/5 px-1.5 py-0 text-[9px] font-medium text-warning"
              >
                {f}
              </Badge>
            ))}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-medium">Hosting requirements (from repo README)</p>
          {hosting.notes?.slice(0, 2).map((n, i) => (
            <p key={i} className="mt-1 text-muted-foreground">
              &ldquo;{n}&rdquo;
            </p>
          ))}
          {source && (
            <p className="mt-1 truncate text-[10px] text-muted-foreground/70">
              Source: {source}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Full warning block — for the detail dialog. */
export function HostingWarningBlock({
  hosting,
  source,
}: {
  hosting: HostingRequirements;
  source?: string | null;
}) {
  const flags = hostingFlags(hosting);
  if (flags.length === 0) return null;
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2">
      <p className="text-eyebrow text-[10px] text-warning">
        Hosting requirements — not a cloud-rental subnet
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {flags.map((f) => (
          <Badge
            key={f}
            variant="outline"
            className="border-warning/40 bg-background/60 text-[10px] font-medium text-warning"
          >
            {f}
          </Badge>
        ))}
      </div>
      {hosting.notes?.length > 0 && (
        <p className="mt-2 line-clamp-3 text-[11px] italic text-muted-foreground">
          &ldquo;{hosting.notes[0]}&rdquo;
        </p>
      )}
      {source && (
        <a
          href={source}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-[10px] text-muted-foreground underline decoration-dotted hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          Source: {source.replace("https://", "")}
        </a>
      )}
    </div>
  );
}
