"use client";

import { useQuery } from "@tanstack/react-query";
import type { BuyDecisionResult } from "../lib/infranex/gpu-buy-decision";

export type { BuyDecisionResult };

interface GpuBuyDecisionPayload extends BuyDecisionResult {
  meta: BuyDecisionResult["meta"] & {
    settingsTargetTao: number;
    opportunityDay: string | null;
  };
}

async function fetchGpuBuyDecision(): Promise<GpuBuyDecisionPayload> {
  const res = await fetch("/api/gpu-buy-decision", { cache: "no-store" });
  if (!res.ok) throw new Error(`gpu-buy-decision ${res.status}`);
  return res.json();
}

/**
 * Polls /api/gpu-buy-decision every 60s — same cadence as the GPU Research
 * live layer, so emissions, rewarded counts, TAO spot and the opportunity
 * gates the panel is built on stay in sync with the rest of the page.
 */
export function useGpuBuyDecision() {
  return useQuery({
    queryKey: ["gpu-buy-decision"],
    queryFn: fetchGpuBuyDecision,
    refetchInterval: 60_000,
  });
}
