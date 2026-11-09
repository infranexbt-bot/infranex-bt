"use client";

import { useQuery } from "@tanstack/react-query";
import type { DecisionPayload } from "../lib/infranex/gpu-decision";

export type { DecisionPayload };

async function fetchGpuDecision(): Promise<DecisionPayload> {
  const res = await fetch("/api/gpu-decision", { cache: "no-store" });
  if (!res.ok) throw new Error(`gpu-decision ${res.status}`);
  return res.json();
}

/**
 * Polls /api/gpu-decision every 60s. The endpoint joins the scraped GPU
 * requirement layer with the newest chain snapshot and the opportunity
 * snapshot's classifications — the panel re-runs the EV math client-side
 * under the user's assumption sliders on every poll tick.
 */
export function useGpuDecision() {
  return useQuery({
    queryKey: ["gpu-decision"],
    queryFn: fetchGpuDecision,
    refetchInterval: 60_000,
  });
}
