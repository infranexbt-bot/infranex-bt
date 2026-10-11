/**
 * verify-sn51-fix.ts — Task: sn51-tee-correction, verification step.
 *
 * Runs the app's OWN decision code (resolveCompat) against the SN51 row:
 *  - corrected hosting JSON (as now stored in the DB), and
 *  - the pre-correction hosting JSON (teeRequired=true),
 * to prove the verdict flip the UI will render.
 *
 * Run: bun scripts/verify-sn51-fix.ts
 */

import { PrismaClient } from "@prisma/client";
import { resolveCompat } from "../src/lib/infranex/compat";

const db = new PrismaClient();

async function main() {
  const row = await db.subnetOverride.findUnique({ where: { netuid: 51 } });
  if (!row) throw new Error("SN51 row missing");

  const now = JSON.parse(row.hostingRequirements!);
  const before = { ...now, teeRequired: true };

  for (const [label, hosting] of [["BEFORE correction", before], ["AFTER correction", now]] as const) {
    const c = resolveCompat(51, hosting, row.githubUrl);
    console.log(
      `${label}: tier=${c.tier} | needsTee=${c.needsTee} | containerCloudsOk=${c.containerCloudsOk} | source=${c.source}`
    );
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
