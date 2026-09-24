"use client";

// "GPU Hosting Compatibility" card — shown inside the subnet requirements
// dialog. Turns the compat tier into clear operator instructions:
//   - plain-English verdict (can I use RunPod/Vast or do I need bare metal?)
//   - requirement chips + verbatim README evidence
//   - "where to rent" hint matched to the tier

import { Badge } from "@/components/ui/badge";
import { Server, Cloud, ShieldCheck, AlertTriangle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COMPAT_TIER_META,
  type SubnetCompat,
} from "@/lib/infranex/compat";

const RENT_HINTS: Record<SubnetCompat["tier"], { text: string; tone: string } | null> = {
  "bare-metal-only": {
    text: "Rent bare metal: Latitude.sh (code BITTENSOR27), Hydrahost, or own/colo hardware. Need a static 1:1 IP — ask the provider for dedicated IP add-ons.",
    tone: "border-destructive/40 bg-destructive/[0.06]",
  },
  "tee-required": {
    text: "Need TEE-capable hosts: Phala Cloud (TDX CVMs) for TDX subnets, CC-mode H100/H200 bare metal for NVIDIA Confidential Compute. Ask providers explicitly for TDX/CC — most clouds don't expose it.",
    tone: "border-amber-500/40 bg-amber-500/[0.06]",
  },
  "provider-friendly": {
    text: "Any hourly cloud works: Vast.ai dedicated instances or RunPod pods. Check the subnet README for its official setup guide.",
    tone: "border-success/40 bg-success/[0.06]",
  },
  "gpu-flexible": {
    text: "Vast.ai or RunPod hourly rentals are allowed by default. Prefer dedicated (non-shared) instances for stable latency.",
    tone: "border-success/40 bg-success/[0.06]",
  },
  "cpu-only": {
    text: "Save your money — a small VPS (Hetzner, Contabo) is enough. No GPU rental needed.",
    tone: "border-border/60 bg-muted/30",
  },
  unclear: {
    text: "Do not provision yet — join the subnet's Discord and confirm the requirements first.",
    tone: "border-amber-500/40 bg-amber-500/[0.06]",
  },
  "no-repo": {
    text: "Do not provision yet — no public repo to verify. Ask the subnet team for their miner guide.",
    tone: "border-amber-500/40 bg-amber-500/[0.06]",
  },
  parked: {
    text: "Skip — this subnet is parked/for-sale/deprecated.",
    tone: "border-border/60 bg-muted/30",
  },
};

export function CompatSection({
  compat,
  subnetName,
}: {
  compat: SubnetCompat;
  subnetName: string;
}) {
  const meta = COMPAT_TIER_META[compat.tier];
  const rent = RENT_HINTS[compat.tier];
  const cloudsBlocked = !compat.containerCloudsOk;

  return (
    <div className="space-y-3">
      {/* Verdict banner */}
      <div className={cn("rounded-lg border p-4", rent?.tone ?? "border-border/60")}>
        <div className="flex flex-wrap items-center gap-2">
          {cloudsBlocked ? (
            <Server className="h-4 w-4 shrink-0" />
          ) : (
            <Cloud className="h-4 w-4 shrink-0" />
          )}
          <p className="text-sm font-semibold">GPU hosting compatibility</p>
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
              meta.badgeClass
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", meta.dotClass)} />
            {meta.label}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">
          {subnetName} — {compat.instructions}
        </p>

        {compat.requirements.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {compat.requirements.map((r) => (
              <Badge key={r} variant="outline" className="text-[10px]">
                {r}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Evidence */}
      {(compat.quote || compat.note) && (
        <div className="rounded-lg border border-border/60 bg-card/40 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Evidence · verified {compat.verifiedAt} · source: {compat.source}
            </p>
          </div>
          {compat.quote && (
            <p className="border-l-2 border-border pl-2 text-xs italic text-muted-foreground">
              &ldquo;{compat.quote}&rdquo;
              {compat.evidenceSource && (
                <span className="mt-0.5 block text-[10px] not-italic">— {compat.evidenceSource}</span>
              )}
            </p>
          )}
          {compat.note && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              {compat.note}
            </p>
          )}
        </div>
      )}

      {/* Where to rent */}
      {rent && (
        <div className={cn("rounded-lg border p-3", rent.tone)}>
          <p className="text-xs leading-relaxed">
            <span className="font-semibold">Where to run it: </span>
            {rent.text}
          </p>
        </div>
      )}

      {/* Caveat nudge */}
      {meta.caveat && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          This is a caveat subnet — its requirements are not published publicly.
          Treat every field on this page as unverified.
        </p>
      )}

      {compat.evidenceSource?.startsWith("http") && (
        <a
          href={compat.evidenceSource}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Open evidence source
        </a>
      )}
    </div>
  );
}
