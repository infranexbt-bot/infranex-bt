"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { RankSimulatorResult } from "@/lib/infranex/rank-simulator";

async function fetchRankSimulator(gpu: string | null): Promise<RankSimulatorResult> {
  const url = gpu ? `/api/gpu-rank-simulator?gpu=${encodeURIComponent(gpu)}` : "/api/gpu-rank-simulator";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`rank simulator ${res.status}`);
  return res.json();
}

/**
 * Polls /api/gpu-rank-simulator every 60s for the SELECTED card (null = the
 * configured rig's default card). Each card is its own query key, so switching
 * cards refetches immediately; keepPreviousData holds the old table up (no
 * skeleton flash) until the new ranking lands. Same chain snapshot the
 * explorer and buy panel read, so EV numbers, pools and per-earner figures
 * all move together across the three views.
 */
export function useRankSimulator(gpu: string | null = null) {
  return useQuery({
    queryKey: ["gpu-rank-simulator", gpu ?? "rig"],
    queryFn: () => fetchRankSimulator(gpu),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}
