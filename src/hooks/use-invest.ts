"use client";

// WEALTH-3 — client data layer for Engine 01 · INVEST (theses + AI briefs,
// live watchlist, portfolio allocation, asymmetric bets). Follows the
// platform's react-query hook conventions (see use-wealth.ts).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface Thesis {
  id: string;
  asset: string;
  direction: "LONG" | "SHORT";
  conviction: "HIGH" | "MEDIUM" | "LOW";
  timeframe: string;
  status: "active" | "monitoring" | "won" | "lost" | "closed";
  entryPrice: number | null;
  targetPrice: number | null;
  stopPrice: number | null;
  thesis: string;
  catalystsJson: string;
  risksJson: string;
  aiBrief: string | null;
  aiBriefAt: string | null;
  livePrice: number | null;
  change24h: number | null;
  toTargetPct: number | null;
  toStopPct: number | null;
  hasBrief: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ThesesResponse {
  theses: Thesis[];
  counts: { active: number; monitoring: number; won: number; lost: number };
}

export interface WatchItem {
  id: string;
  symbol: string;
  name: string;
  priceAtAdd: number | null;
  alertAbove: number | null;
  alertBelow: number | null;
  notes: string;
  price: number | null;
  change24h: number | null;
  alertStatus: "above" | "below" | "ok" | "unknown";
  stalePrice: boolean;
  createdAt: string;
}

export interface WatchResponse {
  items: WatchItem[];
  alerts: number;
}

export interface Holding {
  id: string;
  symbol: string;
  quantity: number;
  avgCostUsd: number;
  venue: string;
  notes: string;
  price: number | null;
  change24h: number | null;
  valueUsd: number | null;
  costBasisUsd: number;
  pnlUsd: number | null;
  pnlPct: number | null;
  weightPct: number | null;
  stalePrice: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HoldingsResponse {
  holdings: Holding[];
  totals: {
    valueUsd: number;
    costUsd: number;
    pnlUsd: number;
    pnlPct: number;
    count: number;
    unpriced: string[];
    topWeights: { symbol: string; weightPct: number }[];
  };
}

export interface Bet {
  id: string;
  name: string;
  asset: string;
  vehicle: string;
  capitalUsd: number;
  upsideMultiple: number;
  downsidePercent: number;
  winProbability: number;
  status: "open" | "won" | "lost" | "closed";
  realizedUsd: number | null;
  notes: string;
  gainMultiple: number;
  evUsd: number;
  payoffRatio: number | null;
  kellyPct: number;
  winProfitUsd: number;
  lossAmountUsd: number;
  createdAt: string;
  updatedAt: string;
}

export interface BetsResponse {
  bets: Bet[];
  totals: {
    openCount: number;
    openCapitalUsd: number;
    openEvUsd: number;
    settledCount: number;
    realizedUsd: number;
    realizedPct: number;
  };
}

const j = async <T,>(res: Response): Promise<T> => {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `request failed ${res.status}`);
  }
  return res.json();
};

// ---------------------------------------------------------------- theses --

export function useTheses() {
  return useQuery<ThesesResponse>({
    queryKey: ["theses"],
    queryFn: () => fetch("/api/theses", { cache: "no-store" }).then(j<ThesesResponse>),
    refetchInterval: 120_000,
    staleTime: 30_000,
  });
}

export interface ThesisInput {
  asset: string;
  direction: "LONG" | "SHORT";
  conviction: "HIGH" | "MEDIUM" | "LOW";
  timeframe?: string;
  entryPrice?: number | null;
  targetPrice?: number | null;
  stopPrice?: number | null;
  thesis?: string;
  catalysts?: string;
  risks?: string;
}

export function useCreateThesis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ThesisInput) =>
      fetch("/api/theses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }).then(j<{ thesis: Thesis }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["theses"] }),
  });
}

export function useUpdateThesis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; status?: string; conviction?: string; targetPrice?: number | null; stopPrice?: number | null; thesis?: string }) =>
      fetch(`/api/theses?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).then(j<{ thesis: Thesis }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["theses"] }),
  });
}

export function useDeleteThesis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/theses?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(j<{ ok: boolean }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["theses"] }),
  });
}

export function useGenerateBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, question }: { id: string; question?: string }) =>
      fetch("/api/theses/ai-brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, question }),
      }).then(j<{ brief: string; generatedAt: string }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["theses"] }),
  });
}

// ------------------------------------------------------------- watchlist --

export function useWatchlist() {
  return useQuery<WatchResponse>({
    queryKey: ["watchlist"],
    queryFn: () => fetch("/api/watchlist", { cache: "no-store" }).then(j<WatchResponse>),
    refetchInterval: 90_000,
    staleTime: 30_000,
  });
}

export function useAddWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { symbol: string; name?: string; alertAbove?: number | null; alertBelow?: number | null; notes?: string }) =>
      fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }).then(j<{ item: WatchItem }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
}

export function useUpdateWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; alertAbove?: number | null; alertBelow?: number | null; notes?: string }) =>
      fetch(`/api/watchlist?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).then(j<{ item: WatchItem }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
}

export function useDeleteWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/watchlist?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(j<{ ok: boolean }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
  });
}

// -------------------------------------------------------------- holdings --

export function useHoldings() {
  return useQuery<HoldingsResponse>({
    queryKey: ["holdings"],
    queryFn: () => fetch("/api/holdings", { cache: "no-store" }).then(j<HoldingsResponse>),
    refetchInterval: 120_000,
    staleTime: 30_000,
  });
}

export function useUpsertHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { symbol: string; quantity: number; avgCostUsd: number; venue?: string; notes?: string }) =>
      fetch("/api/holdings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }).then(j<{ holding: Holding }>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holdings"] });
      qc.invalidateQueries({ queryKey: ["wealth-overview"] });
    },
  });
}

export function useUpdateHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; quantity?: number; avgCostUsd?: number; venue?: string; notes?: string }) =>
      fetch(`/api/holdings?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).then(j<{ holding: Holding }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["holdings"] }),
  });
}

export function useDeleteHolding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/holdings?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(j<{ ok: boolean }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["holdings"] }),
  });
}

// ------------------------------------------------------------------ bets --

export function useBets() {
  return useQuery<BetsResponse>({
    queryKey: ["bets"],
    queryFn: () => fetch("/api/bets", { cache: "no-store" }).then(j<BetsResponse>),
    staleTime: 30_000,
  });
}

export interface BetInput {
  name: string;
  asset: string;
  vehicle?: string;
  capitalUsd: number;
  upsideMultiple?: number;
  downsidePercent?: number;
  winProbability?: number;
  notes?: string;
}

export function useCreateBet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BetInput) =>
      fetch("/api/bets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }).then(j<{ bet: Bet }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bets"] }),
  });
}

export function useUpdateBet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; status?: string; realizedUsd?: number; winProbability?: number; notes?: string }) =>
      fetch(`/api/bets?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).then(j<{ bet: Bet }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bets"] }),
  });
}

export function useDeleteBet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/bets?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(j<{ ok: boolean }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bets"] }),
  });
}
