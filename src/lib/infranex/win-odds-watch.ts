import { db } from "@/lib/db";
import { commitFinding, autoResolve } from "./triggers-core";
import {
  computeRawWinTier,
  WIN_TIER_RANK,
  WIN_TIER_STYLES,
} from "./win-odds";

/**
 * WIN-ODDS-1 — the seat-flip watcher.
 *
 * Answers the miner's standing prayer: "tell me when a winner-take-all
 * subnet starts paying its miners again". Stateless across passes — the
 * previous tier is recomputed from the PREVIOUS ChainSnapshot row, so a
 * recycle or restart cannot lose the baseline.
 *
 * Flip detection (per netuid, last two scans):
 *   tier(prev) → tier(cur) via computeRawWinTier on the stored
 *   subnetsJson (rewardedMiners/minersCount/top10IncentiveShare).
 *   Only IMPROVEMENTS alert (KNIFE_FIGHT → FIGHTABLE etc.); regressions
 *   resolve the open event instead ("condition recovered").
 *
 * Findings are TriggerEvents kind=SEAT_FLIP — they surface in the trigger
 * center / bell like every other finding, and are deduped per
 * (netuid, from→to) while the condition stays open.
 */

interface RawSub {
  netuid: number;
  name?: string | null;
  minersCount?: number | null;
  rewardedMiners?: number | null;
  top10IncentiveShare?: number | null;
  rewardMedianShare?: number | null;
  maxUids?: number | null;
}

function parseSubnets(json: string): Map<number, RawSub> {
  try {
    const arr = JSON.parse(json) as RawSub[];
    if (!Array.isArray(arr)) return new Map();
    return new Map(
      arr
        .filter((s) => s && typeof s.netuid === "number")
        .map((s) => [s.netuid, s])
    );
  } catch {
    return new Map();
  }
}

function spreadLine(s: RawSub): string {
  const parts: string[] = [];
  if (s.rewardedMiners != null && (s.minersCount ?? 0) > 0) {
    const pct = (s.rewardedMiners / (s.minersCount ?? 1)) * 100;
    parts.push(
      `${pct > 0 && pct < 1 ? pct.toFixed(1) : Math.round(pct)}% of slots earned`
    );
  } else {
    parts.push("reward spread unknown");
  }
  if (s.top10IncentiveShare != null) {
    parts.push(`top-10% of UIDs take ${Math.round(s.top10IncentiveShare * 100)}%`);
  }
  return parts.join(", ");
}

export interface WinTierWatchResult {
  checked: number;
  committed: number;
  resolved: number;
}

export async function runWinTierWatchPass(): Promise<WinTierWatchResult> {
  const snaps = await db.chainSnapshot.findMany({
    orderBy: { id: "desc" },
    take: 2,
    select: { id: true, createdAt: true, subnetsJson: true },
  });
  if (snaps.length < 2) return { checked: 0, committed: 0, resolved: 0 };
  const [curSnap, prevSnap] = snaps;
  const cur = parseSubnets(curSnap.subnetsJson);
  const prev = parseSubnets(prevSnap.subnetsJson);
  if (cur.size === 0 || prev.size === 0) {
    return { checked: 0, committed: 0, resolved: 0 };
  }

  // Open SEAT_FLIP events grouped by netuid — a tier that regressed back
  // (or changed shape) means the alert's condition is no longer true.
  const open = await db.triggerEvent.findMany({
    where: { kind: "SEAT_FLIP", status: "open" },
    select: { id: true, netuid: true, dedupeKey: true, evidenceJson: true },
  });
  let resolved = 0;
  for (const ev of open) {
    if (ev.netuid == null) continue;
    const curTier = cur.get(ev.netuid)
      ? computeRawWinTier(cur.get(ev.netuid)!)
      : null;
    let evTo: string | null = null;
    try {
      evTo = (JSON.parse(ev.evidenceJson) as { to?: string }).to ?? null;
    } catch {
      /* legacy row without evidence — leave it */
    }
    if (evTo && curTier != null && evTo !== curTier) {
      resolved += await autoResolve("SEAT_FLIP", ev.dedupeKey);
    }
  }

  let committed = 0;
  let checked = 0;
  for (const [netuid, c] of cur) {
    const p = prev.get(netuid);
    if (!p) continue;
    const curTier = computeRawWinTier(c);
    const prevTier = computeRawWinTier(p);
    if (!curTier || !prevTier || curTier === prevTier) continue;
    checked += 1;
    if (WIN_TIER_RANK[curTier] >= WIN_TIER_RANK[prevTier]) continue; // improvement only

    const dedupeKey = `seat-flip-${netuid}-${prevTier}-to-${curTier}`;
    const name = c.name ?? `SN${netuid}`;
    const result = await commitFinding({
      kind: "SEAT_FLIP",
      severity: curTier === "OPEN_FIELD" ? "warning" : "info",
      dedupeKey,
      title: `SN${netuid} ${name}: new seats can now earn — ${WIN_TIER_STYLES[prevTier].label} → ${WIN_TIER_STYLES[curTier].label}`,
      detail:
        `Reward spread flipped up between the last two chain scans. ` +
        `Before: ${spreadLine(p)}. Now: ${spreadLine(c)}. ` +
        `A freshly registered seat has a realistic chance to earn here — ` +
        `read the "Can I win here?" panel on Opportunities before burning ` +
        `the registration fee.`,
      evidence: {
        from: prevTier,
        to: curTier,
        prev: {
          rewardedMiners: p.rewardedMiners ?? null,
          minersCount: p.minersCount ?? null,
          top10IncentiveShare: p.top10IncentiveShare ?? null,
        },
        now: {
          rewardedMiners: c.rewardedMiners ?? null,
          minersCount: c.minersCount ?? null,
          top10IncentiveShare: c.top10IncentiveShare ?? null,
        },
      },
      netuid,
      runbook: [
        "Open Opportunities → 'Can I win here?' panel and filter to the new tier",
        "Check the your-rig $/mo projection + the row's why-lines (full subnet? ramp?)",
        "Open the subnet's diligence panel — read the warnings BEFORE the burn",
        "If entering: register, then expect the bond ramp before full weight",
      ],
    });
    if (result === "created") committed += 1;
  }

  return { checked, committed, resolved };
}
