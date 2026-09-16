/**
 * Identify subnets in the sync universe that have NO SubnetOverride row —
 * i.e. the scrapes that errored (rate limits / transient failures).
 * Run: bun scripts/find-failed-scrapes.ts
 */
import { PrismaClient } from "@prisma/client";
import { subnets } from "../src/lib/infranex/data";

const db = new PrismaClient();

const seen = new Map<number, string>();
for (const s of subnets) {
  if ((s as { githubUrl?: string | null }).githubUrl)
    seen.set(s.netuid, (s as { githubUrl: string }).githubUrl);
}
const existing = await db.subnetOverride.findMany();
for (const o of existing) {
  if (o.githubUrl && !seen.has(o.netuid)) seen.set(o.netuid, o.githubUrl);
}
const snapRow = await db.chainSnapshot.findFirst({ orderBy: { id: "desc" } });
if (snapRow?.subnetsJson) {
  try {
    const live = JSON.parse(snapRow.subnetsJson) as Array<{ netuid: number; identityGithub?: string | null; name?: string | null }>;
    for (const s of live) {
      if (s.identityGithub && !seen.has(s.netuid)) seen.set(s.netuid, s.identityGithub);
    }
  } catch {
    // ignore
  }
}

const have = new Set(existing.map((o) => o.netuid));
const missing = [...seen.entries()].filter(([netuid]) => !have.has(netuid));

console.log(`universe: ${seen.size} | overrides: ${have.size} | missing: ${missing.length}`);
for (const [netuid, url] of missing.sort((a, b) => a[0] - b[0])) {
  console.log(`  SN${String(netuid).padStart(3)}  ${url}`);
}

// Also: overrides present but never mechanics-scraped recently? Just report.
const noReq = existing.filter((o) => !o.requirementsSource);
console.log(`\noverrides with requirementsSource=null (possible silent errors): ${noReq.length}`);
if (noReq.length) console.log("  " + noReq.map((o) => "SN" + o.netuid).join(", "));

await db.$disconnect();
