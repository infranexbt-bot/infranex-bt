#!/usr/bin/env node
/**
 * reseed-overrides-from-chain.ts — after a sandbox DB reset, SubnetOverride
 * (the merge-playbook gate table) can be near-empty. This restores the rows
 * the playbook batches need from LIVE chain identity data — no scraping.
 *
 * Faithful-by-construction: githubUrl/name come straight from the chain
 * (identityGithub), same universe rule as sync-overrides-standalone.ts
 * (chain identity branch). CREATE-ONLY: existing rows are never updated,
 * so hand-scraped metadata on surviving rows can't be clobbered.
 *
 * Input: /api/network response saved to tool-results/net-live.json
 * Run: bun --smol scripts/reseed-overrides-from-chain.ts
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const db = new PrismaClient();
const INPUT = process.argv[2] ?? "tool-results/net-live.json";
// Only the netuids the playbook batches gate on — nothing extra invented.
const BATCH_NETUIDS = new Set<number>();
for (let b = 1; b <= 6; b++) {
  const rows = JSON.parse(readFileSync(`scripts/playbook/batch-${b}-output.json`, "utf8")) as Array<{ netuid: number }>;
  for (const r of rows) BATCH_NETUIDS.add(r.netuid);
}

async function main() {
  const net = JSON.parse(readFileSync(INPUT, "utf8")) as {
    subnets?: Array<{ netuid: number; name?: string | null; identityGithub?: string | null }>;
  };
  const subs = net.subnets ?? [];
  if (!subs.length) {
    console.error("no subnets in input — aborting");
    process.exit(1);
  }

  const existing = new Set((await db.subnetOverride.findMany({ select: { netuid: true } })).map((o) => o.netuid));
  let created = 0;
  let skippedHave = 0;
  let missingIdentity = 0;
  for (const n of BATCH_NETUIDS) {
    if (existing.has(n)) { skippedHave++; continue; }
    const s = subs.find((x) => x.netuid === n);
    if (!s?.identityGithub) { missingIdentity++; console.error(`SN${n}: no live identityGithub — skipped`); continue; }
    await db.subnetOverride.create({
      data: { netuid: n, githubUrl: s.identityGithub, name: s.name ?? null },
    });
    created++;
  }
  console.log(
    `overrides: created=${created} already-present=${skippedHave} no-identity=${missingIdentity} | gate coverage now: ${
      BATCH_NETUIDS.size - missingIdentity
    }/${BATCH_NETUIDS.size}`
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
