/**
 * AUDIT: scan ALL subnets' GitHub READMEs for hosting constraints
 * (bare metal / VM-only, no container clouds, static IP, TEE, datacenter).
 *
 * Two passes per subnet:
 *  1. The app's REAL pipeline (scrapeGithubMetadata) — what the UI sees.
 *  2. A deeper verbatim sentence scan (evidence quotes + line numbers) so
 *     every flag can be human-verified against the actual README text.
 *
 * Output: /tmp/subnet-hosting-audit.json  + compact stdout report.
 * Run: bun scripts/research-subnet-hosting-audit.ts
 */

import { CURATED_MINER_REPOS, scrapeGithubMetadata } from "../src/lib/infranex/github-scraper";

interface Hit {
  cat: string;
  line: number;
  quote: string;
  src: string; // "identity" | "miner"
}

interface SubnetRow {
  netuid: number;
  name: string;
  repo: string;
  minerRepo: string | null;
  err: string | null;
  pipelineHosting: { bareMetalOnly: boolean; teeRequired: boolean; staticIpRequired: boolean; notes: string[] } | null;
  hits: Hit[];
  readmeChars: number;
}

const snapshot = JSON.parse(await Bun.file("/tmp/network-snapshot.json").text());
const subnets: Array<{ netuid: number; name: string; identityGithub: string | null }> = snapshot.subnets;

const UA = { "User-Agent": "infranex-bt-audit/1.0" };

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: UA, cache: "no-store" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchReadme(owner: string, repo: string): Promise<{ content: string; src: string } | null> {
  // HEAD resolves the default branch on raw.githubusercontent.com
  for (const branch of ["HEAD", "main", "master"]) {
    for (const path of ["README.md", "readme.md", "README.rst", "README"]) {
      const content = await fetchText(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`);
      if (content) return { content, src: `${owner}/${repo}` };
    }
  }
  return null;
}

/** Resolve an org-only or /orgs/X/repositories URL to the org's most likely subnet repo. */
async function resolveOrgRepo(org: string): Promise<string | null> {
  const html = await fetchText(`https://github.com/orgs/${org}/repositories?q=&type=all`);
  if (!html) return null;
  const re = new RegExp(`href="/(${org})/([A-Za-z0-9_.-]+)"`, "gi");
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const slug = `${m[1]}/${m[2]}`;
    if (!found.includes(slug)) found.push(slug);
  }
  if (!found.length) return null;
  // prefer subnet/miner-ish names
  const pref = found.find((s) => /miner|subnet|sn[-_]?\d+/i.test(s)) ?? found[0];
  return pref;
}

function parseRepo(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (!u.hostname.includes("github.com")) return null;
    let parts = u.pathname.split("/").filter(Boolean);
    // github.com/orgs/X/repositories -> org repo listing
    if (parts[0] === "orgs") parts = [parts[1], "repositories"];
    // strip /tree/<branch>, /blob/<branch>/... suffixes
    if (parts.length >= 3 && ["tree", "blob"].includes(parts[2])) parts = parts.slice(0, 2);
    if (parts.length < 2 || parts[1] === "repositories") return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

function slugOf(url: string): string | null {
  const p = parseRepo(url);
  return p ? `${p.owner}/${p.repo}` : null;
}

function discoverMinerRepo(readme: string, owner: string): string | null {
  const re = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(readme)) !== null) {
    const o = m[1];
    const r = m[2].replace(/\.git$/i, "").replace(/[).,]+$/, "");
    if (o.toLowerCase() !== owner.toLowerCase()) continue;
    if (/miner|validator/i.test(r)) return `${o}/${r}`;
  }
  return null;
}

// --- sentence-level scan -----------------------------------------------------

const CATS: Array<[string, RegExp]> = [
  ["BARE_METAL", /bare[ -]?metal|dedicated (?:server|machine|hardware|host)|physical (?:server|machine|hardware)/i],
  ["CONTAINER_CLOUD", /\b(runpod|vast\.?ai|\bvast\b|lambda (?:labs|cloud|gpu)|fluidstack|jarvislabs|tensorpool|hyperspace|koyeb|paperspace)\b/i],
  ["STATIC_IP", /static ip|unique ip|ip (?:address )?(?:must|needs? to|should)|1:1 port|port mapping|port forwarding|no (?:nat|cg-?nat)|nat traversal/i],
  ["TEE", /\bTEE\b|\bTDX\b|\bSGX\b|nitro enclave|confidential (?:vm|computing|compute)|remote attestation/i],
  ["RESIDENTIAL", /residential/i],
  ["DATACENTER", /data[ -]?center|colocation|\bcolo\b/i],
  ["NO_DOCKER", /(?:no|not|without|disallow|forbid)\b[^.]{0,60}\bdocker\b|\bdocker\b[^.]{0,40}(?:not (?:supported|allowed)|prohibited)/i],
  ["K8S", /\bkubernetes\b|\bk8s\b|\bhelm\b/i],
  ["OWN_HARDWARE", /(?:your own|own) (?:hardware|server|machine|gpu|infrastructure)|on-?prem/i],
];

function scanText(text: string, src: string, out: Hit[]) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const clean = lines[i].replace(/[#*`>|]/g, "").trim();
    if (clean.length < 15) continue;
    for (const [cat, re] of CATS) {
      if (re.test(clean)) {
        out.push({ cat, line: i + 1, quote: clean.slice(0, 240), src });
        break; // one hit per line, first matching category
      }
    }
  }
}

// --- main loop with concurrency pool -----------------------------------------

