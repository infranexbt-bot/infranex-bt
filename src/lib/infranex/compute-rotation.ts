import { db } from "@/lib/db";
import { commitFinding } from "./triggers-core";
import { computeRawWinTier, WIN_TIER_RANK, WIN_TIER_STYLES } from "./win-odds";
import { computeRankSimulator } from "./rank-simulator";
import { GPU_RESEARCH_ROWS } from "./gpu-research-seed";
import { GPU_BUY_CATALOG } from "./gpu-buy-decision";

/**
 * COMPUTE-ROTATION-1 — the compute-rotation watcher.
 *
 * The experienced-mining-firm reflex, automated: a rig should never sit on a
 * subnet that turned hostile mid-deployment. The engine watches every LIVE
 * deployment against the latest chain scan and fires ROTATION when the
 * current subnet shows a HARD hostility signal:
 *
 *   negative-net      opportunity engine's net P&L for the subnet is < $0/mo
 *   winner-take-all   seat tier collapsed to DONT_ENTER (<5% of seats earn
 *                     or top-10% of UIDs take ≥95% of the incentive)
 *   knife-fight       seat tier is KNIFE_FIGHT AND a strictly better
 *                     reachable target exists (only fires when leaving is
 *                     actually justified — never nags on the best option)
 *
 * For every event the evidence carries the engine's next-best reachable
 * target: computeRankSimulator's EV ranking for THIS rig (same live snapshot
 * the explorer and rank simulator read), excluding the current subnet and a
 * 72h cooldown set of recently-tried targets — so a flapping subnet can't
 * machine-gun the rig back and forth.
 *
 * Safety model: ROTATION is DETECTION + PREPARATION. The act (recycle this
 * deployment toward the target) stays approval-gated — registration burn and
 * provisioning spend are money, and money moves only when a human approves.
 * Autopilot rules must never auto-execute a redeploy rotation (denylisted in
 * autopilot.ts, same policy as ARBITRAGE "recycle").
 */

const COOLDOWN_MS = 72 * 60 * 60 * 1000;

export interface RotationPassResult {
  evaluatedAt: string;
  deployments: number;
  committed: number;
  refreshed: number;
  healthy: number;
  notes: string[];
}

interface LiveSub {
  netuid: number;
  name?: string | null;
  minersCount?: number | null;
  rewardedMiners?: number | null;
  top10IncentiveShare?: number | null;
  minerEmissionTaoPerDay?: number | null;
  rewardRealizability?: number | null;
  burnCostTao?: number | null;
}

interface OppSub {
  classification?: string | null;
  difficulty?: string | null;
  netMonthlyUsd?: number | null;
}

function parseSubnets(json: string): Map<number, LiveSub> {
  try {
    const arr = JSON.parse(json) as LiveSub[];
    if (!Array.isArray(arr)) return new Map();
    return new Map(arr.filter((s) => s && typeof s.netuid === "number").map((s) => [s.netuid, s]));
  } catch {
    return new Map();
  }
}

/** Rotation reason buckets — the hard hostility signals worth a redeploy. */
type RotationReason = "negative-net" | "winner-take-all" | "knife-fight";

const REASON_HEADLINE: Record<RotationReason, string> = {
  "negative-net": "subnet is net-negative after costs",
  "winner-take-all": "reward spread collapsed to winner-take-all",
  "knife-fight": "seat odds regressed to knife-fight with better targets reachable",
};

