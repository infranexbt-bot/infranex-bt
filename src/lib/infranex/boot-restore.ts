// BOOT-RESTORE (2026-10-25) — self-heal after a sandbox/DB wipe.
//
// Problem seen twice (2026-10-24 & 2026-10-25): the sandbox is recycled
// between sessions, /tmp is cleared, and `prisma db push` recreates
// db/custom.db EMPTY. SubnetOverride (112 curated rows), SubnetPlaybook
// (106 researched rows) and ChainSnapshot all vanish → Miner Playbook and
// other snapshot-driven views render "no data" even though the app itself
// boots fine.
//
// Fix: on server boot, if those tables are empty, rebuild them from
// scripts/recycle-baseline.json (a repo-committed export produced by
// scripts/export-recycle-baseline.ts). Zero network needed for the catalog;
// a best-effort live chain refresh is scheduled ~25s later (single
// sequential sweep, delayed so it can't re-create the boot-time
// all-workers OOM storm — MEMORY-GUARD-2/4).
//
// Never throws into boot: every failure is caught and logged.

import { readFileSync } from "fs";
import path from "path";
import { db } from "@/lib/db";

let decided = false; // dev hot-reload / double-register guard

interface BaselineOverride {
  netuid: number;
  name: string | null;
  description: string | null;
  category: string | null;
  minVramGb: number | null;
  recommendedGpu: string | null;
  gpuCount: number | null;
  hostingRequirements: string | null;
  mechanicsJson: string | null;
  infraJson: string | null;
  requirementsSource: string | null;
  githubUrl: string | null;
  website: string | null;
  tags: string | null;
}

interface BaselinePlaybookRow {
  netuid: number;
  whatItDoes: string;
  hardwareRec: string;
  keyRequirements: string;
  minerJob: string;
  minerJobProvide: string;
  top10Strategy: string;
  top10Levers: string;
  followTopMiners: string;
  confidence: string;
  sources: string;
  researchedAt: string | Date;
}

interface BaselineSnapshot {
  blockNumber: number; // schema: non-nullable Int
  totalSubnets: number; // schema: non-nullable Int
  scannedSubnets: number; // schema: non-nullable Int
  neuronCount: number; // schema: non-nullable Int
  taoPriceUsd: number; // schema: non-nullable Float
  taoMarketCapUsd: number; // schema: non-nullable Float
  taoChange24h: number; // schema: non-nullable Float
  subnetsJson: string;
  neuronsJson: string;
  source: string;
  capturedAt?: string; // baseline metadata — NOT a schema column, stripped on insert
}

interface BaselineSettings {
  minNetProfitTargetUsd: number;
  /** TAO-ACCUMULATION-1 — optional so pre-feature baselines still parse;
   *  absent → the DB column default (1 TAO/mo) applies on restore. */
  targetTaoPerMonth?: number;
  storageMonthlyUsd: number;
  infraMonthlyUsd: number;
  otherOpexMonthlyUsd: number;
  hardwareMode: string;
  electricityUsdPerKwh: number;
  rigGpuVramGb: number;
  rigTeeCapable: boolean;
  includeRegistrationBurn: boolean;
  amortizeBurnMonths: number;
  riskAdjustment: boolean;
}

interface Baseline {
  overrides: BaselineOverride[];
  playbook: BaselinePlaybookRow[];
  snapshot: BaselineSnapshot | null;
  /** Singleton operator profile (owned/rent, rig VRAM/TEE). Optional so older
   *  baselines without it still parse; restored when the table is empty. */
  settings?: BaselineSettings | null;
}

function baselinePath(): string {
  const candidates = [
    process.env.INFRANEX_BASELINE,
    process.env.INFRANEX_REPO_ROOT && path.join(process.env.INFRANEX_REPO_ROOT, "scripts", "recycle-baseline.json"),
    path.resolve(process.cwd(), "scripts/recycle-baseline.json"),
    path.resolve(process.cwd(), "../scripts/recycle-baseline.json"),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (readFileSync(p, { flag: "r" })) return p;
    } catch {
      // try next candidate
    }
  }
  return candidates[candidates.length - 1];
}

