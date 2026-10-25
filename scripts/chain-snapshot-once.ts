#!/usr/bin/env node
/**
 * chain-snapshot-once.ts — run ONE chain sweep and persist it as a
 * ChainSnapshot row, without starting the full 8-worker storm.
 *
 * Why: on this 4GB host the boot-time OOM-guard keeps all background
 * workers disabled (MEMORY-GUARD-2), so ChainSnapshot stays empty and any
 * DB-snapshot-driven view (e.g. Miner Playbook live metrics) renders with
 * blockNumber=null / taoPriceUsd=0. This script is the light, safe
 * alternative to /api/workers/trigger (which fires all 8 workers incl.
 * the ~100-repo-scrape GitHub storm that got the box OOM-killed before).
 *
 * Run: bun --smol scripts/chain-snapshot-once.ts [snapshot.json]
 *   - With a file arg (e.g. a saved /api/network response): persists it
 *     directly — fast path, no chain sweep.
 *   - Without arg: runs a live fetchLiveSnapshot() sweep (slow, can take
 *     minutes on 129 subnets).
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { fetchLiveSnapshot } from "../src/lib/infranex/chain";

const db = new PrismaClient();

async function main() {
  const argFile = process.argv[2];
  const snap = argFile
    ? JSON.parse(readFileSync(argFile, "utf8"))
    : await fetchLiveSnapshot();
  const created = await db.chainSnapshot.create({
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
    select: { id: true, blockNumber: true, taoPriceUsd: true, scannedSubnets: true, createdAt: true },
  });
  console.log("snapshot written:", JSON.stringify(created));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
