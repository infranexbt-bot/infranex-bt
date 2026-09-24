"use client";

import { useQuery } from "@tanstack/react-query";
import type { TrustReport, TrustVerdict, TrustRow } from "../lib/infranex/trust";

export type { TrustReport, TrustVerdict, TrustRow };

export interface TrustCalibration {
  minerDays: number;
  accuracyRatio: number;
}

/**
 * TRUST-LOOP — fleet-level projected vs actual earnings.
 * Polls at the worker cadence (~90s) so verdicts track the emission sampler.
 */
export function useTrustReport(refreshMs = 90_000) {
  return useQuery<TrustReport>({
    queryKey: ["trust-report"],
    queryFn: async () => {
      const res = await fetch("/api/trust", { cache: "no-store" });
      if (!res.ok) throw new Error(`trust ${res.status}`);
      return res.json();
    },
    refetchInterval: refreshMs,
    staleTime: 30_000,
  });
}

/** Verdict → chip styling, shared by the miners list and the trust card. */
export function trustVerdictStyle(v: TrustVerdict): {
  label: string;
  className: string;
} {
  switch (v) {
    case "on-track":
      return { label: "On track", className: "bg-success/10 text-success" };
    case "lagging":
      return { label: "Lagging", className: "bg-amber-500/10 text-amber-500" };
    case "off-track":
      return {
        label: "Off track",
        className: "bg-destructive/10 text-destructive",
      };
    case "warming-up":
      return {
        label: "Warming up",
        className: "bg-primary/10 text-primary",
      };
    case "no-baseline":
      return {
        label: "No baseline",
        className: "bg-muted text-muted-foreground",
      };
    default:
      return {
        label: "No data",
        className: "bg-muted text-muted-foreground",
      };
  }
}
