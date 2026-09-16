// Evaluate subnetalpha.ai as a supplementary source.
// 1) Extract the full /subnet/<slug>/ directory from the saved homepage HTML
// 2) Load our chain-snapshot universe names
// 3) Fuzzy-match subnets we could NOT cover from GitHub (16 known gaps)
// against slugs so we know which gap pages exist on the site.
import * as fs from "fs";

const homepage = JSON.parse(fs.readFileSync("/tmp/subnetalpha.json", "utf8"));
const html: string = (homepage.data ?? homepage).html ?? "";

const slugs = [...new Set(
  [...html.matchAll(/https:\/\/subnetalpha\.ai\/subnet\/([a-z0-9-]+)\//g)].map((m) => m[1])
)].sort();
console.log(`directory slugs on subnetalpha.ai: ${slugs.length}`);

// Our universe names — from the latest chain snapshot in the DB.
async function main() {
  const { db } = await import("../src/lib/db");
  const snap = await db.chainSnapshot.findFirst({ orderBy: { createdAt: "desc" } });
  if (!snap) throw new Error("no chain snapshot");
  const subnets = JSON.parse(snap.subnetsJson) as Array<{ netuid: number; name: string | null }>;
  const byName = new Map<number, string>();
  for (const s of subnets) {
    if (s.name) byName.set(s.netuid, s.name);
  }

  const GAP_NETUIDS = [16, 30, 31, 39, 42, 47, 73, 87, 95, 99, 109, 110, 112, 116, 122, 126];
  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  console.log(`\n=== gap subnet name → slug match ===`);
  for (const netuid of GAP_NETUIDS) {
    const name = byName.get(netuid) ?? "?";
    const cand = slugify(name);
    const exact = slugs.includes(cand);
    const loose = slugs.filter(
      (s) => cand.length > 2 && (s.includes(cand.slice(0, 5)) || cand.includes(s.slice(0, 5)))
    );
    console.log(
      `SN${String(netuid).padStart(3)} ${name.padEnd(16)} → ${cand.padEnd(18)} ` +
        (exact ? "EXACT" : loose.length ? `maybe: ${loose.slice(0, 3).join(", ")}` : "no match")
    );
  }
  console.log(`\nfirst 40 slugs for reference: ${slugs.slice(0, 40).join(", ")}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
