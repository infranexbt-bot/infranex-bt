/**
 * correct-sn51-tee.ts — Task: sn51-tee-correction (2026-10-06, v2 after
 * sandbox reset 16:37 wiped the DB + uncommitted source).
 *
 * v2 context: the scraper OR-option guard is now FIXED in source, and the
 * fresh full rescrape already produces the correct flags for SN51
 * (hostingRequirements = null — no TEE/bare-metal/static-IP constraint).
 * This script now only ENRICHES the row: replaces the bare scraped notes
 * with the manual-correction provenance notes (per Lium's official provider
 * docs + article) and swaps the mechanics hosting operation for the
 * sysbox-runc one, so the UI explains WHY there is no TEE requirement.
 *
 * Run: bun --smol scripts/correct-sn51-tee.ts          (dry-run)
 *      bun --smol scripts/correct-sn51-tee.ts --apply
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const CORRECTED_NOTES = [
  "CORRECTED 2026-10-06 (manual, per Lium official provider docs + article): the auto-scraper had misread the README's or-enumerated unrented-pool option as a TEE requirement. Docker + the sysbox-runc container runtime IS the full hosting requirement; sysbox is a container sandbox, not TEE/TDX hardware.",
  "Hard requirement: Docker + sysbox-runc runtime - validators reject a node without the sysbox-runc runtime; install Sysbox + NVIDIA Container Toolkit (Ubuntu 22.04 needs the HWE kernel, 5.19+).",
  "Unrented pool (idle pay) OPTION, not a base requirement: an 8x H200/B200/B300 node must offer GPU splitting, GPU profiling OR an attested confidential VM - three alternatives; a TDX-attested VM is only one of them.",
  "dstacktee/ (Intel TDX confidential VM with attestation) is an optional node-agent variant - not required to mine.",
  "Other unrented-pool conditions: node passes validation, price at/below market soft limit, disk >= 1.5x VRAM, container can set a GPU power limit, GPU count has a priced tier; open RENTING_PORT_RANGE (3+ reachable renting ports).",
];

const SYSBOX_OP = {
  title: "sysbox-runc container runtime required (corrected 2026-10-06)",
  detail:
    "Validators reject a node without the sysbox-runc runtime (a container sandbox, NOT TEE/TDX hardware). Install Docker + NVIDIA Container Toolkit + Sysbox. An earlier auto-detected 'TEE / attestation hosting required' entry was a misread of the unrented-pool or-enumeration; removed per Lium's official provider docs.",
  quote:
    "Install Sysbox and the NVIDIA Container Toolkit on the GPU host. Validators reject a node without the `sysbox-runc` runtime.",
};

async function main() {
  const row = await db.subnetOverride.findUnique({ where: { netuid: 51 } });
  if (!row) throw new Error("SN51 row missing (run rebuild-catalog + rescrape first)");

  const hosting = JSON.stringify({
    bareMetalOnly: false,
    teeRequired: false,
    staticIpRequired: false,
    notes: CORRECTED_NOTES,
  });

  const mechanics = row.mechanicsJson ? JSON.parse(row.mechanicsJson) : null;
  let mechanicsOut = row.mechanicsJson;
  if (mechanics) {
    const ops = (mechanics.operations ?? []).filter(
      (o: { title?: string }) => !/TEE \/ attestation hosting required/.test(o.title ?? "")
    );
    if (!ops.some((o: { title?: string }) => /sysbox-runc container runtime required/.test(o.title ?? ""))) {
      ops.unshift(SYSBOX_OP);
    }
    const sources = mechanics.sources ?? [];
    if (!sources.some((s: { url?: string }) => s.url === "https://docs.lium.io/providers/nodes/sysbox")) {
      sources.push({
        label: "Lium provider docs — Sysbox (manual correction 2026-10-06)",
        url: "https://docs.lium.io/providers/nodes/sysbox",
      });
    }
    mechanicsOut = JSON.stringify({ ...mechanics, operations: ops, sources });
  }

  console.log("DRY-RUN preview:");
  console.log("  hosting.flags: teeRequired=false bareMetalOnly=false staticIpRequired=false");
  console.log("  hosting.notes[0]:", CORRECTED_NOTES[0].slice(0, 100) + "...");
  console.log("  mechanics.ops[0]:", SYSBOX_OP.title);
  console.log("  current stored hosting:", row.hostingRequirements ? "present" : "null");

  if (!APPLY) {
    console.log("Dry-run only — re-run with --apply to write.");
    return;
  }

  await db.subnetOverride.update({
    where: { netuid: 51 },
    data: { hostingRequirements: hosting, mechanicsJson: mechanicsOut },
  });
  const after = await db.subnetOverride.findUnique({ where: { netuid: 51 } });
  const h = JSON.parse(after!.hostingRequirements!);
  console.log("\nAPPLIED. SN51 teeRequired =", h.teeRequired);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
