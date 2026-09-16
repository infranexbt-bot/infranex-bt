// ---------------------------------------------------------------------------
// Infra-stack audit: does the DevOps Engine capture + install everything the
// subnets' own docs require (k8s / postgres / redis / gepetto / graval / RAM)?
// Reads SubnetRequirements profiles + SubnetOverride hostingRequirements.
// ---------------------------------------------------------------------------
import { db } from "../src/lib/db";

async function main() {
  const reqs = await db.subnetRequirements.findMany({ orderBy: { netuid: "asc" } });
  console.log(`=== SubnetRequirements cached profiles: ${reqs.length} ===\n`);

  let withInfra = 0;
  for (const r of reqs) {
    const p = JSON.parse(r.profileJson);
    const infra = p.infraStack;
    if (infra) withInfra++;
    const services = infra?.services?.map((s: { name: string }) => s.name).join(",") ?? "";
    const orch = infra?.orchestration ?? "";
    const ram = infra?.ramRule ? "ramRule" : "";
    if (infra || r.netuid === 64) {
      console.log(
        `SN${String(r.netuid).padStart(3)} ${r.subnetName?.slice(0, 18).padEnd(18)} conf=${p.confidence?.padEnd(6)} ` +
          `docker=${p.dockerImage ? "Y" : "n"} uv=${p.packageManager === "uv" ? "Y" : "n"} ` +
          `svc=[${services}] orch=${orch} ${ram}`
      );
    }
  }
  console.log(`\nProfiles with infraStack detected: ${withInfra}/${reqs.length}`);

  // SN64 deep dive — Chutes-class stack
  const sn64 = reqs.find((r) => r.netuid === 64);
  if (sn64) {
    const p = JSON.parse(sn64.profileJson);
    console.log("\n=== SN64 (Chutes) profile deep dive ===");
    console.log("repoUrl:", p.repoUrl);
    console.log("dockerImage:", p.dockerImage);
    console.log("packageManager:", p.packageManager, "confidence:", p.confidence);
    console.log("pipPackages:", JSON.stringify(p.pipPackages));
    console.log("gitDeps:", JSON.stringify(p.gitDeps));
    console.log("osPackages:", JSON.stringify(p.osPackages));
    console.log("entrypoint:", p.entrypoint);
    console.log("infraStack:", JSON.stringify(p.infraStack, null, 2));
    console.log("notes:", JSON.stringify(p.notes, null, 2));
  } else {
    console.log("\nSN64 profile NOT cached — needs refresh");
  }

  // Which cached profiles have gepetto/graval in their pip stack?
  console.log("\n=== gepetto / graval coverage in pip stacks ===");
  for (const r of reqs) {
    const p = JSON.parse(r.profileJson);
    const pip: string[] = p.pipPackages ?? [];
    const hits = pip.filter((d) => /gepetto|graval|chutes/i.test(d));
    if (hits.length) console.log(`SN${r.netuid}: ${hits.join(", ")}`);
  }

  // Universe-wide: which subnets' own docs (override hostingRequirements)
  // document service-level infra vs a plain pip/GPU miner?
  const ovs = await db.subnetOverride.findMany();
  const infraRe: Array<[string, RegExp]> = [
    ["kubernetes", /\bk(ubernetes|8s|3s)\b/i],
    ["postgres", /\bpostgres(ql)?\b/i],
    ["redis", /\bredis\b/i],
    ["gepetto", /\bgepetto\b/i],
    ["docker", /\bdocker\b/i],
    ["docker-compose", /\bdocker[ -]compose\b/i],
    ["ansible", /\bansible\b/i],
    ["tee/attestation", /\b(intel\s+tdx|hardware\s+attestation|attestation\s+service|tee[- ]?(worker|node|vm))\b/i],
    ["ram>=vram", /\bram\b/i.test("") ? /x/ : /as much ram|ram.{0,40}per gpu|ram.{0,40}vram/i],
    ["firewall/ports", /\b(firewall|port range|nodeport|port mapping)\b/i],
    ["bare-metal/static-ip", /\b(bare[ -]?metal|static ip|will not work on)\b/i],
    ["graval (deprecated)", /\bgraval\b/i],
  ];
  const tally = new Map<string, number[]>();
  let scanned = 0;
  for (const ov of ovs) {
    if (!ov.hostingRequirements) continue;
    let text = "";
    try {
      const h = JSON.parse(ov.hostingRequirements);
      text = JSON.stringify(h);
    } catch {
      text = ov.hostingRequirements;
    }
    scanned++;
    for (const [key, re] of infraRe) {
      if (re.test(text)) {
        const arr = tally.get(key) ?? [];
        arr.push(ov.netuid);
        tally.set(key, arr);
      }
    }
  }
  console.log(`\n=== Universe scan: infra signals in ${scanned} scraped requirements docs ===`);
  for (const [key, netuids] of [...tally.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const show = netuids.slice(0, 14).map((n) => `SN${n}`).join(" ");
    console.log(`${key.padEnd(22)} ${String(netuids.length).padStart(3)}  ${show}${netuids.length > 14 ? " …" : ""}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