export async function runComputeRotationPass(): Promise<RotationPassResult> {
  const now = new Date();
  const result: RotationPassResult = {
    evaluatedAt: now.toISOString(),
    deployments: 0,
    committed: 0,
    refreshed: 0,
    healthy: 0,
    notes: [],
  };

  // --- Live inputs — the same snapshot trio the explorer / rank-sim read ---
  const [snap, oppDay, overrides, prof] = await Promise.all([
    db.chainSnapshot.findFirst({ orderBy: { createdAt: "desc" } }),
    db.opportunitySnapshot.aggregate({ _max: { day: true } }),
    db.subnetOverride.findMany({ select: { netuid: true, hostingRequirements: true } }),
    db.profitabilitySettings.findFirst(),
  ]);
  if (!snap) {
    result.notes.push("no chain snapshot yet — pass skipped");
    return result;
  }
  const live = parseSubnets(snap.subnetsJson);
  if (live.size === 0) {
    result.notes.push("empty subnetsJson — pass skipped");
    return result;
  }

  const oppByNetuid = new Map<number, OppSub>();
  if (oppDay._max.day) {
    const opps = await db.opportunitySnapshot.findMany({
      where: { day: oppDay._max.day },
      select: { netuid: true, classification: true, difficulty: true, netMonthlyUsd: true },
    });
    for (const o of opps) {
      oppByNetuid.set(o.netuid, {
        classification: o.classification,
        difficulty: o.difficulty,
        netMonthlyUsd: o.netMonthlyUsd,
      });
    }
  }

  const teeRequiredByNetuid = new Map<number, boolean>();
  for (const o of overrides) {
    if (!o.hostingRequirements) continue;
    try {
      const h = JSON.parse(o.hostingRequirements) as Record<string, unknown>;
      teeRequiredByNetuid.set(o.netuid, h.teeRequired === true);
    } catch {
      /* malformed hosting JSON — treat as not TEE-gated */
    }
  }

  const taoUsd = snap.taoPriceUsd ?? 0;
  const targetUsdPerMonth = prof?.minNetProfitTargetUsd ?? null;

  // --- Live deployments -----------------------------------------------------
  const deps = await db.deployment.findMany({
    where: { status: "running" },
    select: { id: true, netuid: true, gpuModel: true, minerName: true, subnetName: true },
  });
  result.deployments = deps.length;
  if (deps.length === 0) return result;

  // Rank-sim universe is rig-shaped — build it once from the first dep's
  // card (per-dep overrides below re-run only when the card differs).
  const rigModelFor = (gpuModel: string | null): string | undefined => {
    if (gpuModel && GPU_BUY_CATALOG.some((c) => c.model === gpuModel)) return gpuModel;
    const vram = prof?.rigGpuVramGb;
    if (vram != null && vram > 0) {
      return GPU_BUY_CATALOG.find((c) => c.vramGb === vram)?.model;
    }
    return undefined; // lib default card
  };

  const simCache = new Map<string, ReturnType<typeof computeRankSimulator>>();
  const simFor = (gpuModel: string | null) => {
    const key = rigModelFor(gpuModel) ?? "__default__";
    let sim = simCache.get(key);
    if (!sim) {
      sim = computeRankSimulator({
        rows: GPU_RESEARCH_ROWS.map((r) => ({
          netuid: r.netuid,
          name: r.name,
          repo: r.repo,
          cls: r.cls,
          models: r.models,
          headline: r.headline,
          gpuCount: r.gpuCount,
          vramFloor: r.vramFloor,
          evidence: r.evidence,
        })),
        liveByNetuid: new Map(
          Array.from(live.values()).map((s) => [
            s.netuid,
            {
              minerEmissionTaoPerDay: s.minerEmissionTaoPerDay ?? null,
              minersCount: s.minersCount ?? null,
              rewardedMiners: s.rewardedMiners ?? null,
              rewardRealizability: s.rewardRealizability ?? null,
              top10IncentiveShare: s.top10IncentiveShare ?? null,
              burnCostTao: s.burnCostTao ?? null,
            },
          ]),
        ),
        oppByNetuid,
        teeRequiredByNetuid,
        taoUsd,
        gpuModel: rigModelFor(gpuModel),
      });
      simCache.set(key, sim);
    }
    return sim;
  };

  for (const dep of deps) {
    const cur = live.get(dep.netuid);
    if (!cur) {
      result.notes.push(`dep ${dep.id} (${dep.minerName}): SN${dep.netuid} missing from snapshot — skipped`);
      continue;
    }
    const opp = oppByNetuid.get(dep.netuid);
    const tier = computeRawWinTier(cur);

    // --- Hostility detection ------------------------------------------------
    let reason: RotationReason | null = null;
    if (opp?.netMonthlyUsd != null && opp.netMonthlyUsd < 0) {
      reason = "negative-net";
    } else if (tier === "DONT_ENTER") {
      reason = "winner-take-all";
    } else if (tier === "KNIFE_FIGHT") {
      // Knife-fight only rotates when a better target actually exists —
      // checked below after ranking; provisionally mark it.
      reason = "knife-fight";
    }
    if (!reason) {
      result.healthy += 1;
      continue;
    }

    // --- Next-best reachable target (cooldown-excluded EV ranking) ----------
    const cooldown = new Set<number>([dep.netuid]);
    const recent = await db.triggerEvent.findMany({
      where: {
        kind: "ROTATION",
        deploymentId: dep.id,
        status: { in: ["acted", "dismissed"] },
        updatedAt: { gte: new Date(now.getTime() - COOLDOWN_MS) },
      },
      select: { evidenceJson: true },
      take: 20,
    });
    for (const ev of recent) {
      try {
        const to = (JSON.parse(ev.evidenceJson) as { toNetuid?: unknown }).toNetuid;
        if (typeof to === "number") cooldown.add(to);
      } catch {
        /* legacy evidence — ignore */
      }
    }

    const sim = simFor(dep.gpuModel);
    const target = sim.ranked.find((r) => !cooldown.has(r.netuid)) ?? null;
    const currentRow = sim.ranked.find((r) => r.netuid === dep.netuid) ?? null;

    if (reason === "knife-fight") {
      // Only fire when leaving is justified: a target that beats the current
      // EV materially (≥1.5×, or current earns nothing and target earns).
      const curEv = currentRow?.evUsdPerDay ?? 0;
      const toEv = target?.evUsdPerDay ?? 0;
      const justified = toEv > 0 && (curEv <= 0 ? true : toEv >= curEv * 1.5);
      if (!justified || !target) {
        result.healthy += 1;
        continue;
      }
    }

    // --- Commit (deduped per deployment; evidence refreshes with the live
    // target so the approval card always shows TODAY'S best destination) ----
    const toLabel = target ? `SN${target.netuid} ${target.name}` : "no reachable target today";
    const uplift =
      target && currentRow?.evUsdPerDay && currentRow.evUsdPerDay > 0
        ? (target.evUsdPerDay ?? 0) / currentRow.evUsdPerDay
        : null;
    const dedupeKey = `rotation-${dep.id}`;
    const title = target
      ? `SN${dep.netuid} turned hostile — rotate this rig to ${toLabel}`
      : `SN${dep.netuid} turned hostile — no better subnet clears the bar today`;
    const detail =
      `Compute-rotation watcher: ${REASON_HEADLINE[reason]}. ` +
      `Current spread: ${cur.rewardedMiners != null && (cur.minersCount ?? 0) > 0 ? `${((cur.rewardedMiners / (cur.minersCount ?? 1)) * 100).toFixed(1)}% of seats earned` : "unknown"}, ` +
      `${cur.top10IncentiveShare != null ? `top-10% take ${Math.round(cur.top10IncentiveShare * 100)}%` : "concentration unknown"}` +
      `${tier ? ` (seat tier ${WIN_TIER_STYLES[tier].label})` : ""}` +
      `${opp?.classification ? `, platform verdict ${opp.classification}` : ""}. ` +
      (target
        ? `Next-best reachable target for this rig: ${toLabel} — EV ${target.evUsdPerDay != null ? `$${target.evUsdPerDay.toFixed(2)}/d` : "n/a"} vs current ${currentRow?.evUsdPerDay != null ? `$${currentRow.evUsdPerDay.toFixed(2)}/d` : "n/a"}` +
          `${uplift != null && uplift > 0 ? ` (${uplift.toFixed(1)}× uplift)` : ""}` +
          `${target.netMonthlyUsd != null ? `, platform net ${target.netMonthlyUsd >= 0 ? "+" : ""}$${target.netMonthlyUsd.toFixed(0)}/mo` : ""}. ` +
          `Approving recycles this deployment: the miner spins down, billing stops, and the Deployment wizard re-targets ${toLabel} (registration burn ${target.burnTao != null ? `${target.burnTao.toFixed(3)} τ` : "≈ τ"} + provisioning spend).`
        : `Every other reachable subnet is cooldown-blocked or ranks worse than staying — the honest move is to wait or recycle without a target. Re-run the rank simulator before deciding.`);

    const commit = await commitFinding({
      kind: "ROTATION",
      severity: reason === "knife-fight" ? "warning" : "critical",
      dedupeKey,
      title,
      detail,
      deploymentId: dep.id,
      netuid: dep.netuid,
      evidence: {
        reason,
        fromNetuid: dep.netuid,
        fromName: cur.name ?? `SN${dep.netuid}`,
        from: {
          seatTier: tier,
          minersCount: cur.minersCount ?? null,
          rewardedMiners: cur.rewardedMiners ?? null,
          top10IncentiveShare: cur.top10IncentiveShare ?? null,
          evUsdPerDay: currentRow?.evUsdPerDay ?? null,
          classification: opp?.classification ?? null,
          netMonthlyUsd: opp?.netMonthlyUsd ?? null,
        },
        toNetuid: target?.netuid ?? null,
        toName: target?.name ?? null,
        to: target
          ? {
              seatTier: target.seatTier,
              evUsdPerDay: target.evUsdPerDay,
              medianUsdPerDay: target.medianUsdPerDay,
              winnerUsdPerDay: target.winnerUsdPerDay,
              topDecileUsdPerDay: target.topDecileUsdPerDay,
              classification: target.classification,
              netMonthlyUsd: target.netMonthlyUsd,
              burnTao: target.burnTao,
            }
          : null,
        upliftX: uplift,
        rig: { model: sim.rig.model, label: sim.rig.label, vramGb: sim.rig.vramGb },
        targetUsdPerMonth,
        suggestedAction: target ? "redeploy" : "evaluate",
        cooldownNetuids: Array.from(cooldown),
      },
      runbook: [
        target
          ? `Open the rank simulator and sanity-check ${toLabel} against the rest of the board`
          : "Open the rank simulator — the board has no better target right now",
        "Check the diligence panel of the target subnet BEFORE approving (warnings, ramp, whale share)",
        target
          ? "Approve to recycle: miner spins down, billing stops, wizard re-targets " + toLabel
          : "Keep the rig warm or recycle without a target — do not register into a worse subnet",
        "After redeploy: registration burn + bond ramp apply — expect the first epochs at reduced weight",
      ],
    });
    if (commit === "created") result.committed += 1;
    else if (commit === "refreshed") result.refreshed += 1;
    else result.healthy += 1;
  }

  return result;
}
