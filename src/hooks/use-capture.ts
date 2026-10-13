"use client";

// WEALTH-4 — client data layer for Engine 03 · CAPTURE completion: trade
// journal analytics, Hyperliquid funding scanner, AlphaChaser signal inbox.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface Trade {
  id: string;
  pair: string;
  direction: "LONG" | "SHORT";
  entry: number;
  stop: number;
  target: number;
  sizeUsd: number | null;
  leverage: number;
  timeframe: string;
  status: "planned" | "active" | "won" | "lost" | "cancelled";
  resultR: number | null;
  pnlUsd: number | null;
  notes: string;
  plannedR: number | null;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TradeStats {
  total: number;
  planned: number;
  active: number;
  closed: number;
  winRatePct: number;
  avgR: number;
  expectancyR: number;
  totalPnlUsd: number;
  bestR: number | null;
  worstR: number | null;
  byPair: { pair: string; count: number; winRatePct: number; avgR: number; pnlUsd: number }[];
}

export interface TradesResponse {
  trades: Trade[];
  stats: TradeStats;
}

export interface FundingRow {
  asset: string;
  markPx: number | null;
  change24hPct: number | null;
  funding1hPct: number;
  fundingAnnualPct: number;
  carrySide: "short" | "long";
  openInterestCoins: number | null;
  openInterestUsd: number | null;
  dayVolumeUsd: number | null;
}

export interface FundingResponse {
  source: string;
  fetchedAt: string;
  stale: boolean;
  universeCount: number;
  matching: number;
  extremes: {
    bestShortCarry: { asset: string; annualPct: number } | null;
    bestLongCarry: { asset: string; annualPct: number } | null;
  };
  rows: FundingRow[];
}

export interface BotSignal {
  id: string;
  botName: string;
  pair: string;
  signal: "LONG" | "SHORT" | "NEUTRAL";
  entry: number | null;
  stop: number | null;
  target: number | null;
  confidence: number | null;
  timeframe: string;
  rationale: string;
  status: "new" | "taken" | "expired";
  createdAt: string;
  updatedAt: string;
}

export interface SignalsResponse {
  signals: BotSignal[];
  counts: { fresh: number; taken: number; expired: number };
}

export interface ScanResult {
  created: number;
  rejected: string[];
  digestMeta: {
    fundingRows: number;
    pricedSymbols: number;
    journal: { closedTrades: number; winRatePct: number | null; avgR: number | null };
    scannedAt: string;
  };
}

const j = async <T,>(res: Response): Promise<T> => {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `request failed ${res.status}`);
  }
  return res.json();
};

// ---------------------------------------------------------------- trades --

export function useTrades() {
  return useQuery<TradesResponse>({
    queryKey: ["trades"],
    queryFn: () => fetch("/api/trades", { cache: "no-store" }).then(j<TradesResponse>),
    staleTime: 30_000,
  });
}

export interface TradeInput {
  pair: string;
  direction: "LONG" | "SHORT";
  entry: number;
  stop: number;
  target: number;
  sizeUsd?: number | null;
  leverage?: number;
  timeframe?: string;
  notes?: string;
}

export function useCreateTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TradeInput) =>
      fetch("/api/trades", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }).then(j<{ trade: Trade }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trades"] }),
  });
}

export function useUpdateTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; status?: string; resultR?: number | null; pnlUsd?: number | null; notes?: string }) =>
      fetch(`/api/trades?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).then(j<{ trade: Trade }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trades"] }),
  });
}

export function useDeleteTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/trades?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(j<{ ok: boolean }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trades"] }),
  });
}

// --------------------------------------------------------------- funding --

export function useFunding(params: { side: "all" | "long" | "short"; minOi: number; sort: "abs" | "pct" }) {
  const qs = new URLSearchParams({ side: params.side, minOi: String(params.minOi), sort: params.sort });
  return useQuery<FundingResponse>({
    queryKey: ["funding", params.side, params.minOi, params.sort],
    queryFn: () => fetch(`/api/funding?${qs}`, { cache: "no-store" }).then(j<FundingResponse>),
    refetchInterval: 10 * 60_000,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

// ----------------------------------------------------------- bot signals --

export function useBotSignals() {
  return useQuery<SignalsResponse>({
    queryKey: ["bot-signals"],
    queryFn: () => fetch("/api/bot-signals", { cache: "no-store" }).then(j<SignalsResponse>),
    staleTime: 30_000,
  });
}

export function useScanAlphaChaser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (focus?: string) =>
      fetch("/api/bot-signals/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ focus: focus || undefined }),
      }).then(j<ScanResult>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bot-signals"] }),
  });
}

export function useUpdateSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; status?: string }) =>
      fetch(`/api/bot-signals?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).then(j<{ signal: BotSignal }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bot-signals"] }),
  });
}

export function useDeleteSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/bot-signals?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(j<{ ok: boolean }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bot-signals"] }),
  });
}

/** Turn a funding row into a pre-filled trade journal entry payload. */
export function fundingToTradeInput(row: FundingRow): TradeInput {
  const px = row.markPx ?? 0;
  // Approximate stops/targets around a 2R skeleton from the carry direction.
  const dir = row.carrySide === "short" ? "SHORT" : "LONG";
  const stopDist = px * 0.05; // 5% initial risk envelope
  const isLong = dir === "LONG";
  return {
    pair: row.asset,
    direction: dir as "LONG" | "SHORT",
    entry: px,
    stop: isLong ? px - stopDist : px + stopDist,
    target: isLong ? px + stopDist * 2 : px - stopDist * 2,
    timeframe: "funding carry",
    notes: `Annualized funding ${row.fundingAnnualPct.toFixed(1)}% — ${row.carrySide}s collect. OI $${Math.round((row.openInterestUsd ?? 0) / 1e6)}M.`,
  };
}
