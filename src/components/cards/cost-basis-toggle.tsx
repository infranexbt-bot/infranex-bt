"use client";

// ---------------------------------------------------------------------------
// COST-BASIS TOGGLE — Rented vs Owned.
//
// The Profitability Engine has always had two GPU cost modes
// (profitability.ts hardwareMode): market rent (tier rate × count) or
// owned-hardware electricity (tier power draw + 150 W host × $/kWh).
// This surfaces that switch as a one-click control: flipping it PUTs
// /api/profitability-config, so the whole platform (Opportunities table,
// Dashboard picker, P&L dialogs) recomputes on the same engine — one
// source of truth, no duplicated math.
//
// Honest semantics: owned mode changes the COST side only. Seat reality
// (knife fights, whale means) and hosting rentability gates still apply —
// owning a GPU does not buy you a rewarded seat.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Cloud, Zap } from "lucide-react";
import {
  useProfitabilityConfig,
  useSaveProfitabilityConfig,
} from "@/hooks/use-profitability";
import { cn } from "@/lib/utils";

export function CostBasisToggle({ className }: { className?: string }) {
  const { data: config } = useProfitabilityConfig();
  const save = useSaveProfitabilityConfig();
  const mode = config?.hardwareMode ?? "rent";
  const pending = save.isPending;
  // SAVE-FAILURE SURFACING — the PUT is the ONLY thing that moves the whole
  // platform onto the chosen basis; a silent failure used to leave every
  // score on the OLD basis with zero feedback (the flip looked like a no-op).
  const [error, setError] = useState<string | null>(null);

  const setMode = (m: "rent" | "owned") => {
    if (!config || pending || m === mode) return;
    setError(null);
    save.mutate(
      { ...config, hardwareMode: m },
      {
        onError: (e) =>
          setError(
            e instanceof Error
              ? e.message
              : "Save failed — scores still use the previous basis"
          ),
      }
    );
  };

  const chip = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-60",
      active
        ? "border-primary/40 bg-primary/10 text-primary"
        : "border-border/60 bg-card/30 text-muted-foreground hover:text-foreground"
    );

  const kwh = (config?.electricityUsdPerKwh ?? 0.12).toFixed(2);

  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      title={
        mode === "owned"
          ? `Cost basis: OWNED — the GPU cost line charges electricity only (power draw × $${kwh}/kWh, editable in Profitability settings) instead of market GPU rent`
          : "Cost basis: RENTED — the GPU cost line charges market GPU rent (tier rate × count). Switch to Owned if you run your own hardware: the engine then charges electricity only"
      }
    >
      <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
        Cost basis
      </span>
      <button
        className={chip(mode === "rent")}
        onClick={() => setMode("rent")}
        disabled={pending}
        aria-pressed={mode === "rent"}
      >
        <Cloud className="h-3 w-3" /> Rented
      </button>
      <button
        className={chip(mode === "owned")}
        onClick={() => setMode("owned")}
        disabled={pending}
        aria-pressed={mode === "owned"}
      >
        <Zap className={cn("h-3 w-3", pending && mode === "owned" && "animate-pulse")} /> Owned
      </button>
      {mode === "owned" && !error && (
        <span className="mono text-[10px] text-muted-foreground" title="Electricity price from Profitability settings">
          ${kwh}/kWh
        </span>
      )}
      {error && (
        <span
          className="max-w-[200px] text-[10px] leading-tight text-destructive"
          title={error}
        >
          {error}
        </span>
      )}
    </div>
  );
}
