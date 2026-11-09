"use client";

import { useQuery } from "@tanstack/react-query";
import type { EvalReplayResponse } from "@/lib/infranex/eval-harness";

export interface EvalReplayParams {
  netuid: number | null;
  /** Prospect mode percentile key (top1/top5/top10/top25/median/bottomHalf). */
  percentile?: string | null;
  /** MY-UID mode — SS58 hotkey of a registered miner. */
  hotkey?: string | null;
}

async function fetchEvalReplay(p: EvalReplayParams): Promise<EvalReplayResponse> {
  const sp = new URLSearchParams();
  if (p.netuid != null) sp.set("netuid", String(p.netuid));
  if (p.percentile) sp.set("percentile", p.percentile);
  if (p.hotkey) sp.set("hotkey", p.hotkey);
  const res = await fetch(`/api/eval-replay?${sp.toString()}`, { cache: "no-store" });
  const body = await res.json().catch(() => ({ error: `eval replay ${res.status}` }));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `eval replay ${res.status}`);
  return body as EvalReplayResponse;
}

/**
 * Score replay for ONE subnet — live per-UID incentive vectors straight off
 * the chain (~3s RPC, 60s server-side vector cache), so this does NOT poll:
 * it fetches when the subnet / percentile / hotkey changes (staleTime 60s).
 * The money side comes from the same chain snapshot the explorer, buy panel
 * and rank simulator read.
 */
export function useEvalReplay(p: EvalReplayParams) {
  const enabled = p.netuid != null && (Boolean(p.percentile) || Boolean(p.hotkey));
  return useQuery({
    queryKey: ["eval-replay", p.netuid, p.percentile ?? null, p.hotkey ?? null],
    queryFn: () => fetchEvalReplay(p),
    enabled,
    staleTime: 60_000,
    refetchInterval: false,
    retry: 1,
  });
}
