/**
 * COMPELLE-FIX (SN82) — curated SubnetOverride row.
 *
 * User report: opportunity card showed SN82 as
 *   Work type "Unclassified workload" + "GPU (revenue est.) H200 141GB".
 * Root cause chain:
 *   1. SN82 has NO SubnetOverride row (chain reseed only creates rows for
 *      subnets with on-chain identity) AND its on-chain identity is SCRUBBED
 *      (name/description null — team removed it after the repo went private).
 *   2. classifySubnetHardware had zero text to match → revenue fallback
 *      (paper per-miner revenue ≈$1.6k/day ≥ $1200/mo → H200 tier).
 * Research verdict (2026-10-13, block ~9.27M): SN82 "Compelle" is an
 * adversarial-persuasion debate subnet — miners commit written debate
 * strategies as on-chain TRANSACTIONS; the validator runs Pro/Con LLM
 * debates via Chutes API. Miner hardware: wallet only (zero GPU).
 *
 * Idempotent: upserts by netuid; reseed-overrides-from-chain.ts uses
 * create-if-missing so this curated row survives future reseeds.
 * Run: bun scripts/sn82-compelle-override.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const DESCRIPTION =
  "Adversarial-persuasion debate subnet: miners commit written debate strategies on-chain; " +
  "the validator pairs miners into Pro/Con LLM debates judged via an LLM API (Chutes) and " +
  "Elo-weights them. Miner participation is wallet transactions only — zero GPU and no " +
  "meaningful compute. Research-verified 2026-10-13 (block ~9.27M): registered Sep 26 2026, " +
  "emissions enabled Oct 12-13, anonymous owner, validator repo deleted/privated after " +
  "scrape — treat as speculative (see SN82 deep-dive in worklog).";

const row = await db.subnetOverride.upsert({
  where: { netuid: 82 },
  create: {
    netuid: 82,
    name: "Compelle",
    description: DESCRIPTION,
    category: "Debate & persuasion",
    minVramGb: 0,
    recommendedGpu: "None (CPU-only)",
    gpuCount: null,
    hostingRequirements: null,
    mechanicsJson: null,
    infraJson: null,
    // No requirementsSource / githubUrl: the repo was deleted/privated, so we
    // must NOT claim "documented by the subnet's repo" in the UI. The honest
    // label is "Typical hardware — derived from the subnet's description".
    requirementsSource: null,
    requirementsScrapedAt: null,
    githubUrl: null,
    website: null,
    tags: null,
  },
  update: {
    name: "Compelle",
    description: DESCRIPTION,
    category: "Debate & persuasion",
    minVramGb: 0,
    recommendedGpu: "None (CPU-only)",
  },
});

console.log(
  "SN82 override row:",
  JSON.stringify(
    { netuid: row.netuid, name: row.name, category: row.category, minVramGb: row.minVramGb, recommendedGpu: row.recommendedGpu },
    null,
    1
  )
);
await db.$disconnect();
