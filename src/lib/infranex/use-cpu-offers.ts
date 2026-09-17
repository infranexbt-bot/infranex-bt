"use client";

import { useQuery } from "@tanstack/react-query";
import type { CPUOffer } from "./types";

// ---------------------------------------------------------------------------
// CPU-CATALOG-1 — the CPU-catalog data hook. Polls /api/cpu-offers every 60s
// (same cadence as the GPU catalog); the response carries per-provider
// status so the view can show which markets are connected.
// ---------------------------------------------------------------------------

export interface CpuProviderStatus {
  id: string;
  label: string;
  configured: boolean;
  origin?: "db" | "env";
  offers: number;
  error?: string;
}

export interface CpuOffersSnapshot {
  offers: Array<CPUOffer & { live: true; source: string }>;
  source: "live" | "partial" | "error";
  fetchedAt: string;
  totalOffers: number;
  providers: CpuProviderStatus[];
}

async function fetchCpuOffers(): Promise<CpuOffersSnapshot> {
  const res = await fetch("/api/cpu-offers", { cache: "no-store" });
  if (!res.ok) throw new Error(`cpu-offers ${res.status}`);
  return res.json();
}

export function useCpuOffers() {
  return useQuery({
    queryKey: ["cpu-offers"],
    queryFn: fetchCpuOffers,
    refetchInterval: 60_000,
  });
}
