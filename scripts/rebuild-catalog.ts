/**
 * REBUILD-CATALOG — restore SubnetOverride rows wiped by the DB rebuild.
 *
 * The DB was cleared during a rebuild; only the 8 curated seed rows
 * survived (they are re-created on boot). The app's subnet catalog
 * (names + GitHub repos for ~68 subnets) lived in SubnetOverride and
 * is authoritative for: repo scraping, requirements profiles, miner-fit,
 * opportunity scoring inputs.
 *
 * This script reads the ON-CHAIN identity registry (SubnetIdentitiesV3)
 * — the authoritative source per DATA-AUDIT-1 — and upserts
 * { netuid, name, githubUrl } for every subnet that registers a repo.
 * It NEVER touches scraped fields (description, minVramGb, ...) —
 * sync-all?force=true refills those next.
 *
 * Run: bun --smol scripts/rebuild-catalog.ts
 */
import { getChainApi } from "../src/lib/infranex/chain";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

/** Vec<u8> decode — same logic as chain.ts idText(). */
function idText(v: unknown): string {
  if (v == null) return "";
  const codec = v as { toUtf8?: () => string };
  if (typeof codec.toUtf8 === "function") {
    try {
      const s = codec.toUtf8().trim();
      if (s && !s.startsWith("0x")) return s;
    } catch {
      /* fall through to hex */
    }
  }
  const s = typeof v === "string" ? v : String(v);
  if (s.startsWith("0x") && s.length > 2) {
    try {
      const hex = s.slice(2);
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
      return new TextDecoder().decode(bytes).trim();
    } catch {
      return "";
    }
  }
  return s.trim();
}

function normalizeGithub(raw: string): string | null {
  let t = raw.trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) {
    t = t.startsWith("github.com") ? `https://${t}` : `https://github.com/${t}`;
  }
  try {
    const u = new URL(t);
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return `https://github.com/${parts[0]}/${parts[1].replace(/\.git$/, "")}`;
  } catch {
    return null;
  }
}

async function main() {
  const existing = await p.subnetOverride.findMany({
    select: { netuid: true, name: true, githubUrl: true },
  });
  const byNetuid = new Map(existing.map((o) => [o.netuid, o]));
  console.log(`existing overrides: ${existing.length}`);

  console.log("connecting to finney...");
  const api = await getChainApi();
  const mods = api.query.subtensorModule as unknown as Record<
    string,
    { multi?: (keys: unknown[]) => Promise<unknown[]>; (n: number): Promise<unknown> }
  >;

  const MAX = 160;
  const allNetuids = Array.from({ length: MAX }, (_, i) => i);
  const identityMap = mods.subnetIdentitiesV3 as unknown as {
    multi?: (keys: unknown[]) => Promise<unknown[]>;
  };

  interface Row {
    netuid: number;
    name: string;
    githubUrl: string;
  }
  const rows: Row[] = [];
  const batchOf = 50;
  for (let i = 0; i < allNetuids.length; i += batchOf) {
    const batch = allNetuids.slice(i, i + batchOf);
    let arr: unknown[] = [];
    try {
      arr = (await identityMap.multi?.(batch)) ?? [];
    } catch (e) {
      console.error(`identity batch ${batch[0]}..${batch[batch.length - 1]} failed: ${e}`);
      continue;
    }
    for (let j = 0; j < batch.length; j++) {
      const opt = arr[j] as {
        isEmpty: boolean;
        unwrap?: () => { subnetName?: unknown; githubRepo?: unknown };
      } | null;
      if (!opt || opt.isEmpty || !opt.unwrap) continue;
      try {
        const v = opt.unwrap();
        const name = idText(v.subnetName);
        const gh = normalizeGithub(idText(v.githubRepo));
        if (!gh) continue;
        rows.push({ netuid: batch[j], name, githubUrl: gh });
      } catch {
        /* unreadable identity — skip */
      }
    }
  }
  console.log(`chain identities with github repo: ${rows.length}`);

  let created = 0;
  let updated = 0;
  for (const r of rows) {
    const prev = byNetuid.get(r.netuid);
    if (!prev) {
      await p.subnetOverride.create({
        data: { netuid: r.netuid, name: r.name || `Subnet ${r.netuid}`, githubUrl: r.githubUrl },
      });
      created++;
    } else {
      const patch: { name?: string; githubUrl?: string } = {};
      if (!prev.name && r.name) patch.name = r.name;
      if (!prev.githubUrl && r.githubUrl) patch.githubUrl = r.githubUrl;
      if (Object.keys(patch).length) {
        await p.subnetOverride.update({ where: { netuid: r.netuid }, data: patch });
        updated++;
      }
    }
  }
  console.log(`created=${created} updated=${updated} totalNow=${await p.subnetOverride.count()}`);
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
