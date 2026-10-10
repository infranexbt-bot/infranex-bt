/**
 * fix-audit-findings.ts — PLAYBOOK-AUDIT-1 remediation.
 *
 * Fixes three structured-vs-researched contradictions found by the audit,
 * plus restores the 105 missing subnet names from the fresh chain snapshot:
 *
 *   SN4   bareMetalOnly false→true   Playbook (repo-verified): "Bare-metal
 *                                     8-GPU node … signed TargonOS (wipes
 *                                     disks, auto-attests every boot)".
 *                                     The identity README lacks the wording
 *                                     so the live scrape missed it.
 *   SN28  recommendedGpu stale       "RTX 4060 Ti 16GB" survives from an
 *         CPU-only                    older era of SN28; the current repo
 *                                     (taostat/gm-miner) has zero GPU
 *                                     mentions and the playbook says "No
 *                                     GPU, no bare metal — pinned TEE
 *                                     container on Phala Cloud".
 *   SN108 bareMetalOnly true→false    Playbook explicitly debunks the README
 *                                     mention: "The bare-metal note concerns
 *                                     state persistence in ./data, not a
 *                                     rental ban." The scraper's
 *                                     validator-line guard failed because
 *                                     the same line also says "miner".
 *
 * Run: bun --smol scripts/fix-audit-findings.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // --- 1) SN4: bare-metal required ----------------------------------------
  const sn4 = await db.subnetOverride.findUnique({ where: { netuid: 4 } });
  if (sn4) {
    let hosting: Record<string, unknown> = {};
    try {
      hosting = JSON.parse(sn4.hostingRequirements ?? "{}");
    } catch {}
    hosting.bareMetalOnly = true;
    if (!Array.isArray(hosting.notes) || hosting.notes.length === 0) {
      hosting.notes = [
        "Playbook (repo-verified): bare-metal 8-GPU node with signed TargonOS — wipes disks, auto-attests every boot.",
      ];
    }
    await db.subnetOverride.update({
      where: { netuid: 4 },
      data: { hostingRequirements: JSON.stringify(hosting) },
    });
    console.log("SN4: bareMetalOnly → true");
  }

  // --- 2) SN28: CPU-only TEE container -------------------------------------
  await db.subnetOverride.update({
    where: { netuid: 28 },
    data: {
      recommendedGpu: "None (CPU-only) — pinned TEE container on Phala Cloud",
      minVramGb: 0,
    },
  });
  console.log("SN28: recommendedGpu → CPU-only (stale 4060 Ti cleared)");

  // --- 3) SN108: bare-metal flag debunked by the repo itself ---------------
  const sn108 = await db.subnetOverride.findUnique({ where: { netuid: 108 } });
  if (sn108) {
    let hosting: Record<string, unknown> = {};
    try {
      hosting = JSON.parse(sn108.hostingRequirements ?? "{}");
    } catch {}
    hosting.bareMetalOnly = false;
    hosting.notes = [
      "Playbook (repo-verified): the README's bare-metal line is about state persistence in ./data, not a hosting ban.",
    ];
    await db.subnetOverride.update({
      where: { netuid: 108 },
      data: { hostingRequirements: JSON.stringify(hosting) },
    });
    console.log("SN108: bareMetalOnly → false (validator-state note, not a ban)");
  }

  // --- 4) Restore names from the fresh chain snapshot ----------------------
  const snap = await db.chainSnapshot.findFirst({ orderBy: { id: "desc" } });
  let renamed = 0;
  if (snap?.subnetsJson) {
    const live = JSON.parse(snap.subnetsJson) as Array<{ netuid: number; name?: string | null }>;
    for (const s of live) {
      if (!s.name) continue;
      const r = await db.subnetOverride.updateMany({
        where: { netuid: s.netuid, OR: [{ name: null }, { name: "" }] },
        data: { name: s.name },
      });
      renamed += r.count;
    }
  }
  const left = await db.subnetOverride.count({ where: { OR: [{ name: null }, { name: "" }] } });
  console.log(`names restored from chain snapshot: ${renamed} (still unnamed: ${left})`);

  await db.$disconnect();
}

main();
