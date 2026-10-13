/**
 * subnetalpha-enrich.ts — enrich SubnetOverride rows from the SubnetAlpha.ai
 * directory (scraped 2026-10-14 via page_reader, validated against live chain
 * names: 93/128 name matches).
 *
 * SCOPE (deliberately conservative):
 *   1. FILL-NULL: subnets whose on-chain identity is scrubbed (name null in
 *      our table) but SubnetAlpha lists a name + description -> set them.
 *   2. ADD-MISSING: named subnets with no SubnetOverride row at all -> create.
 * NOT touched: rows where our name conflicts with SubnetAlpha's (e.g. SN29
 * hoτfloaτ vs "AI-ASSeSS") — conflicts need independent verification.
 * Bare "Subnet N" slots (SN35/39/42/57/59/70/73/84/86/92/103/113) skipped —
 * no name/description value to add.
 *
 * Idempotent: only writes when the target fields are null/empty (never
 * overwrites curated names). requirementsSource is tagged for provenance.
 * Re-running after reseed-overrides-from-chain is safe (create-if-missing).
 *
 * Run: bun scripts/subnetalpha-enrich.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const SOURCE = "subnetalpha-directory-2026-10-14";

type Entry = { netuid: number; name: string; description: string };

// From tool-results/subnetalpha-directory.json (validated extraction)
const FILL_NULL: Entry[] = [
  { netuid: 1, name: "Apex", description: "Apex improves LLM inference by incentivizing agentic workflows and generating high-quality synthetic data." },
  { netuid: 3, name: "Teutonic", description: "Coordinated learning: a king-of-the-hill pretraining system where miners compete to train the best foundation models." },
  { netuid: 7, name: "Allways", description: "Trustless cross-chain transaction layer enabling secure native swaps between chains." },
  { netuid: 9, name: "IOTA", description: "IOTA focuses on pre-training large language models using extensive datasets." },
  { netuid: 11, name: "TrajectoryRL", description: "TrajectoryRL subnet on Bittensor." },
  { netuid: 19, name: "Blockmachine", description: "Blockmachine subnet on Bittensor." },
  { netuid: 23, name: "Trishool", description: "Trishool subnet on Bittensor." },
  { netuid: 25, name: "UR", description: "UR subnet on Bittensor." },
  { netuid: 30, name: "Endure Network", description: "Endure Network subnet on Bittensor." },
];

const ADD_MISSING: Entry[] = [
  { netuid: 16, name: "Fast Thinker", description: "Ranks and rewards reasoning models for speed-efficiency trade-offs on the Bittensor network." },
  { netuid: 31, name: "Rec4ll", description: "Rec4ll is a decentralised retrieval-augmented generation subnet on Bittensor, where miners compete to serve the best RAG pipelines." },
  { netuid: 87, name: "Provenonce", description: "Provenonce delivers Proof of Assurance on SN87: verified execution of agentic workloads." },
  { netuid: 95, name: "Actual", description: "Actual turns the hardware you already own into a private, decentralised AI inference network." },
  { netuid: 99, name: "Thirty Spokes", description: "Decentralized LLM gateway on Bittensor where miners compete to build the best AI gateway." },
];

// SN32 — pending deep-dive target; description only (name already matches chain "ItsAI")
const SN32_DESCRIPTION =
  "Subnet 32 detects AI-generated content, providing tools to verify text " +
  "authenticity and support diverse applications (directory: It's AI).";

async function main() {
  let filled = 0, added = 0, skipped = 0, touched32 = 0;

  for (const e of FILL_NULL) {
    const existing = await db.subnetOverride.findUnique({ where: { netuid: e.netuid } });
    if (existing && existing.name && existing.name.trim()) {
      skipped++;
      continue; // never overwrite a curated/chain name
    }
    const data = {
      name: e.name,
      description: e.description,
      requirementsSource: SOURCE,
      updatedAt: new Date(),
    };
    await db.subnetOverride.upsert({
      where: { netuid: e.netuid },
      create: { netuid: e.netuid, ...data },
      update: data,
    });
    filled++;
    console.log(`filled SN${e.netuid} -> ${e.name}`);
  }

  for (const e of ADD_MISSING) {
    const existing = await db.subnetOverride.findUnique({ where: { netuid: e.netuid } });
    if (existing) {
      skipped++;
      continue;
    }
    await db.subnetOverride.create({
      data: {
        netuid: e.netuid,
        name: e.name,
        description: e.description,
        requirementsSource: SOURCE,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    added++;
    console.log(`added SN${e.netuid} -> ${e.name}`);
  }

  // SN32: enrich description only if empty (name untouched — chain says ItsAI)
  const sn32 = await db.subnetOverride.findUnique({ where: { netuid: 32 } });
  if (sn32) {
    if (!sn32.description || !sn32.description.trim()) {
      await db.subnetOverride.update({
        where: { netuid: 32 },
        data: { description: SN32_DESCRIPTION, requirementsSource: SOURCE, updatedAt: Date.now() },
      });
      touched32++;
      console.log("enriched SN32 description (It's AI)");
    }
  } else {
    await db.subnetOverride.create({
      data: {
        netuid: 32,
        name: "ItsAI",
        description: SN32_DESCRIPTION,
        requirementsSource: SOURCE,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    touched32++;
    console.log("created SN32 row (ItsAI)");
  }

  console.log(`\ndone: filled=${filled} added=${added} sn32=${touched32} skipped=${skipped}`);
  const total = await db.subnetOverride.count();
  const named = await db.subnetOverride.count({ where: { name: { not: null } } });
  console.log(`override rows now: ${total} (${named} named)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
