#!/usr/bin/env node
/**
 * merge-playbook.ts — validate the 6 playbook research batch outputs and
 * upsert them into the SubnetPlaybook table.
 *
 * Validation: every batch parses, covers exactly its input netuids, required
 * fields present, list fields are arrays of strings, confidence in enum.
 *
 * Run: bun --smol scripts/merge-playbook.ts
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const db = new PrismaClient();
const BATCHES = [1, 2, 3, 4, 5, 6];
const CONF = new Set(["repo-verified", "derived", "thin"]);
const REQ = ["whatItDoes", "hardwareRec", "minerJob", "top10Strategy", "followTopMiners"];
const ARR = ["keyRequirements", "minerJobProvide", "top10Levers"];

function fail(msg: string): never {
  console.error("MERGE ABORTED:", msg);
  process.exit(1);
}

async function main() {
  const inputs = new Map<number, unknown>();
  const merged = new Map<number, Record<string, unknown>>();
  let verified = 0, derived = 0, thin = 0;

  for (const b of BATCHES) {
    const inFile = `scripts/playbook/batch-${b}-input.json`;
    const outFile = `scripts/playbook/batch-${b}-output.json`;
    const inRows = JSON.parse(readFileSync(inFile, "utf8")) as Array<{ netuid: number }>;
    const outRows = JSON.parse(readFileSync(outFile, "utf8")) as Array<Record<string, unknown>>;
    if (!Array.isArray(outRows)) fail(`batch-${b}: output is not an array`);
    if (outRows.length !== inRows.length)
      fail(`batch-${b}: ${outRows.length} entries vs ${inRows.length} inputs`);
    for (let i = 0; i < inRows.length; i++) {
      const e = outRows[i];
      const netuid = inRows[i].netuid;
      if (e.netuid !== netuid) fail(`batch-${b}[${i}]: netuid ${e.netuid} != expected ${netuid}`);
      if (merged.has(netuid)) fail(`duplicate netuid ${netuid}`);
      for (const f of REQ)
        if (typeof e[f] !== "string" || (e[f] as string).length < 10)
          fail(`batch-${b} SN${netuid}: field ${f} missing/short`);
      for (const f of ARR) {
        const v = e[f];
        if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !x.trim()))
          fail(`batch-${b} SN${netuid}: field ${f} not string[]`);
      }
      const conf = String(e.confidence ?? "");
      if (!CONF.has(conf)) fail(`batch-${b} SN${netuid}: bad confidence ${conf}`);
      if (conf === "repo-verified") verified++;
      else if (conf === "derived") derived++;
      else thin++;
      const sources = Array.isArray(e.sources) ? e.sources : [];
      merged.set(netuid, e);
      inputs.set(netuid, true);
    }
  }

  const overrides = await db.subnetOverride.findMany({ select: { netuid: true } });
  const known = new Set(overrides.map((o) => o.netuid));
  for (const n of merged.keys())
    if (!known.has(n)) fail(`SN${n} in batches but not in SubnetOverride`);

  let written = 0;
  for (const [netuid, e] of merged) {
    const data = {
      whatItDoes: String(e.whatItDoes),
      hardwareRec: String(e.hardwareRec),
      keyRequirements: JSON.stringify(e.keyRequirements),
      minerJob: String(e.minerJob),
      minerJobProvide: JSON.stringify(e.minerJobProvide),
      top10Strategy: String(e.top10Strategy),
      top10Levers: JSON.stringify(e.top10Levers),
      followTopMiners: String(e.followTopMiners),
      confidence: String(e.confidence),
      sources: JSON.stringify(e.sources ?? []),
      researchedAt: new Date(),
    };
    await db.subnetPlaybook.upsert({ where: { netuid }, create: { netuid, ...data }, update: data });
    written++;
  }
  console.log(
    `merged ${written} playbook rows | repo-verified=${verified} derived=${derived} thin=${thin}`
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
