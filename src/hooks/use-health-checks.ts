"use client";

import { useEffect, useState, useCallback, useRef } from "react";

/**
 * Actively probes each dependency the app relies on to run live:
 *  - the local /api/network route (chain + price aggregator)
 *  - the Bittensor Finney chain RPC directly
 *  - the CoinGecko price API
 *
 * Returns a per-check pass/fail with latency and last error, refreshed
 * on demand or every 60s.
 */

export type CheckStatus = "pending" | "pass" | "fail";

export interface HealthCheck {
  id: string;
  name: string;
  description: string;
  status: CheckStatus;
  latencyMs: number | null;
  detail: string;
  lastChecked: number | null;
  endpoint: string;
}

const INITIAL: HealthCheck[] = [
  {
    id: "api",
    name: "Local API route",
    description: "/api/network — aggregates chain + price into one snapshot",
    status: "pending",
    latencyMs: null,
    detail: "Not checked yet",
    lastChecked: null,
    endpoint: "/api/network",
  },
  {
    id: "chain",
    name: "Bittensor Finney chain",
    description: "Server-side RPC probe of the public entrypoint node via /api/chain-health",
    status: "pending",
    latencyMs: null,
    detail: "Not checked yet",
    lastChecked: null,
    endpoint: "/api/chain-health",
  },
  {
    id: "price",
    name: "TAO price feed",
    description: "Server-side CoinGecko probe via /api/price-health",
    status: "pending",
    latencyMs: null,
    detail: "Not checked yet",
    lastChecked: null,
    endpoint: "/api/price-health",
  },
  {
    id: "gpu",
    name: "RunPod GPU pricing",
    description: "RunPod GraphQL API for live GPU spot/on-demand prices",
    status: "pending",
    latencyMs: null,
    detail: "Not checked yet",
    lastChecked: null,
    endpoint: "https://api.runpod.io/graphql",
  },
];

async function probe(check: HealthCheck): Promise<HealthCheck> {
  const start = performance.now();
  try {
    if (check.id === "api") {
      const res = await fetch("/api/network", { cache: "no-store" });
      const latency = Math.round(performance.now() - start);
      if (!res.ok) {
        return {
          ...check,
          status: "fail",
          latencyMs: latency,
          detail: `HTTP ${res.status} ${res.statusText}`,
          lastChecked: Date.now(),
        };
      }
      const j = (await res.json()) as {
        source: string;
        blockNumber: number;
        taoPriceUsd: number;
        totalSubnets: number;
        error?: string;
      };
      const ok = j.source === "live";
      return {
        ...check,
        status: ok ? "pass" : "fail",
        latencyMs: latency,
        detail: ok
          ? `Live — block ${j.blockNumber.toLocaleString()}, ${j.totalSubnets} subnets, TAO $${j.taoPriceUsd.toFixed(2)}`
          : `Source: ${j.source}${j.error ? ` — ${j.error}` : ""}`,
        lastChecked: Date.now(),
      };
    }

    if (check.id === "chain") {
      // HEALTH-PROBE-1: probe server-side via /api/chain-health. A direct
      // browser POST to the RPC showed "Failed to fetch" whenever the node
      // rate-limited without CORS headers — even while the chain (and the
      // app's own server-side polling) were perfectly healthy.
      const res = await fetch("/api/chain-health", { cache: "no-store" });
      const latency = Math.round(performance.now() - start);
      if (!res.ok) {
        return {
          ...check,
          status: "fail",
          latencyMs: latency,
          detail: `HTTP ${res.status} ${res.statusText}`,
          lastChecked: Date.now(),
        };
      }
      const j = (await res.json()) as {
        source: string;
        blockNumber?: number;
        error?: string;
      };
      const ok = j.source === "live";
      return {
        ...check,
        status: ok ? "pass" : "fail",
        latencyMs: latency,
        detail: ok
          ? `Reachable — latest block ${j.blockNumber?.toLocaleString() ?? "?"}`
          : `Source: ${j.source}${j.error ? ` — ${j.error}` : ""}`,
        lastChecked: Date.now(),
      };
    }

    if (check.id === "price") {
      // HEALTH-PROBE-2: probe server-side via /api/price-health. A direct
      // browser fetch showed "Failed to fetch" on rate-limited responses
      // (no CORS headers), and browsers cannot set a custom User-Agent.
      const res = await fetch("/api/price-health", { cache: "no-store" });
      const latency = Math.round(performance.now() - start);
      if (!res.ok) {
        return {
          ...check,
          status: "fail",
          latencyMs: latency,
          detail: `HTTP ${res.status} ${res.statusText}`,
          lastChecked: Date.now(),
        };
      }
      const j = (await res.json()) as {
        source: string;
        taoPriceUsd?: number;
        via?: string;
        error?: string;
      };
      const ok = j.source === "live" || j.source === "cached";
      return {
        ...check,
        status: ok ? "pass" : "fail",
        latencyMs: latency,
        detail: ok
          ? `TAO/USD $${j.taoPriceUsd?.toFixed(2) ?? "?"} (via ${j.via ?? "?"}${j.source === "cached" ? ", cached" : ""})`
          : `Source: ${j.source}${j.error ? ` — ${j.error}` : ""}`,
        lastChecked: Date.now(),
      };
    }

    if (check.id === "gpu") {
      // Probe the local /api/gpu-offers route (which calls RunPod server-side).
      const res = await fetch("/api/gpu-offers", { cache: "no-store" });
      const latency = Math.round(performance.now() - start);
      if (!res.ok) {
        return {
          ...check,
          status: "fail",
          latencyMs: latency,
          detail: `HTTP ${res.status} ${res.statusText}`,
          lastChecked: Date.now(),
        };
      }
      const j = (await res.json()) as {
        source: string;
        offers?: unknown[];
        totalGpuTypes?: number;
        error?: string;
      };
      const ok = j.source === "live";
      return {
        ...check,
        status: ok ? "pass" : "fail",
        latencyMs: latency,
        detail: ok
          ? `${j.offers?.length ?? 0} live offers across ${j.totalGpuTypes ?? 0} GPU types`
          : `Source: ${j.source}${j.error ? ` — ${j.error}` : ""}`,
        lastChecked: Date.now(),
      };
    }

    return check;
  } catch (e) {
    const latency = Math.round(performance.now() - start);
    return {
      ...check,
      status: "fail",
      latencyMs: latency,
      detail: e instanceof Error ? e.message : String(e),
      lastChecked: Date.now(),
    };
  }
}

export function useHealthChecks() {
  const [checks, setChecks] = useState<HealthCheck[]>(INITIAL);
  const [running, setRunning] = useState(false);
  const didInit = useRef(false);

  const run = useCallback(async () => {
    setRunning(true);
    const results = await Promise.all(INITIAL.map((c) => probe(c)));
    setChecks(results);
    setRunning(false);
  }, []);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    // Defer to a microtask so we don't synchronously call setState (which
    // triggers the react-hooks/set-state-in-effect lint rule) inside the
    // effect body.
    void Promise.resolve().then(() => run());
    const interval = setInterval(run, 60_000);
    return () => clearInterval(interval);
  }, [run]);

  return { checks, run, running };
}
