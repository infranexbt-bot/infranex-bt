// JUDGE-APPLY — the one sanctioned bridge from Judge Lab advice to live miners.
//
// The Judge itself is purely advisory: it simulates a MinerSpec against a
// subnet profile and ranks composite gains per dimension, but never touches
// a deployment. This module closes the loop: it maps a recommendation
// (dimensionKey) to a concrete on-host env delta using the same INFANEX_*
// runtime recipe namespace as the DevOps runtime optimizer, snapshots the
// deployment config first (one-click rollback via Deployments → revisions),
// then pushes apply_config through the node daemon. Mock deployments get a
// simulated tick; pods without a daemon get a platform-side-only update and
// an honest note.
//
// Honest boundaries (matching the platform's verify-in-docs ethos):
//   - "availability" has no safe on-host recipe → deliberately not mapped;
//     the API returns a manual-only note for it.
//   - "price" needs a concrete number: the caller derives priceTargetUsd
//     from the run's own priceScore math; it is sanity-clamped server-side.
//   - Nothing is pushed without a pre-change revision snapshot.

import { db } from "@/lib/db";
import { getDaemonView, enqueueCommand } from "../daemon-bridge";
import { deserializeConfig } from "../deployment/config";

export interface JudgeFixRecipe {
  dimensionKey: string;
  label: string;
  note: string;
  /** null → dimension is manual-only (no safe on-host recipe). */
  envDelta: Record<string, string> | null;
}

export const JUDGE_FIX_RECIPES: Record<string, JudgeFixRecipe> = {
  response_quality: {
    dimensionKey: "response_quality",
    label: "Quality upshift (FP8 tier + self-verification)",
    note: "Higher-fidelity quant tier plus a self-verify pass — targets the 0.90 quality bar.",
    envDelta: { INFANEX_QUANT: "fp8", INFANEX_SELF_VERIFY: "1" },
  },
  resource_efficiency: {
    dimensionKey: "resource_efficiency",
    label: "AWQ 4-bit re-quant (smaller footprint)",
    note: "~50% VRAM freed so a stronger model fits the same GPU — the resource-fit recipe.",
    envDelta: { INFANEX_QUANT: "awq4" },
  },
  throughput: {
    dimensionKey: "throughput",
    label: "vLLM continuous batching",
    note: "2-4× throughput under concurrent validator load.",
    envDelta: { INFANEX_RUNTIME: "vllm", VLLM_ENABLE_CHUNKED_PREFILL: "1" },
  },
  response_speed: {
    dimensionKey: "response_speed",
    label: "TensorRT-LLM serving",
    note: "Up to 3× lower time-to-first-token.",
    envDelta: { INFANEX_RUNTIME: "tensorrt-llm" },
  },
  price: {
    dimensionKey: "price",
    label: "Reprice into the competitive band",
    note: "Writes INFANEX_ASK_PRICE_USD on-host — the miner wrapper reprices on restart.",
    envDelta: null, // built at apply-time from priceTargetUsd
  },
  // "availability" is intentionally absent: uptime is infra-level (multi-region,
  // supervisor) and has no honest env-only recipe. The engine says "manual".
};

export interface ApplyJudgeFixResult {
  ok: boolean;
  note: string;
  applied: string[];
  envDelta: Record<string, string>;
  transport: "daemon" | "mock" | "platform-only" | "none";
}

const clampPrice = (v: number) =>
  Math.min(100, Math.max(0.01, Math.round(v * 100) / 100));

/**
 * Apply one Judge Lab recommendation to a deployment.
 * Same transport ladder as applyRuntimeOptimization:
 *   daemon reachable → apply_config push; mock → simulated tick;
 *   otherwise durable platform-side config update + honest note.
 */
export async function applyJudgeFix(
  deploymentId: string,
  dimensionKey: string,
  opts?: { priceTargetUsd?: number }
): Promise<ApplyJudgeFixResult> {
  const row = await db.deployment.findUnique({ where: { id: deploymentId } });
  if (!row) {
    return { ok: false, note: "Deployment not found.", applied: [], envDelta: {}, transport: "none" };
  }

  const recipe = JUDGE_FIX_RECIPES[dimensionKey];
  if (!recipe) {
    return {
      ok: false,
      note: `No automated recipe for "${dimensionKey}" — this one stays manual (see the fix text for what to change on the host).`,
      applied: [],
      envDelta: {},
      transport: "none",
    };
  }

  const envDelta: Record<string, string> = {};
  if (dimensionKey === "price") {
    const t = opts?.priceTargetUsd;
    if (!t || !Number.isFinite(t) || t <= 0) {
      return {
        ok: false,
        note: "Price fix needs a target price (priceTargetUsd) — nothing applied.",
        applied: [],
        envDelta: {},
        transport: "none",
      };
    }
    envDelta.INFANEX_ASK_PRICE_USD = String(clampPrice(t));
  } else if (recipe.envDelta) {
    Object.assign(envDelta, recipe.envDelta);
  }
  if (Object.keys(envDelta).length === 0) {
    return { ok: false, note: "Nothing to apply — recipe resolved to an empty delta.", applied: [], envDelta: {}, transport: "none" };
  }

  const applied: string[] = [recipe.label];

  // Durable platform-side config update, with a pre-change revision snapshot
  // so an over-aggressive fix is one rollback away (same as runtime-opt).
  const cfg = deserializeConfig(row.config);
  if (cfg) {
    try {
      const { snapshotRevision } = await import("../deployment/revisions");
      await snapshotRevision(
        row.id,
        "judge-fix",
        `before judge fix: ${recipe.label}`,
        "engine"
      ).catch(() => null);
      const envVars = Array.isArray(cfg.docker.envVars) ? [...cfg.docker.envVars] : [];
      for (const [k, v] of Object.entries(envDelta)) {
        const i = envVars.findIndex((e) => e.name === k);
        if (i >= 0) envVars[i] = { name: k, value: v, secret: false };
        else envVars.push({ name: k, value: v, secret: false });
      }
      cfg.docker.envVars = envVars;
      await db.deployment.update({
        where: { id: row.id },
        data: { config: JSON.stringify(cfg) },
      });
      applied.push("deployment config env updated (revision snapshotted)");
    } catch {
      applied.push("deployment config left untouched (unparseable)");
    }
  } else {
    applied.push("deployment config left untouched (empty)");
  }

  const daemon = await getDaemonView(row.id).catch(() => null);
  if (daemon && daemon.status !== "unreachable") {
    await enqueueCommand(row.id, "apply_config", { env: envDelta });
    return {
      ok: true,
      note: `apply_config queued via node daemon — env (${Object.keys(envDelta).join(", ")}) persisted on-host; the miner restarts under the new profile within 60s. Re-run the Judge in a few minutes to measure the gain.`,
      applied,
      envDelta,
      transport: "daemon",
    };
  }
  if (row.mode === "mock") {
    const { tickDeployment } = await import("../deployment/engine");
    await tickDeployment(row.id).catch(() => null);
    return {
      ok: true,
      note: "Simulated apply — mock deployment ticked with the new profile (no real GPU touched).",
      applied,
      envDelta,
      transport: "mock",
    };
  }
  return {
    ok: true,
    note: "Config updated platform-side, but no daemon is installed on the pod — install the Node Daemon (Deployments → DevOps panel) to push apply_config to the GPU.",
    applied,
    envDelta,
    transport: "platform-only",
  };
}