async function auditSubnet(s: { netuid: number; name: string; identityGithub: string | null }): Promise<SubnetRow> {
  const row: SubnetRow = {
    netuid: s.netuid,
    name: s.name || `SN${s.netuid}`,
    repo: s.identityGithub || "",
    minerRepo: null,
    err: null,
    pipelineHosting: null,
    hits: [],
    readmeChars: 0,
  };
  if (!s.identityGithub) {
    row.err = "no identityGithub";
    return row;
  }
  if (s.identityGithub === "0x" || !/^https?:\/\//.test(s.identityGithub)) {
    row.err = `placeholder identity (${s.identityGithub.slice(0, 10)}) — no repo`;
    return row;
  }
  let info = parseRepo(s.identityGithub);
  if (!info && /github\.com\/[A-Za-z0-9_.-]+\/?$/.test(s.identityGithub)) {
    // org-only URL -> resolve the org's most likely repo
    const org = s.identityGithub.replace(/https:\/\/github\.com\//, "").replace(/\/$/, "");
    const slug = await resolveOrgRepo(org);
    if (slug) {
      const [o, r] = slug.split("/");
      info = { owner: o, repo: r };
      row.repo = `https://github.com/${slug} (resolved from org)`;
    }
  }
  if (!info) {
    row.err = "unparseable URL";
    return row;
  }

  try {
    let ident = await fetchReadme(info.owner, info.repo);
    let minerRd: { content: string; src: string } | null = null;

    const curated = CURATED_MINER_REPOS[s.netuid];
    let minerSlug: string | null = curated ? slugOf(curated) : null;
    if (!minerSlug && ident) minerSlug = discoverMinerRepo(ident.content, info.owner);
    if (minerSlug) {
      const [mo, mr] = minerSlug.split("/");
      minerRd = await fetchReadme(mo, mr);
      row.minerRepo = minerSlug;
    }
    if (!ident && minerRd) {
      ident = minerRd;
      row.minerRepo = null;
    }

    row.readmeChars = (ident?.content.length ?? 0) + (minerRd?.content.length ?? 0);
    if (ident) scanText(ident.content, "identity", row.hits);
    if (minerRd) scanText(minerRd.content, "miner", row.hits);
    if (!ident && !minerRd) row.err = "no README found";

    // Pass 1: the app's real pipeline
    const meta = await scrapeGithubMetadata(s.identityGithub, { netuid: s.netuid });
    row.pipelineHosting = meta.hosting;
  } catch (e) {
    row.err = e instanceof Error ? e.message : String(e);
  }
  return row;
}

const CONCURRENCY = 6;
const results: SubnetRow[] = [];
const queue = [...subnets];

async function worker() {
  while (queue.length) {
    const s = queue.shift()!;
    const row = await auditSubnet(s);
    results.push(row);
    const flag = row.pipelineHosting
      ? `pipe=[${row.pipelineHosting.bareMetalOnly ? "BARE" : ""}${row.pipelineHosting.teeRequired ? " TEE" : ""}${row.pipelineHosting.staticIpRequired ? " IP" : ""}]`
      : "";
    const hitCats = [...new Set(row.hits.map((h) => h.cat))].join(",");
    console.error(`#${String(s.netuid).padStart(3)} ${row.name.slice(0, 24).padEnd(24)} ${row.err ? "ERR:" + row.err : "ok"} ${flag} scan=[${hitCats}]`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

results.sort((a, b) => a.netuid - b.netuid);
await Bun.write("/tmp/subnet-hosting-audit.json", JSON.stringify(results, null, 2));

// --- compact report: only subnets with evidence ------------------------------

console.log("\n========== SUBNETS WITH HOSTING EVIDENCE ==========");
for (const r of results) {
  if (r.err && !r.hits.length) continue;
  const interesting = r.hits.filter((h) =>
    ["BARE_METAL", "CONTAINER_CLOUD", "STATIC_IP", "TEE", "RESIDENTIAL", "NO_DOCKER", "OWN_HARDWARE"].includes(h.cat)
  );
  if (!interesting.length) continue;
  console.log(`\n#${r.netuid} ${r.name}  (${r.repo}${r.minerRepo ? " + " + r.minerRepo : ""})`);
  console.log(`  pipeline: ${r.pipelineHosting ? JSON.stringify({ b: r.pipelineHosting.bareMetalOnly, t: r.pipelineHosting.teeRequired, ip: r.pipelineHosting.staticIpRequired }) : "null"}`);
  for (const h of interesting.slice(0, 4)) {
    console.log(`  [${h.cat}] (${h.src} L${h.line}) ${h.quote}`);
  }
  if (interesting.length > 4) console.log(`  ... +${interesting.length - 4} more hits`);
}

console.log("\n========== SUMMARY ==========");
const noReadme = results.filter((r) => r.err);
const withBare = results.filter((r) => r.hits.some((h) => h.cat === "BARE_METAL"));
const withCC = results.filter((r) => r.hits.some((h) => h.cat === "CONTAINER_CLOUD"));
const withTee = results.filter((r) => r.hits.some((h) => h.cat === "TEE"));
const withIp = results.filter((r) => r.hits.some((h) => h.cat === "STATIC_IP"));
console.log(`total subnets: ${results.length}, no-README/err: ${noReadme.length}`);
console.log(`BARE_METAL mentions: ${withBare.map((r) => "#" + r.netuid).join(" ")}`);
console.log(`CONTAINER_CLOUD mentions: ${withCC.map((r) => "#" + r.netuid).join(" ")}`);
console.log(`TEE mentions: ${withTee.map((r) => "#" + r.netuid).join(" ")}`);
console.log(`STATIC_IP mentions: ${withIp.map((r) => "#" + r.netuid).join(" ")}`);
console.log(`errors: ${noReadme.map((r) => `#${r.netuid}(${r.err?.slice(0, 40)})`).join(" ")}`);
