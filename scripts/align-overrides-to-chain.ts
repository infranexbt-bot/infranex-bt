/**
 * align-overrides-to-chain.ts — one-time normalization: SubnetOverride rows
 * carry name/description/githubUrl/website originally written by the GitHub
 * scrape sync (some pointing at stale pre-dTAO repos — e.g. SN1 =
 * opentensor/text-prompting while the chain now registers
 * macrocosm-os/apex). The chain SubnetIdentitiesV3 registration is the
 * OWNER'S current text — the same source subnetalpha.ai displays — so the
 * identity fields are aligned to the live snapshot.
 *
 * Touches ONLY identity fields. Requirements data (minVramGb, GPU, hosting,
 * mechanics, infra) is left untouched.
 *
 * Input: a fresh /api/network snapshot JSON (tool-results/net-live.json or
 * a saved response file).
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const db = new PrismaClient();
const INPUT = process.argv[2] ?? "tool-results/net-live.json";

interface SnapSubnet {
  netuid: number;
  name?: string | null;
  identityGithub?: string | null;
  identityDescription?: string | null;
  identityWebsite?: string | null;
}

async function main() {
  const net = JSON.parse(readFileSync(INPUT, "utf8")) as { subnets?: SnapSubnet[] };
  const subs = (net.subnets ?? []).filter((s) => s.netuid > 0);
  if (!subs.length) {
    console.error("no subnets in input — aborting");
    process.exit(1);
  }

  const rows = await db.subnetOverride.findMany({
    select: { netuid: true, name: true, description: true, githubUrl: true, website: true },
  });
  let aligned = 0;
  let alreadyOk = 0;
  let noChain = 0;
  const changes: string[] = [];

  for (const row of rows) {
    const s = subs.find((x) => x.netuid === row.netuid);
    if (!s) continue;
    const data: Record<string, string | null> = {};

    const chainName = (s.name ?? "").trim() || null;
    const chainDesc = (s.identityDescription ?? "").trim() || null;
    const chainGh = (s.identityGithub ?? "").trim() || null;
    const chainSite = (s.identityWebsite ?? "").trim() || null;

    if (chainName && chainName !== row.name) data.name = chainName;
    if (chainDesc && chainDesc !== row.description) data.description = chainDesc;
    if (chainGh && chainGh !== row.githubUrl) data.githubUrl = chainGh;
    if (chainSite && chainSite !== row.website) data.website = chainSite;

    if (!chainName && !chainDesc && !chainGh && !chainSite) {
      noChain++;
      continue;
    }

    if (Object.keys(data).length === 0) {
      alreadyOk++;
      continue;
    }

    await db.subnetOverride.update({ where: { netuid: row.netuid }, data });
    aligned++;
    changes.push(
      `SN${row.netuid}: ${Object.entries(data)
        .map(([k, v]) => `${k}="${String(v).slice(0, 48)}"`)
        .join(", ")}`
    );
  }

  console.log(
    `overrides aligned=${aligned} already-current=${alreadyOk} no-chain-identity=${noChain} total-rows=${rows.length}`
  );
  for (const c of changes.slice(0, 25)) console.log("  " + c);
  if (changes.length > 25) console.log(`  … and ${changes.length - 25} more`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
