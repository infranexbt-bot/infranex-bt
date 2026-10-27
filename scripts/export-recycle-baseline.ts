#!/usr/bin/env node
/**
 * export-recycle-baseline.ts — snapshot the seedable catalog into
 * scripts/recycle-baseline.json so the boot-time auto-restore guard
 * (src/lib/infranex/boot-restore.ts) can rebuild an empty DB with zero
 * network access after a sandbox recycle wipes db/custom.db.
 *
 * Captures: SubnetOverride rows (incl. GitHub enrichment), SubnetPlaybook
 * rows, the latest ChainSnapshot (marked source="baseline" on insert), and
 * the ProfitabilitySettings singleton (operator rig profile).
 *
 * Run after any restore/enrichment: bun --smol scripts/export-recycle-baseline.ts
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";

const db = new PrismaClient();
const OUT = "scripts/recycle-baseline.json";

async function main() {
  const [overrides, playbook, snap, settings] = await Promise.all([
    db.subnetOverride.findMany({
      select: {
        netuid: true, name: true, description: true, category: true,
        minVramGb: true, recommendedGpu: true, gpuCount: true,
        hostingRequirements: true, mechanicsJson: true, infraJson: true,
        requirementsSource: true, githubUrl: true, website: true, tags: true,
      },
      orderBy: { netuid: "asc" },
    }),
    db.subnetPlaybook.findMany({ orderBy: { netuid: "asc" } }),
    db.chainSnapshot.findFirst({ orderBy: { createdAt: "desc" } }),
    db.profitabilitySettings.findUnique({ where: { id: 1 } }),
  ]);

  if (overrides.length === 0 || playbook.length === 0) {
    console.error("REFUSING: overrides/playbook empty — restore first, then export.");
    process.exit(1);
  }

  const baseline = {
    exportedAt: new Date().toISOString(),
    settings: settings
      ? {
          minNetProfitTargetUsd: settings.minNetProfitTargetUsd,
          targetTaoPerMonth: settings.targetTaoPerMonth,
          assumedTaoPriceUsd: settings.assumedTaoPriceUsd,
          storageMonthlyUsd: settings.storageMonthlyUsd,
          infraMonthlyUsd: settings.infraMonthlyUsd,
          otherOpexMonthlyUsd: settings.otherOpexMonthlyUsd,
          hardwareMode: settings.hardwareMode,
          electricityUsdPerKwh: settings.electricityUsdPerKwh,
          rigGpuVramGb: settings.rigGpuVramGb,
          rigTeeCapable: settings.rigTeeCapable,
          includeRegistrationBurn: settings.includeRegistrationBurn,
          amortizeBurnMonths: settings.amortizeBurnMonths,
          riskAdjustment: settings.riskAdjustment,
        }
      : null,
    overrides: overrides.map((o) => ({ ...o, requirementsScrapedAt: null })),
    playbook: playbook.map((p) => ({
      netuid: p.netuid,
      whatItDoes: p.whatItDoes,
      hardwareRec: p.hardwareRec,
      keyRequirements: p.keyRequirements,
      minerJob: p.minerJob,
      minerJobProvide: p.minerJobProvide,
      top10Strategy: p.top10Strategy,
      top10Levers: p.top10Levers,
      followTopMiners: p.followTopMiners,
      confidence: p.confidence,
      sources: p.sources,
      researchedAt: p.researchedAt,
    })),
    snapshot: snap
      ? {
          blockNumber: snap.blockNumber,
          totalSubnets: snap.totalSubnets,
          scannedSubnets: snap.scannedSubnets,
          neuronCount: snap.neuronCount,
          taoPriceUsd: snap.taoPriceUsd,
          taoMarketCapUsd: snap.taoMarketCapUsd,
          taoChange24h: snap.taoChange24h,
          subnetsJson: snap.subnetsJson,
          neuronsJson: snap.neuronsJson,
          source: "baseline",
          capturedAt: snap.createdAt,
        }
      : null,
  };

  writeFileSync(OUT, JSON.stringify(baseline));
  const mb = (JSON.stringify(baseline).length / 1024 / 1024).toFixed(2);
  console.log(
    `baseline written: ${OUT} — overrides=${overrides.length} playbook=${playbook.length} snapshot=${snap ? "yes(b" + snap.blockNumber + ")" : "no"} settings=${settings ? settings.hardwareMode + "/" + settings.rigGpuVramGb + "GB" : "none"} (${mb}MB)`
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
