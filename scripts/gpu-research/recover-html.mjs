/**
 * INFRANEX GPU research — Step 2c: recover via GitHub HTML (no API rate limit).
 * Parses org repository pages and search result pages for repo links.
 */
import fs from "fs";

const DIR = "/home/z/my-project/scripts/gpu-research";
const RAW = `${DIR}/raw`;
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 infranex-research";

async function fetchHtml(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow" });
    if (!res.ok) return null;
    return await res.text();
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
    for (const p of ["README.md", "readme.md", "Readme.md", "README.rst", "README.txt", "README"]) {
      const c = await fetchText(`https://raw.githubusercontent.com/${owner}/${repo}/${b}/${p}`);
      if (c && c.trim()) return { content: c, url: `https://github.com/${owner}/${repo}/blob/${b}/${p}` };
    }
  }
  return null;
}

// extract candidate repo full-names from HTML (hrefs like /owner/repo)
function extractRepos(html, org) {
  const set = new Set();
  const re = new RegExp(`href="/(?:${org}|orgs/${org})/([A-Za-z0-9_.-]+)"`, "g");
  let m;
  while ((m = re.exec(html))) {
    const name = m[1];
    if (!["repositories", "people", "teams", "projects", "orgs", "settings"].includes(name)) set.add(`${org}/${name}`);
  }
  // generic repo hrefs on search pages
  const re2 = /href="\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)"/g;
  while ((m = re2.exec(html))) {
    const [, o, r] = m;
    if (![o, r].some((x) => ["orgs", "search", "features", "sponsors", "topics", "collections", "trending", "github", "about", "pricing", "security", "login", "join", "site", "customer-stories", "readme", "enterprise", "apps", "marketplace", "settings", "notifications", "watchlist", "explore", "issues", "pulls", "codespaces", "git", "docs", "community", "events", "education", "dashboard", "account"].includes(x.toLowerCase()))) {
      set.add(`${o}/${r}`);
    }
  }
  return [...set];
}

const JOBS = [
  { netuid: 122, org: "CookingTao", mode: "org", hint: /cook/i },
  { netuid: 103, org: "Capcomp-AI", mode: "org", hint: /cap/i },
  { netuid: 105, org: "Beam-Network", mode: "org", hint: /beam/i },
  { netuid: 118, org: "ditto-assistant", mode: "org", hint: /ditto/i },
  { netuid: 120, org: "AffineFoundation", mode: "org", hint: /affine/i },
  { netuid: 97,  org: "unarbos", mode: "org", hint: /albedo/i },
  { netuid: 16,  org: null, mode: "search", q: "trav subnet bittensor" },
  { netuid: 30,  org: null, mode: "search", q: "endure network bittensor" },
  { netuid: 31,  org: null, mode: "search", q: "rec4ll bittensor" },
  { netuid: 87,  org: null, mode: "search", q: "provenonce bittensor" },
  { netuid: 99,  org: null, mode: "search", q: "thirty spokes bittensor" },
  { netuid: 109, org: null, mode: "search", q: "finsight bittensor subnet" },
  { netuid: 110, org: null, mode: "search", q: "green compute bittensor subnet" },
  { netuid: 116, org: null, mode: "search", q: "memo bittensor subnet" },
  { netuid: 95,  org: null, mode: "search", q: "actual-computer subnet-95" },
];

for (const job of JOBS) {
  const f = `${RAW}/${job.netuid}.json`;
  if (!fs.existsSync(f)) continue;
  const rec = JSON.parse(fs.readFileSync(f, "utf8"));
  if (rec.readmeStatus === "ok") { console.log(`SN${job.netuid}: already ok`); continue; }

  let candidates = [];
  if (job.mode === "org") {
    const html = await fetchHtml(`https://github.com/orgs/${job.org}/repositories?q=&type=all`);
    if (html) candidates = extractRepos(html, job.org).filter((r) => job.hint.test(r));
    if (!candidates.length) {
      // also try user page (some identities point to users not orgs)
      const html2 = await fetchHtml(`https://github.com/${job.org}?tab=repositories`);
      if (html2) candidates = extractRepos(html2, job.org).filter((r) => job.hint.test(r));
    }
  } else {
    const html = await fetchHtml(`https://github.com/search?q=${encodeURIComponent(job.q)}&type=repositories`);
    if (html) candidates = extractRepos(html, "__none__").slice(0, 8);
  }

  let done = false;
  for (const full of candidates.slice(0, 6)) {
    const [owner, repo] = full.split("/");
    if (!owner || !repo) continue;
    const rm = await fetchReadme(owner, repo);
    if (rm) {
      rec.readme = rm.content; rec.readmeUrl = rm.url; rec.readmeStatus = "ok";
      rec.owner = owner; rec.repo = repo;
      rec.recoveryNote = `https://github.com/${full} (html ${job.mode} recovery)`;
      console.log(`SN${job.netuid}: RECOVERED -> ${full}`);
      done = true; break;
    }
  }
  if (!done) console.log(`SN${job.netuid}: unresolved (candidates: ${candidates.slice(0, 4).join(", ") || "none"})`);
  fs.writeFileSync(f, JSON.stringify(rec));
}
console.log("html recovery done");
