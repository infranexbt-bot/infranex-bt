// Pre-validation runner — executes computeBuyDecision with the real DB rows
// and prints the decision table, so the math is verified before the API/UI
// are built. Run: bun scripts/gpu-decision-calc.ts
import { PrismaClient } from "@prisma/client";
import { computeBuyDecision, type BuyDecisionLive, type BuyDecisionOpportunity } from "../src/lib/infranex/gpu-buy-decision";
import { GPU_RESEARCH_ROWS } from "../src/lib/infranex/gpu-research-seed";

const db = new PrismaClient();

async function main() {
  const [snap, day] = await Promise.all([
    db.chainSnapshot.findFirst({ orderBy: { createdAt: "desc" } }),
    db.opportunitySnapshot.aggregate({ _max: { day: true } }),
  ]);
  const settings = await db.profitabilitySettings.findUnique({ where: { id: 1 } });
  const overrides = await db.subnetOverride.findMany({
    select: { netuid: true, hostingRequirements: true },
  });

  const taoUsd = snap?.taoPriceUsd ?? 0;
  const liveList = snap ? (JSON.parse(snap.subnetsJson) as Record<string, unknown>[]) : [];
  const liveByNetuid = new Map<number, BuyDecisionLive>();
  for (const s of liveList) {
    if (typeof s.netuid !== "number") continue;
    liveByNetuid.set(s.netuid, {
      minerEmissionTaoPerDay: s.minerEmissionTaoPerDay as number | null,
      minersCount: s.minersCount as number | null,
      rewardedMiners: s.rewardedMiners as number | null,
      rewardRealizability: s.rewardRealizability as number | null,
    });
  }

  const oppByNetuid = new Map<number, BuyDecisionOpportunity>();
  if (day._max.day) {
    const opps = await db.opportunitySnapshot.findMany({ where: { day: day._max.day } });
    for (const o of opps) {
      oppByNetuid.set(o.netuid, {
        netMonthlyUsd: o.netMonthlyUsd,
        netTaoPerMonth: o.netTaoPerMonth,
        gpuCostMonthlyUsd: o.gpuCostMonthlyUsd,
        classification: o.classification,
        difficulty: o.difficulty,
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
      /* ignore malformed */
    }
  }

  // Goal line: the user's stated floor in this engagement (2 TAO/mo) vs the
  // settings target — the panel uses the stricter of the two.
  const settingsTarget = settings?.targetTaoPerMonth ?? 1;
  const goalTaoPerMonth = Math.max(settingsTarget, 2);

  const result = computeBuyDecision({
    rows: GPU_RESEARCH_ROWS.map((r) => ({
      netuid: r.netuid,
      name: r.name,
      models: r.models,
      gpuCount: r.gpuCount,
      cls: r.cls,
    })),
    liveByNetuid,
    oppByNetuid,
    teeRequiredByNetuid,
    taoUsd,
    goalTaoPerMonth,
    electricityUsdPerKwh: settings?.electricityUsdPerKwh ?? 0.12,
  });

  console.log(`taoUsd=$${taoUsd} goal=${goalTaoPerMonth} TAO/mo ($${result.meta.goalMonthlyUsd.toFixed(0)}) block=${snap?.blockNumber} TEE-gated subnets=${[...teeRequiredByNetuid.entries()].filter(([, v]) => v).map(([k]) => k).join(",") || "none"}`);
  console.log("");
  for (const r of result.rows) {
    console.log(
      [
        r.verdict.padEnd(10),
        r.label.padEnd(34),
        `demand=${String(r.demandSubnets.length).padStart(2)} reach=${String(r.reachableSubnets.length).padStart(2)} teeBlk=${r.teeBlockedSubnets.length}`,
        `pool=${r.poolTaoPerDay?.toFixed(1) ?? "—"}`,
        `r rewarded=${r.rewardedRatioPct?.toFixed(1) ?? "—"}%`,
        `perUID=${r.perEarningUsdPerDay != null ? "$" + r.perEarningUsdPerDay.toFixed(0) + "/d" : "—"}`,
        `best=SN${r.bestSubnet?.netuid ?? "—"}($${r.entrantMonthlyUsd != null ? Math.round(r.entrantMonthlyUsd).toLocaleString() : "—"}/mo,${r.bestSubnet?.reference ?? "-"})`,
        `capex=${r.capexUsd != null ? "$" + r.capexUsd.toLocaleString() : "n/a"}`,
        `payback=${r.paybackMonths != null && r.paybackMonths < 900 ? r.paybackMonths.toFixed(1) + "mo" : "—"}`,
        `rent24/7=${r.rentMonthlyUsd != null ? "$" + Math.round(r.rentMonthlyUsd).toLocaleString() : "—"}`,
      ].join(" | ")
    );
    for (const why of r.reasons) console.log(`    · ${why}`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
