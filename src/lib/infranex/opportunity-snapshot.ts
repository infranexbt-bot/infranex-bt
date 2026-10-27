import { db } from "@/lib/db";
import type { LiveNetworkSnapshot } from "./chain";
import { mergeOpportunities } from "./live-merge";
import { computeNetEarningsMap } from "./net-earnings";
import {
  computeOpportunityScoreMap,
  type SubnetOpportunityScore,
} from "./subnet-opportunity";
import { computeEntryDifficultyMap, type EntryDifficultyVerdict } from "./entry-difficulty";
import { classifyOpportunity } from "./opportunity-class";
import type { ProfitabilityConfig } from "./profitability";
import type { Opportunity } from "./types";

// ---------------------------------------------------------------------------
// OPPORTUNITY-ENGINE-2 — continuous opportunity snapshots (§9 of the engine
// spec). Every UTC day, each subnet's scored economics are upserted into
// OpportunitySnapshot. Purpose: measure "changes in subnet economics" over
// time and let future actuals be compared against the day's prediction.
//
// GUARANTEES:
//  · fire-and-forget — a capture failure NEVER breaks the API response
//  · once per UTC day (module-level day guard) — the hot /api/network poll
//    pays at most one upsert batch per day
//  · historical measurements only — nothing here feeds back into forecasts
// ---------------------------------------------------------------------------

let lastCaptureDay = "";

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function emissionOf(o: Opportunity): number | null {
  const v = (o as unknown as { emission?: number }).emission;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Classify + score + persist one day's snapshot batch. Safe to call often. */
export function captureOpportunitySnapshots(
  snap: LiveNetworkSnapshot,
  profConfig: ProfitabilityConfig | undefined,
  overrides?: Map<number, Record<string, unknown>>
): void {
  const day = utcDay();
  if (day === lastCaptureDay) return; // already captured today
  lastCaptureDay = day;

  void (async () => {
    try {
      const rows = mergeOpportunities(snap, profConfig, overrides);
      if (rows.length === 0) return;
      const taoUsd = snap?.taoPriceUsd ?? 0;
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const estMap = computeNetEarningsMap(rows as never[], {
        minNetTargetUsd: profConfig?.minNetProfitTargetUsd,
        hardwareMode: profConfig?.hardwareMode === "owned" ? "owned" : "rent",
      });
      const scoreMap = computeOpportunityScoreMap(rows as never[], {
        hardwareMode: profConfig?.hardwareMode === "owned" ? "owned" : "rented",
        minNetTargetUsd: profConfig?.minNetProfitTargetUsd,
        weights: profConfig?.opportunityWeights,
      });
      const diffMap = computeEntryDifficultyMap(rows as never[]);
      const scoreOf = (id: string): SubnetOpportunityScore | undefined => scoreMap.get(id);
      const diffOf = (id: string): EntryDifficultyVerdict | undefined => diffMap.get(id);

      const data = rows.map((o) => {
        const score = scoreOf(o.id);
        const est = estMap.get(o.id);
        const diff = diffOf(o.id);
        const classification = classifyOpportunity(o as never, {
          score,
          est: est ?? null,
          difficulty: diff,
        });
        return {
          netuid: o.netuid,
          day,
          scoreEffective: score?.effectiveScore ?? null,
          scoreRaw: score?.rawScore ?? null,
          netMonthlyUsd: o.netMonthlyUsd ?? null,
          netTaoPerMonth: est && taoUsd > 0 ? r2(est.base.netMonthlyUsd / taoUsd) : null,
          gpuCostMonthlyUsd: o.gpuCostMonthlyUsd ?? null,
          emissionTaoPerDay: emissionOf(o),
          minersCount: o.liveMiners ?? (o as unknown as { minersCount?: number }).minersCount ?? null,
          rewardedRatio: o.rewardedRatio ?? null,
          dataConfidence: score?.dataConfidence ?? null,
          classification: classification.action,
          difficulty: diff?.difficulty ?? null,
          source: snap?.source === "live" ? "live" : "fallback",
        };
      });

      // Chunked upserts — SQLite + one row per (netuid, day): today's second
      // call for the same day updates in place (economics moved intraday).
      for (let i = 0; i < data.length; i += 40) {
        const chunk = data.slice(i, i + 40);
        await db.$transaction(
          chunk.map((d) =>
            db.opportunitySnapshot.upsert({
              where: { netuid_day: { netuid: d.netuid, day: d.day } },
              update: { ...d },
              create: { ...d },
            })
          )
        );
      }
      console.log(`[opportunity-snapshots] captured ${data.length} rows for ${day}`);
    } catch (e) {
      console.log(
        `[opportunity-snapshots] non-fatal failure: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  })();
}
