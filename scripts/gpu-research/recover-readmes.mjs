/**
 * INFRANEX GPU research — Step 2b: recover failed README fetches.
 * - org-page URLs (github.com/orgs/X/repositories, bare org URLs) -> GitHub API list org repos, pick best
 * - dead/renamed repos -> GitHub search API (repo name + bittensor/subnet keywords)
 * Updates raw/{netuid}.json in place.
 */
import fs from "fs";

const DIR = "/home/z/my-project/scripts/gpu-research";
const RAW = `${DIR}/raw`;
const UA = "infranex-research/1.0";
const README_PATHS = ["README.md", "readme.md", "Readme.md", "README.rst", "README.txt", "README"];

async function ghApi(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}
async function fetchText(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    return res.ok ? await res.text() : null;
  } catch { return null; }
}
async function fetchReadme(owner, repo) {
  for (const b of ["main", "master"]) {
    for (const p of README_PATHS) {
      const c = await fetchText(`https://raw.githubusercontent.com/${owner}/${repo}/${b}/${p}`);
      if (c && c.trim()) return { content: c, url: `https://github.com/${owner}/${repo}/blob/${b}/${p}` };
    }
  }
  return null;
}
function parseRepo(url) {
  try {
    const u = new URL(url); const p = u.pathname.split("/").filter(Boolean);
    if (p.length < 2) return null;
    return { owner: p[0], repo: p[1].replace(/\.git$/, "") };
  } catch { return null; }
}

// netuid -> candidate queries / org
const RECOVERY = {
  103: { org: "Capcomp-AI", hint: "capcomp" },
  105: { org: "Beam-Network", hint: "beam" },
  118: { org: "ditto-assistant", hint: "ditto" },
  122: { org: "CookingTao", hint: "cooking" },
  120: { search: "affine bittensor" },
  95:  { search: "actual subnet 95" },
  97:  { search: "albedo bittensor subnet" },
  16:  { search: "trav bittensor subnet" },
  30:  { search: "endure network bittensor" },
  31:  { search: "rec4ll bittensor" },
  87:  { search: "provenonce bittensor" },
  99:  { search: "thirty spokes bittensor" },
  109: { search: "finsight bittensor subnet" },
  110: { search: "green compute bittensor subnet" },
  116: { search: "memo bittensor subnet" },
  42:  { search: "bittensor subnet 42" },
  57:  { search: "bittensor subnet 57 github" },
  59:  { search: "bittensor subnet 59 github" },
  70:  { search: "bittensor subnet 70 github" },
  76:  { search: "bittensor subnet 76 github" },
  84:  { search: "bittensor subnet 84 github" },
  86:  { search: "bittensor subnet 86 github" },
};

async function bestOrgRepo(org, hint) {
  const repos = await ghApi(`https://api.github.com/orgs/${org}/repos?per_page=100&sort=updated`);
  if (!Array.isArray(repos) || !repos.length) return null;
  const scored = repos.map((r) => {
    let sc = 0;
    const n = r.name.toLowerCase();
    if (n.includes(hint)) sc += 10;
    if (n.includes("subnet")) sc += 5;
    if (n.includes("bittensor")) sc += 3;
    if (r.description && /subnet|mining|miner/i.test(r.description)) sc += 3;
    sc += Math.min((r.stargazers_count || 0) / 50, 3) + Math.min((new Date(r.pushed_at).getTime() - Date.now() < 0 ? (Date.now() - new Date(r.pushed_at).getTime()) / 86400000 : 999) < 180 ? 2 : 0, 2);
    return { name: r.full_name, sc, desc: r.description, default_branch: r.default_branch };
  }).sort((a, b) => b.sc - a.sc);
  return scored[0];
}

for (const [netuidStr, cfg] of Object.entries(RECOVERY)) {
  const netuid = Number(netuidStr);
  const f = `${RAW}/${netuid}.json`;
  if (!fs.existsSync(f)) continue;
  const rec = JSON.parse(fs.readFileSync(f, "utf8"));
  if (rec.readmeStatus === "ok") continue;

  let found = null, usedUrl = null;
  if (cfg.org) {
    const best = await bestOrgRepo(cfg.org, cfg.hint);
    if (best) {
      const [owner, repo] = best.name.split("/");
      const rm = await fetchReadme(owner, repo);
      if (rm) { found = rm; usedUrl = `https://github.com/${best.name} (resolved from org, score ${best.sc.toFixed(1)}: ${best.desc || ""})`; }
    }
  } else if (cfg.search) {
    const res = await ghApi(`https://api.github.com/search/repositories?q=${encodeURIComponent(cfg.search)}&per_page=5`);
    if (res && Array.isArray(res.items) && res.items.length) {
      for (const r of res.items) {
        const [owner, repo] = r.full_name.split("/");
        const rm = await fetchReadme(owner, repo);
        if (rm) { found = rm; usedUrl = `https://github.com/${r.full_name} (via search: "${cfg.search}")`; break; }
      }
    }
  }
  if (found) {
    rec.readme = found.content; rec.readmeUrl = found.url; rec.readmeStatus = "ok";
    rec.recoveryNote = usedUrl;
    const pr = parseRepo(found.url);
    if (pr) { rec.owner = pr.owner; rec.repo = pr.repo; }
    console.log(`SN${netuid}: RECOVERED -> ${usedUrl}`);
  } else {
    console.log(`SN${netuid}: still unresolved (${cfg.org ? "org " + cfg.org : cfg.search})`);
  }
  fs.writeFileSync(f, JSON.stringify(rec));
}
console.log("recovery pass done");
