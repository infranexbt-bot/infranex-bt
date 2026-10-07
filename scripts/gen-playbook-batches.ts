#!/usr/bin/env node
/**
 * gen-playbook-batches.ts — build per-agent research input files for the
 * Miner Playbook research sweep. Splits all SubnetOverride rows into N batch
 * files under scripts/playbook/.
 *
 * Run: bun --smol scripts/gen-playbook-batches.ts
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "fs";

const db = new PrismaClient();
const N = 6;
const OUT = "scripts/playbook";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const rows = await db.subnetOverride.findMany({ orderBy: { netuid: "asc" } });
  const batches: Array<Array<Record<string, unknown>>> = Array.from({ length: N }, () => []);
  rows.forEach((r, i) => {
    let hosting: unknown = null;
    try { hosting = r.hostingRequirements ? JSON.parse(r.hostingRequirements) : null; } catch {}
    batches[i % N].push({
      netuid: r.netuid,
      name: r.name,
      category: r.category,
      description: r.description ? r.description.slice(0, 400) : null,
      recommendedGpu: r.recommendedGpu,
      minVramGb: r.minVramGb,
      gpuCount: r.gpuCount,
      hosting: hosting,
      githubUrl: r.githubUrl || r.requirementsSource || null,
      website: r.website,
    });
  });
  batches.forEach((b, i) => {
    const f = `${OUT}/batch-${i + 1}-input.json`;
    writeFileSync(f, JSON.stringify(b, null, 1));
    console.log(`${f}: ${b.length} subnets (netuids ${b[0]?.netuid}..${b[b.length - 1]?.netuid})`);
  });
  console.log(`total: ${rows.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
