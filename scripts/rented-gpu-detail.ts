#!/usr/bin/env node
/**
 * rented-gpu-detail.ts — targeted rent-earn detail for shortlisted netuids.
 * Run: DATABASE_URL=file:./db/custom.db bun --smol scripts/rented-gpu-detail.ts 120,35,79,123,32
 */
import { fetchLiveSnapshot } from "../src/lib/infranex/chain";
import { db } from "../src/lib/db";
import { mergeOpportunities } from "../src/lib/infranex/live-merge";
import { computeRentEarn } from "../src/lib/infranex/rent-earn";
import type { Opportunity } from "../src/lib/infranex/types";

async function main() {
  const want = new Set(
    (process.argv[2] ?? "120,35,79,123,32").split(",").map(Number)
  );
  const snap = await fetchLiveSnapshot();
  const ovrRows = await db.subnetOverride.findMany();
  const overrides = new Map<number, Record<string, unknown>>();
  for (const r of ovrRows) {
    overrides.set(r.netuid, {
      name: r.name ?? undefined,
      recommendedGpu: r.recommendedGpu,
      gpuCount: r.gpuCount,
      minVramGb: r.minVramGb,
      hostingRequirements: r.hostingRequirements
        ? JSON.parse(r.hostingRequirements)
        : undefined,
      mechanicsJson: r.mechanicsJson ?? undefined,
      requirementsSource: r.requirementsSource,
    });
  }
  const rows: Opportunity[] = await mergeOpportunities(snap, undefined, overrides);
  const pb = await db.subnetPlaybook.findMany({
    where: { netuid: { in: [...want] } },
    select: { netuid: true, whatItDoes: true, confidence: true },
  });
  const pbBy = new Map(pb.map((p) => [p.netuid, p]));

  for (const o of rows.filter((r) => want.has(r.netuid))) {
    const rent = computeRentEarn(o);
    console.log(
      [
        `SN${o.netuid} ${o.subnetName} [${o.subnetSymbol}]`,
        `  gpu: ${o.recommendedGpu ?? "-"}`,
        `  rent: ${rent.band} score=${rent.score} · EV=${rent.expectedNetMonthlyUsd ?? "?"}$/mo · earnChance=${rent.earnChancePct ?? "?"}% · notes: ${(rent.notes ?? []).join(" | ")}`,
        `  median net=$${(o.netMonthlyUsd ?? 0).toFixed(0)}/mo · APY=${o.estimatedApy}% · alpha$=${o.alphaPriceUsd ?? "?"} · liq=${o.liquidityTao ?? "?"} TAO · alpha24h=${o.alphaChange24h}%`,
        `  seats: miners=${o.minersCount ?? "?"} · rewardedRatio=${((o as Record<string, unknown>).rewardedRatioPct ?? "?")}% · top10=${o.top10IncentiveShare ?? "?"}% · burn=${o.burnCostTao ?? "?"} TAO`,
        rent.rentBlock ? `  RENT BLOCK: ${rent.rentBlock}` : `  rentable: yes`,
        `  playbook(${pbBy.get(o.netuid)?.confidence ?? "-"}): ${(pbBy.get(o.netuid)?.whatItDoes ?? "-").slice(0, 220)}`,
        "",
      ].join("\n")
    );
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
