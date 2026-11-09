"use client";

import { useQuery } from "@tanstack/react-query";
import type { RankSimulatorResult } from "@/lib/infranex/rank-simulator";

async function fetchRankSimulator(gpu: string | null): Promise<RankSimulatorResult> {
  const url = gpu ? `/api/gpu-rank-simulator?gpu=${encodeURIComponent(gpu)}` : "/api/gpu-rank-simulator";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`rank simulator ${res.status}`);
  return res.json();
}

/**
 * Polls /api/gpu-rank-simulator every 60s — the honest new-entrant income
 * ranker for a selected card (null = the configured rig's default card).
 * Same chain snapshot the explorer and buy panel read, so EV numbers,
 * pools and per-earner figures all move together across the three views.
 */
export function useRankSimulator(gpu: string | null = null) {
  return useQuery({
    queryKey: ["gpu-rank-simulator", gpu ?? "rig"],
    queryFn: () => fetchRankSimulator(gpu),
    refetchInterval: 60_000,
  });
}
