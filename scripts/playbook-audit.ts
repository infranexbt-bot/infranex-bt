// PLAYBOOK-AUDIT-1 — cross-validate AI-written playbook text vs structured data.
// Flags:
//   VRAM-CONFLICT   text claims a VRAM floor lower than the scraped minVramGb
//   BAREMETAL-FLIP  text encourages cloud/rented while flag says bareMetalOnly (or vice versa)
//   TEE-FLIP        text mentions TEE while teeRequired false, or text says none while flag true
//   CONFIDENCE-BAD  confidence outside [0,1] or missing
//   GITHUB-MISSING  sources array empty (unverifiable claim)
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

function textsOf(arr: string | null): string {
  try {
    const v = arr ? JSON.parse(arr) : [];
    return Array.isArray(v) ? v.join(" ") : "";
  } catch {
    return "";
  }
}

const main = async () => {
  const [plays, overrides] = await Promise.all([
    (db as any).subnetPlaybook.findMany(),
    (db as any).subnetOverride.findMany(),
  ]);
  const ovBy = new Map(overrides.map((o: any) => [o.netuid, o]));
  let flags = 0;

  console.log(`playbook rows: ${plays.length}, override rows: ${overrides.length}`);

  const covered = new Set(plays.map((p: any) => p.netuid));
  const missing = overrides.filter((o: any) => !covered.has(o.netuid));
  if (missing.length) console.log(`\nNO PLAYBOOK ROW for netuids: ${missing.map((m: any) => m.netuid).join(", ")}`);

  for (const p of plays) {
    const o = ovBy.get(p.netuid);
    const hay = [p.hardwareRec ?? "", p.minerJob ?? "", p.whatItDoes ?? "", p.top10Strategy ?? "", textsOf(p.keyRequirements ?? null), textsOf(p.minerJobProvide ?? null), textsOf(p.top10Levers ?? null)].join(" ");
    const low = hay.toLowerCase();
    const problems: string[] = [];

    // hosting flags from override
    let hosting: any = {};
    try { hosting = o?.hostingRequirements ? JSON.parse(o.hostingRequirements) : {}; } catch {}

    // 1) VRAM conflict: only explicit VRAM-attached numbers below the scraped floor
    const vramMentions = [...hay.matchAll(/(\d{1,3})\s*gb\s*(?:vram|gpu memory|of vram)/gi)].map((m) => parseInt(m[1], 10));
    const minVram = o?.minVramGb ?? null;
    if (minVram && minVram > 0) {
      const lowerClaims = vramMentions.filter((v) => v < minVram);
      if (lowerClaims.length) {
        problems.push(`VRAM-CONFLICT text claims ${lowerClaims.join("/")} GB VRAM but scraped minVramGb=${minVram}`);
      }
    }

    // 2) baremetal flip — negation-aware: "no bare metal", "not a rental ban"
    //    are DEBUNKING sentences, not requirements.
    const bmFlag = hosting.bareMetalOnly === true || hosting.bareMetal === true;
    const saysRentable = /(vast|runpod|lambda|render|hyperstack|any cloud|rented gpu|rent a gpu|cloud gpu works?|spot instances?)/i.test(low);
    const negated = /no bare[- ]?metal|not a rental ban|no bare-metal requirement|doesn'?t (?:require|need) bare/i.test(low);
    const saysBareMetal = !negated && /bare[- ]?metal/i.test(low);
    if (bmFlag && saysRentable && !saysBareMetal && !negated) problems.push("BAREMETAL-FLIP flag=bareMetalOnly but text advertises cloud/rental without noting bare-metal");
    if (!bmFlag && saysBareMetal && hosting && hosting.bareMetalOnly === false && /required|must|only/i.test(low)) problems.push("BAREMETAL-FLIP text requires bare-metal but flag is false");

    // 3) TEE flip
    const teeFlag = hosting.teeRequired === true || hosting.tee === true;
    const saysTee = /\btee\b|trusted execution|attestation|tdx|sev[- ]?snp|kubetee|gramine/i.test(low);
    if (teeFlag && !saysTee) problems.push("TEE-FLIP flag=teeRequired but playbook text never mentions TEE/attestation");
    if (!teeFlag && saysTee && hosting && hosting.teeRequired === false && /required|must/i.test(low)) problems.push("TEE-FLIP text requires TEE but flag is false");

    // 4) confidence — enum per merge-playbook.ts (NOT numeric)
    const CONF_ENUM = new Set(["repo-verified", "derived", "thin"]);
    const c = p.confidence;
    if (typeof c !== "string" || !CONF_ENUM.has(c)) problems.push(`CONFIDENCE-BAD confidence=${c}`);

    // 5) sources
    let srcs: any[] = [];
    try { srcs = p.sources ? JSON.parse(p.sources) : []; } catch {}
    if (!Array.isArray(srcs) || srcs.length === 0) problems.push("GITHUB-MISSING no sources recorded");

    if (problems.length) {
      flags++;
      console.log(`\nSN${p.netuid} (${o?.name ?? "?"}):`);
      for (const q of problems) console.log(`  - ${q}`);
    }
  }
  console.log(`\n=== flagged ${flags} of ${plays.length} playbook rows ===`);
  await db.$disconnect();
};
main();
