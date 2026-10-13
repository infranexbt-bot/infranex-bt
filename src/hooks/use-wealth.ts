"use client";

// WEALTH-1 — client data layer for Engine 02 · EARN (yield board, tracked
// positions, monthly income rollup). Follows the platform's react-query hook
// conventions (see use-stake-portfolio.ts, use-subnet-overrides.ts).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface YieldPool {
  id: string;
  protocol: string;
  chain: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  stablecoin: boolean;
  ilRisk: string;
  exposure: string;
}

export interface YieldPoolsResponse {
  source: string;
  fetchedAt: string | null;
  cacheAgeMin: number | null;
  totalPoolsScanned: number;
  matching: number;
  pools: YieldPool[];
}

export interface YieldPosition {
  id: string;
  poolId: string;
  protocol: string;
  chain: string;
  symbol: string;
  stablecoin: boolean;
  amountUsd: number;
  entryApy: number;
  currentApy: number | null;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface YieldPositionsResponse {
  positions: YieldPosition[];
  totals: { activeCount: number; totalUsd: number; blendedApy: number; monthlyUsd: number };
}

export interface IncomeSummary {
  month: string;
  totalMonthlyUsd: number;
  mining: {
    trailing30dUsd: number;
    monthlyProjectedUsd: number;
    dailyAvgUsd: number;
    topSubnets: { netuid: number; usd: number }[];
  };
  yield: { monthlyUsd: number; totalUsd: number; blendedApy: number; activeCount: number };
  manual: {
    currentMonthUsd: number;
    entries: { id: string; month: string; source: string; label: string; amountUsd: number }[];
  };
  trend: {
    month: string;
    miningUsd: number;
    yieldUsd: number;
    manualUsd: number;
    totalUsd: number;
    partial: boolean;
  }[];
}

export function useYieldPools(params: { stablecoin: boolean; minTvl: number; sort: "apy" | "tvl" }) {
  const qs = new URLSearchParams({
    stablecoin: String(params.stablecoin),
    minTvl: String(params.minTvl),
    sort: params.sort,
  });
  return useQuery<YieldPoolsResponse>({
    queryKey: ["yield-pools", params.stablecoin, params.minTvl, params.sort],
    queryFn: async () => {
      const res = await fetch(`/api/yields?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`yields ${res.status}`);
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function useYieldPositions() {
  return useQuery<YieldPositionsResponse>({
    queryKey: ["yield-positions"],
    queryFn: async () => {
      const res = await fetch("/api/yield-positions", { cache: "no-store" });
      if (!res.ok) throw new Error(`yield-positions ${res.status}`);
      return res.json();
    },
    refetchInterval: 120_000,
    staleTime: 30_000,
  });
}

export function useIncomeSummary() {
  return useQuery<IncomeSummary>({
    queryKey: ["income-summary"],
    queryFn: async () => {
      const res = await fetch("/api/income/summary", { cache: "no-store" });
      if (!res.ok) throw new Error(`income-summary ${res.status}`);
      return res.json();
    },
    refetchInterval: 120_000,
    staleTime: 30_000,
  });
}

export interface TrackPositionInput {
  poolId: string;
  protocol: string;
  chain: string;
  symbol: string;
  stablecoin: boolean;
  amountUsd: number;
  entryApy: number;
  currentApy: number | null;
}

export function useTrackYieldPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TrackPositionInput) => {
      const res = await fetch("/api/yield-positions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `track failed ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["yield-positions"] });
      qc.invalidateQueries({ queryKey: ["income-summary"] });
    },
  });
}

export function useUpdateYieldPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; amountUsd?: number; status?: string; notes?: string; currentApy?: number }) => {
      const res = await fetch(`/api/yield-positions?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`update failed ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["yield-positions"] });
      qc.invalidateQueries({ queryKey: ["income-summary"] });
    },
  });
}

export function useDeleteYieldPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/yield-positions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`delete failed ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["yield-positions"] });
      qc.invalidateQueries({ queryKey: ["income-summary"] });
    },
  });
}
