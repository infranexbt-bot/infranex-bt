/**
 * reseed-requirements-offline.ts — DB-RESTORE-1 follow-up.
 *
 * The sandbox wipe emptied SubnetOverride's deep-research fields. The live
 * GitHub sync pass re-scraped what it could, but 37 netuids came back with
 * NULL GPU requirements (transient rate-limits or repos whose READMEs moved).
 *
 * This pass fills those gaps OFFLINE from the cached research corpus
 * (scripts/gpu-research/raw/<netuid>.json, fetched 2026-09-10) using the same
 * pure parsers the live scraper uses — so the values are identical to what a
 * successful live scrape would have produced, with honest provenance:
 * requirementsScrapedAt = the cached fetch time, requirementsSource = the
 * README URL recorded in the cache.
 *
 * Only fills NULLs — never clobbers a value the live pass recovered.
 *
 * Run: bun --smol scripts/reseed-requirements-offline.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  parseGpuWithContext,
  parseVram,
  parseHosting,
} from "../src/lib/infranex/github-scraper";

const db = new PrismaClient();

async function main() {
  const overrides = await db.subnetOverride.findMany();
  const gaps = overrides.filter((o) => !o.recommendedGpu || o.requirementsScrapedAt == null);
  console.log(`overrides: ${overrides.length}, gaps to fill: ${gaps.length}`);

  let filled = 0;
  const stillEmpty: number[] = [];

  for (const o of gaps) {
    const path = `scripts/gpu-research/raw/${o.netuid}.json`;
    const f = Bun.file(path);
    if (!(await f.exists())) {
      stillEmpty.push(o.netuid);
      continue;
    }
    let raw: { readme?: string; readmeUrl?: string; fetchedAt?: string };
    try {
      raw = JSON.parse(await f.text());
    } catch {
      stillEmpty.push(o.netuid);
      continue;
    }
    const readme = raw.readme ?? "";
    if (!readme) {
      stillEmpty.push(o.netuid);
      continue;
    }

    const gpu = parseGpuWithContext(readme);
    const vram = gpu?.vramGb ?? parseVram(readme);
    const hosting = parseHosting(readme);

    const recommendedGpu = o.recommendedGpu ?? gpu?.raw ?? null;
    const gpuCount = o.gpuCount ?? gpu?.count ?? null;
    const minVramGb = o.minVramGb ?? vram ?? null;
    const requirementsSource = o.requirementsSource ?? raw.readmeUrl ?? null;
    const requirementsScrapedAt =
      o.requirementsScrapedAt ?? (raw.fetchedAt ? new Date(raw.fetchedAt) : new Date());
    const hostingRequirements = o.hostingRequirements ?? (hosting ? JSON.stringify(hosting) : null);

    if (!recommendedGpu && !hostingRequirements) {
      stillEmpty.push(o.netuid);
      continue;
    }

    await db.subnetOverride.update({
      where: { netuid: o.netuid },
      data: {
        recommendedGpu,
        gpuCount,
        minVramGb,
        requirementsSource,
        requirementsScrapedAt,
        ...(hostingRequirements ? { hostingRequirements } : {}),
      },
    });
    filled++;
    console.log(
      `SN${o.netuid}: gpu=${recommendedGpu ?? "—"} vram=${minVramGb ?? "—"} count=${gpuCount ?? "—"} hosting=${hosting ? "yes" : "no"}`
    );
  }

  console.log(`\nfilled: ${filled}/${gaps.length}`);
  if (stillEmpty.length) {
    console.log(`still empty (no cached README with GPU info): ${stillEmpty.join(",")}`);
  }

  // --- PASS 2: pre-wipe DB state restore (DB-RESTORE-1) --------------------
  // dataset.json captured appGpuRequired/appMinVramGb/appCategory for every
  // subnet — the deep-researched DB state (incl. hand-curated corrections)
  // lost in the sandbox wipe. Fill anything still NULL from it.
  const dsFile = Bun.file("scripts/gpu-research/dataset.json");
  if (await dsFile.exists()) {
    const ds = JSON.parse(await dsFile.text()) as Record<string, unknown>;
    const rows = (ds.subnets
      ? Object.values(ds.subnets)
      : Array.isArray(ds)
        ? ds
        : Object.values(ds)) as Array<Record<string, unknown>>;
    const byId = new Map(
      rows.filter((e) => typeof e.netuid === "number").map((e) => [e.netuid as number, e])
    );
    const after = await db.subnetOverride.findMany();
    let restored = 0;
    for (const o of after) {
      const e = byId.get(o.netuid);
      if (!e) continue;
      const gpu = o.recommendedGpu ?? (typeof e.appGpuRequired === "string" ? e.appGpuRequired : null);
      const vram = o.minVramGb ?? (typeof e.appMinVramGb === "number" ? e.appMinVramGb : null);
      const cat = o.category ?? (typeof e.appCategory === "string" ? e.appCategory : null);
      if (gpu === o.recommendedGpu && vram === o.minVramGb && cat === o.category) continue;
      await db.subnetOverride.update({
        where: { netuid: o.netuid },
        data: {
          ...(gpu !== o.recommendedGpu ? { recommendedGpu: gpu } : {}),
          ...(vram !== o.minVramGb ? { minVramGb: vram } : {}),
          ...(cat !== o.category ? { category: cat } : {}),
          requirementsScrapedAt: o.requirementsScrapedAt ?? new Date(0), // pre-wipe restore marker
        },
      });
      restored++;
      if (restored <= 12) console.log(`restore-from-dataset SN${o.netuid}: gpu=${gpu} vram=${vram} cat=${cat}`);
    }
    console.log(`\npass 2 (dataset restore): ${restored} overrides updated`);
  }

  await db.$disconnect();
}

main();