/** Best-effort live chain refresh (single sweep, delayed). Fire-and-forget. */
async function liveSnapshotRefresh(): Promise<void> {
  try {
    const { fetchLiveSnapshot } = await import("@/lib/infranex/chain");
    const snap = await fetchLiveSnapshot();
    await db.chainSnapshot.create({
      data: {
        blockNumber: snap.blockNumber,
        totalSubnets: snap.totalSubnets,
        scannedSubnets: snap.subnets.length,
        neuronCount: snap.neurons.length,
        taoPriceUsd: snap.taoPriceUsd,
        taoMarketCapUsd: snap.taoMarketCapUsd,
        taoChange24h: snap.taoChange24h,
        subnetsJson: JSON.stringify(snap.subnets),
        neuronsJson: JSON.stringify(snap.neurons),
        source: snap.source,
      },
    });
    // Keep last 100 (parity with runChainWorker pruning).
    const count = await db.chainSnapshot.count();
    if (count > 100) {
      const old = await db.chainSnapshot.findMany({
        orderBy: { createdAt: "desc" },
        skip: 100,
        select: { id: true },
      });
      if (old.length > 0) {
        await db.chainSnapshot.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
      }
    }
    console.log(`[boot-restore] live chain snapshot persisted (block ${snap.blockNumber})`);
  } catch (e) {
    console.log(
      `[boot-restore] live chain refresh skipped: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

/**
 * Called from instrumentation.register() at server boot. Safe to call any
 * time; runs at most once per process. Restores empty seedable tables from
 * scripts/recycle-baseline.json; leaves user/ops data untouched.
 */
export async function maybeRunBootRestore(): Promise<{ restored: string[]; skipped: boolean }> {
  const restored: string[] = [];
  if (decided) return { restored, skipped: true };
  decided = true;
  try {
    const [ovrCount, playCount, snapCount, profCount] = await Promise.all([
      db.subnetOverride.count(),
      db.subnetPlaybook.count(),
      db.chainSnapshot.count(),
      db.profitabilitySettings.count(),
    ]);
    if (ovrCount > 0 && playCount > 0 && snapCount > 0 && profCount > 0) {
      console.log(
        `[boot-restore] DB healthy (overrides=${ovrCount} playbook=${playCount} snapshots=${snapCount} settings=${profCount}) — nothing to do`
      );
      return { restored, skipped: true };
    }

    let baseline: Baseline | null = null;
    try {
      baseline = JSON.parse(readFileSync(baselinePath(), "utf8")) as Baseline;
    } catch (e) {
      console.log(
        `[boot-restore] WARNING: DB tables empty but baseline missing (${e instanceof Error ? e.message : String(e)}). ` +
          `Manual fix: bun --smol scripts/restore-after-recycle.ts && bun --smol scripts/merge-playbook.ts`
      );
    }

    if (baseline) {
      if (ovrCount === 0 && baseline.overrides?.length) {
        // Chunked createMany — stays well inside SQLite parameter limits.
        for (let i = 0; i < baseline.overrides.length; i += 40) {
          await db.subnetOverride.createMany({
            data: baseline.overrides.slice(i, i + 40).map((o) => ({ ...o })),
          });
        }
        restored.push(`overrides=${baseline.overrides.length}`);
      }
      if (playCount === 0 && baseline.playbook?.length) {
        for (let i = 0; i < baseline.playbook.length; i += 40) {
          await db.subnetPlaybook.createMany({
            data: baseline.playbook.slice(i, i + 40).map((p) => ({
              ...p,
              researchedAt: new Date(p.researchedAt),
            })),
          });
        }
        restored.push(`playbook=${baseline.playbook.length}`);
      }
      if (snapCount === 0 && baseline.snapshot?.subnetsJson &&
          typeof baseline.snapshot.blockNumber === "number") {
        const s = baseline.snapshot;
        await db.chainSnapshot.create({
          data: {
            blockNumber: s.blockNumber,
            totalSubnets: s.totalSubnets,
            scannedSubnets: s.scannedSubnets,
            neuronCount: s.neuronCount,
            taoPriceUsd: s.taoPriceUsd,
            taoMarketCapUsd: s.taoMarketCapUsd,
            taoChange24h: s.taoChange24h,
            subnetsJson: s.subnetsJson,
            neuronsJson: s.neuronsJson,
            source: "baseline",
          },
        });
        restored.push(`snapshot=block${s.blockNumber}`);
      }
      if (profCount === 0 && baseline.settings) {
        // Operator profile (OWNED-RIG-1) — restore the saved rig basis so the
        // engine scores on owned/96GB/TEE right after a recycle, instead of
        // silently reverting to rent/0GB defaults on the first GET.
        await db.profitabilitySettings.upsert({
          where: { id: 1 },
          update: { ...baseline.settings },
          create: { id: 1, ...baseline.settings },
        });
        restored.push(
          `settings=${baseline.settings.hardwareMode}/${baseline.settings.rigGpuVramGb}GB`
        );
      }
      console.log(
        restored.length
          ? `[boot-restore] restored from baseline: ${restored.join(", ")}`
          : "[boot-restore] baseline loaded but nothing needed restoring"
      );
    }

    // Refresh the catalog snapshot from the live chain in the background —
    // delayed so boot (compiles, first renders) has settled first.
    setTimeout(() => void liveSnapshotRefresh(), 25_000);
  } catch (e) {
    console.log(
      `[boot-restore] non-fatal failure: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  return { restored, skipped: restored.length === 0 };
}
