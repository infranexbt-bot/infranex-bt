"use client";

// SMART-FRAMEWORK-1 — client data layer for the SMART goal engine.
// Follows the platform's react-query hook conventions (see use-invest.ts).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface SmartMilestone {
  text: string;
  done: boolean;
}

export interface SmartGoal {
  id: string;
  title: string;
  specific: string;
  metric: string;
  target: number;
  current: number;
  achievable: string;
  confidence: number;
  relevant: string;
  deadline: string | null;
  milestones: SmartMilestone[];
  status: "draft" | "active" | "achieved" | "at-risk" | "abandoned";
  createdAt: string;
  updatedAt: string;
}

export type SmartGoalDraft = Omit<SmartGoal, "id" | "createdAt" | "updatedAt" | "milestones"> & {
  milestones?: SmartMilestone[];
};

export interface SmartGoalsResponse {
  goals: SmartGoal[];
}

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function useSmartGoals() {
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<SmartGoalsResponse>({
    queryKey: ["smart-goals"],
    queryFn: () => jfetch<SmartGoalsResponse>("/api/smart-goals"),
    staleTime: 10_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["smart-goals"] });

  const createGoal = useMutation({
    mutationFn: (draft: Partial<SmartGoalDraft>) =>
      jfetch<{ goal: SmartGoal }>("/api/smart-goals", {
        method: "POST",
        body: JSON.stringify(draft),
      }),
    onSuccess: invalidate,
  });

  const updateGoal = useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<SmartGoalDraft>) =>
      jfetch<{ goal: SmartGoal }>(`/api/smart-goals?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: invalidate,
  });

  const deleteGoal = useMutation({
    mutationFn: (id: string) =>
      jfetch<{ ok: boolean }>(`/api/smart-goals?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });

  return {
    goals: data?.goals ?? [],
    isLoading,
    error: error as Error | null,
    createGoal,
    updateGoal,
    deleteGoal,
  };
}
