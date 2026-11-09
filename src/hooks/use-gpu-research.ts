"use client";

import { useQuery } from "@tanstack/react-query";
import type { GpuResearchMeta, LiveGpuResearchRow } from "../lib/infranex/gpu-research-live";

export type { GpuResearchMeta, LiveGpuResearchRow };

interface GpuResearchPayload {
  meta: GpuResearchMeta & { autoSweepStarted: boolean };
  rows: LiveGpuResearchRow[];
}

async function fetchGpuResearch(): Promise<GpuResearchPayload> {
  const res = await fetch("/api/gpu-research", { cache: "no-store" });
  if (!res.ok) throw new Error(`gpu-research ${res.status}`);
  return res.json();
}

/**
 * Polls /api/gpu-research every 60s. The endpoint merges the frozen
 * repo-level audit seed with the live scrape layer and kicks a bounded
 * auto-sweep batch whenever the live data is stale — so keeping this page
 * open keeps the audit fresh without any background worker.
 */
export function useGpuResearch() {
  return useQuery({
    queryKey: ["gpu-research"],
    queryFn: fetchGpuResearch,
    refetchInterval: 60_000,
    select: (data) => ({
      ...data,
      lastScrapeAt: data.meta.lastScrapeAt ? new Date(data.meta.lastScrapeAt) : null,
    }),
  });
}
