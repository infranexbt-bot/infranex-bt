/**
 * INFRANEX GPU research — Step 2: fetch README + requirement files per repo.
 * Reads dataset.json, fetches raw.githubusercontent.com content for each repo,
 * saves per-netuid JSON into raw/ cache. Concurrency-limited, polite UA.
 */
import fs from "fs";

const DIR = "/home/z/my-project/scripts/gpu-research";
const RAW = `${DIR}/raw`;
fs.mkdirSync(RAW, { recursive: true });

const dataset = JSON.parse(fs.readFileSync(`${DIR}/dataset.json`, "utf8"));
const UA = "infranex-research/1.0 (bittensor GPU requirements study)";

const README_PATHS = ["README.md", "readme.md", "Readme.md", "README.rst", "README.txt", "README", ".github/README.md"];
const CODE_PATHS = ["requirements.txt", "requirements-min.txt", "environment.yml", "pyproject.toml", "setup.py", "Dockerfile", "docker/Dockerfile", "mining/Dockerfile", "neurons/miner.py", "neurons/validator.py"];

function parseRepo(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("github.com")) return null;
    const p = u.pathname.split("/").filter(Boolean);
    if (p.length < 2) return null;
    return { owner: p[0], repo: p[1].replace(/\.git$/, ""), branch: p[2] === "tree" ? p[3] : undefined };
  } catch { return null; }
}

async function fetchText(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 2_000_000 ? text.slice(0, 2_000_000) : text;
  } catch { return null; } finally { clearTimeout(t); }
}

async function fetchReadme(info) {
  const branches = [info.branch, "main", "master"].filter(Boolean);
  for (const b of branches) {
    for (const p of README_PATHS) {
      const c = await fetchText(`https://raw.githubusercontent.com/${info.owner}/${info.repo}/${b}/${p}`);
      if (c && c.trim().length > 0) {
        return { content: c, url: `https://github.com/${info.owner}/${info.repo}/blob/${b}/${p}` };
      }
    }
  }
  return null;
}

async function fetchCodeFiles(info) {
  const branches = [info.branch, "main", "master"].filter(Boolean);
  const found = {};
  for (const b of branches) {
    for (const p of CODE_PATHS) {
      if (found[p]) continue;
      const c = await fetchText(`https://raw.githubusercontent.com/${info.owner}/${info.repo}/${b}/${p}`, 12000);
      if (c && c.trim().length > 0) found[p] = c;
    }
    if (Object.keys(found).length >= 4) break; // enough signal
  }
  return found;
}

async function processSubnet(s) {
  const outFile = `${RAW}/${s.netuid}.json`;
  if (fs.existsSync(outFile)) {
    try {
      const prev = JSON.parse(fs.readFileSync(outFile, "utf8"));
      if (prev.readmeStatus === "ok" || prev.readmeStatus === "not-found") return "cached";
    } catch {}
  }
  const result = {
    netuid: s.netuid, name: s.name, githubUrl: s.githubUrl, githubSource: s.githubSource,
    readme: null, readmeUrl: null, readmeStatus: "no-repo", codeFiles: {}, fetchedAt: new Date().toISOString(),
  };
  if (s.githubUrl) {
    const info = parseRepo(s.githubUrl);
    if (!info) { result.readmeStatus = "bad-url"; }
    else {
      const rm = await fetchReadme(info);
      if (rm) { result.readme = rm.content; result.readmeUrl = rm.url; result.readmeStatus = "ok"; }
      else result.readmeStatus = "not-found";
      result.codeFiles = await fetchCodeFiles(info);
      result.owner = info.owner; result.repo = info.repo;
    }
  }
  fs.writeFileSync(outFile, JSON.stringify(result));
  return result.readmeStatus;
}

// concurrency pool of 6
const queue = [...dataset.subnets];
const statuses = [];
async function worker() {
  while (queue.length) {
    const s = queue.shift();
    if (!s) break;
    try {
      const st = await processSubnet(s);
      statuses.push({ netuid: s.netuid, status: st });
      console.log(`SN${s.netuid} ${s.name}: ${st}`);
    } catch (e) {
      statuses.push({ netuid: s.netuid, status: "error" });
      console.error(`SN${s.netuid} ${s.name}: ERROR ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

const summary = {};
for (const { status } of statuses) summary[status] = (summary[status] || 0) + 1;
fs.writeFileSync(`${DIR}/fetch-summary.json`, JSON.stringify({ statuses, summary }, null, 2));
console.log("\nSUMMARY:", JSON.stringify(summary));
