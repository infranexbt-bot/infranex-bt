/**
 * INFRANEX GPU research — Step 2e: fetch code files for README-less repos.
 * GPU hints hide in pyproject.toml / Dockerfile / docker-compose / .env.example_miners.
 */
import fs from "fs";

const DIR = "/home/z/my-project/scripts/gpu-research";
const RAW = `${DIR}/raw`;
const UA = "infranex-research/1.0";

async function fetchText(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

const JOBS = [
  { netuid: 120, owner: "AffineFoundation", repo: "affine", files: ["pyproject.toml", "Dockerfile", "requirements.txt", "docker-compose.yml", ".env.example", "miner/requirements.txt", "docs/README.md"] },
  { netuid: 97,  owner: "unarbos", repo: "albedo", files: ["pyproject.toml", "docker-compose.yml", ".env.example_miners", ".env.example", "docs/index.md", "docs/README.md", "miner/README.md"] },
  { netuid: 103, owner: "Capcomp-AI", repo: "capability-composition-subnet", files: ["Dockerfile", "pyproject.toml"] },
];

for (const j of JOBS) {
  const f = `${RAW}/${j.netuid}.json`;
  const rec = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const p of j.files) {
    if (rec.codeFiles[p]) continue;
    let got = null;
    for (const b of ["main", "master"]) {
      got = await fetchText(`https://raw.githubusercontent.com/${j.owner}/${j.repo}/${b}/${p}`);
      if (got) break;
    }
    if (got) { rec.codeFiles[p] = got; console.log(`SN${j.netuid}: got ${p} (${got.length})`); }
  }
  fs.writeFileSync(f, JSON.stringify(rec));
}
console.log("code-file pass done");
