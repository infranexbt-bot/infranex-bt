"use client";

import { useQuery } from "@tanstack/react-query";
import type { HotkeyPortfolio, StakePortfolioReport } from "../lib/infranex/stake-portfolio";

export type { HotkeyPortfolio, StakePortfolioReport, StakePosition } from "../lib/infranex/stake-portfolio";

interface StakePortfolioResponse extends StakePortfolioReport {
  /** "query" = explicit ?hotkey= params; "registry" = platform-known hotkeys. */
  resolvedBy: "query" | "registry";
}

/**
 * STAKE-PORTFOLIO-1 — live on-chain alpha/TAO portfolio for the operator's
 * hotkeys. Polls every 60s: mining rewards accrue per block, and the alpha
 * pool price moves, so both the position and its value drift continuously.
 */
export function useStakePortfolio(refreshMs = 60_000) {
  return useQuery<StakePortfolioResponse>({
    queryKey: ["stake-portfolio"],
    queryFn: async () => {
      const res = await fetch("/api/wallets/stake-portfolio", { cache: "no-store" });
      if (!res.ok) throw new Error(`stake-portfolio ${res.status}`);
      return res.json();
    },
    refetchInterval: refreshMs,
    staleTime: 30_000,
    retry: 1,
  });
}
