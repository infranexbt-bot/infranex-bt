/**
 * rental-1mo-analysis.ts — Task: gpu-mining-1mo-rental
 *
 * "Best subnet to mine for ONE MONTH on a RENTED 4090 or 5090."
 *
 * Runs the platform's own honest pipeline (the same code the UI shows):
 *   fetchLiveSnapshot → mergeOpportunities (with scraped ground-truth
 *   overrides) → buildProfitRank (rental P&L + honesty flags) and filters
 *   to the consumer RTX bucket (4090/5090-eligible) from gpu-landscape.
 *
 * Prints a decision table: earn chance, newcomer-adjusted revenue, rental
 * cost, net month-1 USD, verdict, and the anti-hype flags (whale mean,
 * knife-fight, seat cost).
 */
import { fetchLiveSnapshot } from "../src/lib/infranex/chain";
import { db } from "../src/lib/db";
import { mergeOpportunities } from "../src/lib/infranex/live-merge";
import { buildProfitRank } from "../src/lib/infranex/profit-rank";
import { resolveCompat } from "../src/lib/infranex/compat";
import {
  classifyGpuLandscape,
  buildLive,
  type LandscapeLive,
} from "../src/lib/infranex/gpu-landscape";

async function main() {
  const snap = await fetchLiveSnapshot();
  const taoUsd = snap.taoPriceUsd || 0;
  console.log(
    `snapshot: block ${snap.blockNumber} · TAO $${taoUsd} · subnets ${snap.subnets.length}`
  );

  // --- Scraped ground truth (README requirements beat the classifier) ------
  const ovrRows = await db.subnetOverride.findMany();
  const overrides = new Map<number, Record<string, unknown>>();
  const compatByNetuid = new Map<number, ReturnType<typeof resolveCompat>>();
  for (const r of ovrRows) {
    let hosting: unknown = null;
    if (r.hostingRequirements) {
      try { hosting = JSON.parse(r.hostingRequirements); } catch { /* ignore */ }
    }
    let mechanics: unknown = null;
    if (r.mechanicsJson) {
      try { mechanics = JSON.parse(r.mechanicsJson); } catch { /* ignore */ }
    }
    overrides.set(r.netuid, {
      name: r.name ?? undefined,
      recommendedGpu: r.recommendedGpu,
      gpuCount: r.gpuCount,
      minVramGb: r.minVramGb,
      hosting,
      mechanics,
      requirementsSource: r.requirementsSource,
    });
    compatByNetuid.set(r.netuid, resolveCompat(r.netuid, hosting, r.githubUrl));
  }

  // --- Consumer bucket (4090/5090-eligible) from the landscape classifier --
  const liveByNetuid = new Map<number, LandscapeLive>();
  for (const s of snap.subnets) {
    liveByNetuid.set(s.netuid, buildLive(s, taoUsd));
  }
  const buckets = classifyGpuLandscape(
    ovrRows.map((r) => ({
      netuid: r.netuid,
      name: r.name,
      recommendedGpu: r.recommendedGpu,
      minVramGb: r.minVramGb,
      gpuCount: r.gpuCount,
      hostingRequirements: r.hostingRequirements,
      requirementsSource: r.requirementsSource,
    })),
    liveByNetuid,
    taoUsd
  );
  const consumerIds = new Set(buckets.consumer.map((e) => e.netuid));

  // --- Full platform pipeline ---------------------------------------------
  const ops = mergeOpportunities(snap, undefined, overrides);
  const rows = buildProfitRank(ops, snap.subnets, compatByNetuid);

  const candidates = rows
    .filter((r) => consumerIds.has(r.netuid) && r.status !== "inactive")
    .sort((a, b) => (b.netMonthlyUsd ?? -1e9) - (a.netMonthlyUsd ?? -1e9));

  console.log(
    `\nRENTED 4090/5090 · 1-MONTH TEST — consumer-bucket candidates (${candidates.length})`
  );
  console.log(
    "rent model: engine container rate (4090 ≈ $260/mo) unless bare-metal flagged"
  );
  for (const r of candidates) {
    const op = ops.find((o) => o.netuid === r.netuid);
    const ec = op?.earnChance;
    const host = compatByNetuid.get(r.netuid);
    const ovr = overrides.get(r.netuid);
    const h = (ovr?.hosting ?? null) as
      | { teeRequired?: boolean; bareMetalOnly?: boolean; staticIpRequired?: boolean }
      | null;
    const flags = [
      h?.bareMetalOnly ? "BARE-METAL" : null,
      h?.teeRequired ? "TEE" : null,
      h?.staticIpRequired ? "STATIC-IP" : null,
      r.whaleMean ? "WHALE-MEAN" : null,
      r.knifeFight ? "KNIFE-FIGHT" : null,
    ]
      .filter(Boolean)
      .join(",");
    const burn = op?.burnCostTao;
    console.log(
      [
        `\nSN${r.netuid} ${r.name} [${r.symbol}]`,
        `  gpu: ${r.gpuClass} ×${r.gpuCount} · costClass=${r.costClass ?? "-"} · compat=${host?.tier ?? "-"}`,
        `  seats: ${r.minersCount} reg · rewardedRatio=${r.rewardedRatioPct ?? "?"}% · burn=${burn != null ? burn.toFixed(3) : "?"} TAO`,
        `  earnChance: ${ec ? `${ec.level} (${ec.pct}%) — ${ec.note}` : "?"}`,
        `  month-1 P&L: revenue=${r.revenueMonthlyUsd} rent=${r.rentalMonthlyUsd} infra=${r.infraMonthlyUsd} → NET=${r.netMonthlyUsd} (margin=${r.marginPct ?? "?"}%, rentCov=${r.rentCoverageX ?? "?"}x)`,
        `  verdict: ${r.verdict ?? "-"} · score=${r.score} · alpha24h=${op?.alphaChange24h ?? "?"}`,
        `  flags: ${flags || "none"}`,
      ].join("\n")
    );
  }

  // --- Reference rates for the report --------------------------------------
  console.log("\nRENTAL RATES (engine, container): 4090=$260/mo · 5090 ≈ consumer24 · A6000=$320 · PRO6000=$1100");
  await db.$disconnect();
}

main().catch((e) => {
  console.error("ANALYSIS FAILED:", e);
  process.exit(1);
});
