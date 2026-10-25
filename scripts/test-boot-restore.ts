#!/usr/bin/env node
/**
 * test-boot-restore.ts — safe simulation of the empty-DB boot path.
 * Run against a SCRATCH database (DATABASE_URL override), never the live one:
 *   DATABASE_URL=file:/home/z/my-project/db/scratch-restore-test.db \
 *     bun --smol scripts/test-boot-restore.ts
 * Then inspect counts with the same DATABASE_URL override.
 */
import { maybeRunBootRestore } from "../src/lib/infranex/boot-restore";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("before:", {
    overrides: await db.subnetOverride.count(),
    playbook: await db.subnetPlaybook.count(),
    snapshots: await db.chainSnapshot.count(),
  });
  const r = await maybeRunBootRestore();
  console.log("maybeRunBootRestore:", JSON.stringify(r));
  console.log("after:", {
    overrides: await db.subnetOverride.count(),
    playbook: await db.subnetPlaybook.count(),
    snapshots: await db.chainSnapshot.count(),
  });
  // second call must be a no-op (idempotence guard)
  const r2 = await maybeRunBootRestore();
  console.log("second call:", JSON.stringify(r2));
}

main()
  .catch((e) => { console.error("TEST FAILED:", e); process.exitCode = 1; })
  .finally(async () => {
    await db.$disconnect();
    // The boot-restore module schedules a delayed (25s) live chain refresh;
    // a CLI harness must not wait for it — exit explicitly.
    process.exit(process.exitCode ?? 0);
  });
