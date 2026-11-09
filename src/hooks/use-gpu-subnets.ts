"use client";

import { useQuery } from "@tanstack/react-query";
import type { GpuSubnetExplorerResult } from "@/lib/infranex/gpu-subnet-explorer";

type GpuSubnetsPayload = GpuSubnetExplorerResult;

async function fetchGpuSubnets(): Promise<GpuSubnetsPayload> {
  const res = await fetch("/api/gpu-subnets", { cache: "no-store" });
  if (!res.ok) throw new Error(`gpu-subnets ${res.status}`);
  return res.json();
}

/**
 * Polls /api/gpu-subnets every 60s — the GPU → Subnets explorer data.
 * Same live chain snapshot the rest of the platform reads, so family
 * pools and per-earner yields move together with the other GPU views.
 */
export function useGpuSubnets() {
  return useQuery({
    queryKey: ["gpu-subnets"],
    queryFn: fetchGpuSubnets,
    refetchInterval: 60_000,
  });
}
