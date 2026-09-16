"use client";

import { useQuery } from "@tanstack/react-query";
import type { LiveNetworkSnapshot } from "./chain";

// DATA-AUDIT-1 — the merge/rank engine moved to live-merge.ts (server-safe,
// shared with the Optimization Engine). This module stays as the client
// polling hook + re-exports so existing imports keep working.

export type { LiveNetworkSnapshot, LiveSubnetMetrics, NeuronMetrics } from "./chain";
export type { LiveSubnet, LiveOpportunity } from "./live-merge";
export {
  mergeSubnets,
  mergeOpportunities,
  getLiveDashboardMetrics,
  buildEmissionShares,
} from "./live-merge";

async function fetchNetwork(): Promise<LiveNetworkSnapshot> {
  const res = await fetch("/api/network", { cache: "no-store" });
  if (!res.ok) throw new Error(`network ${res.status}`);
  return res.json();
}

/**
 * Polls /api/network every 30s. Returns live chain + price data, with
 * `isLive` indicating whether the latest fetch was a real chain snapshot.
 */
export function useNetwork() {
  return useQuery({
    queryKey: ["network"],
    queryFn: fetchNetwork,
    refetchInterval: 30_000,
    refetchOnReconnect: true,
    select: (data) => ({
      ...data,
      isLive: data.source === "live",
      isStale: data.source !== "live",
    }),
  });
}
