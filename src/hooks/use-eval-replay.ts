"use client";

import { useQuery } from "@tanstack/react-query";
import type { EvalReplayResult } from "@/lib/infranex/eval-harness";

export interface EvalReplayResponse extends EvalReplayResult {
  meta: {
    hyperparams: { tempo: number | null; immunityPeriod: number | null; maxAllowedUids: number | null };
    vectorBlock: number | null;
    fetchedAt: number;
    snapshotAt: string | null;
  };
}

async function fetchEvalReplay(
  netuid: number,
  percentile: string,
  hotkey: string | null,
): Promise<EvalReplayResponse> {
  const sp = new URLSearchParams({ netuid: String(netuid), percentile });
  if (hotkey) sp.set("hotkey", hotkey);
  const res = await fetch(`/api/eval-replay?${sp.toString()}`, { cache: "no-store" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `eval replay ${res.status}`);
  }
  return res.json();
}

/**
 * Polls /api/eval-replay every 60s for one subnet — score replay over the
 * chain's live per-UID incentive vector. Prospect mode places you at a
 * performance percentile on the OBSERVED curve; passing a hotkey switches
 * to MY-UID mode (your live rank, $/day and the gap to the last paid seat).
 * Empty hotkey → prospect mode.
 */
export function useEvalReplay(
  netuid: number | null,
  percentile: string = "top10",
  hotkey: string | null = null,
) {
  return useQuery({
    queryKey: ["eval-replay", netuid, percentile, hotkey ?? "prospect"],
    queryFn: () => fetchEvalReplay(netuid as number, percentile, hotkey),
    enabled: netuid != null,
    refetchInterval: 60_000,
    retry: 1,
  });
}
