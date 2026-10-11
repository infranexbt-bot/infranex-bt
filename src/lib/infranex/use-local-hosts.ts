"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * LOCALHOST-1 — client hook for the local-machine (laptop) agent feature.
 * Polls the DevOps local-hosts endpoint (10s) and exposes the mutations
 * the two consumers need: create enrollment, queue a command, revoke.
 */

export interface LocalCommandDTO {
  id: string;
  netuid: number | null;
  phase: string | null;
  command: string;
  status: string;
  exitCode: number | null;
  output: string | null;
  durationMs: number | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface LocalHostDTO {
  id: string;
  name: string;
  status: string;
  specs: {
    hostname?: string;
    os?: string;
    cpuModel?: string;
    cores?: number;
    threads?: number;
    ramGb?: number;
    diskFreeGb?: number;
    python?: string;
  } | null;
  telemetry: {
    load1?: number;
    memUsedMb?: number;
    memTotalMb?: number;
    tempC?: number | null;
    uptimeS?: number;
  } | null;
  version: string | null;
  lastSeenAt: string | null;
  enrollExpiresAt: string | null;
  createdAt: string;
  commands: LocalCommandDTO[];
}

async function fetchLocalHosts(): Promise<LocalHostDTO[]> {
  const res = await fetch("/api/devops/local-hosts", { cache: "no-store" });
  if (!res.ok) throw new Error(`local-hosts ${res.status}`);
  const j = await res.json();
  return j.hosts ?? [];
}

export function useLocalHosts() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["local-hosts"],
    queryFn: fetchLocalHosts,
    refetchInterval: 10_000,
    refetchOnReconnect: true,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["local-hosts"] });
  };

  const createEnrollment = async (name: string) => {
    const res = await fetch("/api/devops/local-hosts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error ?? `create failed (${res.status})`);
    invalidate();
    return j as { host: { id: string; name: string }; enrollToken: string };
  };

  const queueCommand = async (
    hostId: string,
    command: string,
    opts?: { netuid?: number; phase?: string }
  ) => {
    const res = await fetch(`/api/devops/local-hosts/${hostId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, netuid: opts?.netuid, phase: opts?.phase }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error ?? `queue failed (${res.status})`);
    invalidate();
    return j.command as LocalCommandDTO;
  };

  const revoke = async (hostId: string) => {
    const res = await fetch(`/api/devops/local-hosts/${hostId}`, { method: "DELETE" });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error ?? `revoke failed (${res.status})`);
    invalidate();
  };

  return {
    hosts: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error instanceof Error ? query.error.message : null,
    createEnrollment,
    queueCommand,
    revoke,
    invalidate,
  };
}
