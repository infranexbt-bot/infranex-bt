"use client";

import { useQuery } from "@tanstack/react-query";
import type { WinnerTrend } from "./registration-odds";

export type OddsTrendsMap = Record<number, WinnerTrend>;

/**
 * Winner-stability trends for ALL subnets in one request — the batch shape
 * of /api/subnets/odds-history (no netuid param). Mounted once per table or
 * per grid card; TanStack Query dedupes every observer onto a single cache
 * entry, so N rows still cost exactly one fetch + one server computation
 * (the endpoint also self-caches for 30s).
 */
export function useOddsTrends() {
  return useQuery<OddsTrendsMap>({
    queryKey: ["odds-trends-all"],
    queryFn: async () => {
      const res = await fetch("/api/subnets/odds-history", { cache: "no-store" });
      if (!res.ok) throw new Error(`odds-trends ${res.status}`);
      const json = (await res.json()) as { trends?: Record<string, WinnerTrend> };
      const out: OddsTrendsMap = {};
      for (const [k, v] of Object.entries(json.trends ?? {})) {
        const netuid = Number(k);
        if (Number.isInteger(netuid)) out[netuid] = v;
      }
      return out;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
