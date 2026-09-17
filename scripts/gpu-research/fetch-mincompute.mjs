/**
 * INFRANEX GPU research — Step 2f: fetch min_compute.yml (+ variants) for all repos.
 * This is the canonical Bittensor "minimum compute" declaration file.
 */
import fs from "fs";

const DIR = "/home/z/my-project/scripts/gpu-research";
const RAW = `${DIR}/raw`;
const UA = "infranex-research/1.0";

const PATHS = [
  "min_compute.yml", "min_compute.yaml",
  "miners/min_compute.yml", "miners/min_compute.yaml",
  "docs/min_compute.yml", "docs/min_compute.yaml",
  "neurons/min_compute.yml",
  "scripts/min_compute.yml",
];

async function fetchText(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

let got = 0, total = 0;
for (const f of fs.readdirSync(RAW)) {
  const rec = JSON.parse(fs.readFileSync(`${RAW}/${f}`, "utf8"));
  if (!rec.owner || !rec.repo) continue;
  if (rec.readmeStatus === "no-repo" || rec.readmeStatus === "bad-url") continue;
  total++;
  let found = null, usedPath = null;
  outer: for (const b of ["main", "master"]) {
    for (const p of PATHS) {
      const c = await fetchText(`https://raw.githubusercontent.com/${rec.owner}/${rec.repo}/${b}/${p}`);
      if (c && c.trim()) { found = c; usedPath = p; break outer; }
    }
  }
  if (found) {
    rec.codeFiles = rec.codeFiles || {};
    rec.codeFiles[usedPath] = found;
    rec.minComputePath = usedPath;
    fs.writeFileSync(`${RAW}/${f}`, JSON.stringify(rec));
    got++;
    console.log(`SN${rec.netuid}: ${usedPath} (${found.length}b)`);
  }
}
console.log(`\nmin_compute.yml fetched for ${got}/${total} repos`);
