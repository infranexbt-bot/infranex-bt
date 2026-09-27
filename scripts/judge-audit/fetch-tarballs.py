#!/usr/bin/env python3
"""fetch-tarballs.py — judge-audit phase 1.

Downloads every subnet repo as a codeload tarball (rate-limit free CDN) and
extracts the inputs the Validator Lab would feed its extractor:
  - validator candidate files (all *validat*.py in the tree, plus the 8
    standard paths the app probes)
  - README (README.md / readme.md / README.rst)

Output: scripts/judge-audit/tarball-inputs.json
  { "<owner/repo>": {
      "status": "ok" | "404" | "error",
      "default_branch": "...",
      "files": { "<repo-relative path>": "<content>" },   # validator candidates + README
      "validator_paths_all": [...],                        # every *validat*.py path in tree
      "total_files": 123
  }, ... }

Run: python3 scripts/judge-audit/fetch-tarballs.py
"""
import io
import json
import os
import re
import tarfile
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(BASE, "tarballs")
os.makedirs(WORK, exist_ok=True)

UA = {"User-Agent": "infranex-judge-audit/1.0"}
VALIDAT_RE = re.compile(r"validat.*\.py$|.*validat/.*\.py$", re.I)


def load_targets():
    """netuid -> owner/repo (override githubUrl -> curated seed fallback)."""
    import subprocess
    ROOT = os.path.dirname(os.path.dirname(BASE))  # project root
    node_script = """
const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
const fs = require('fs');
(async () => {
  const rows = await p.$queryRawUnsafe('SELECT netuid, githubUrl FROM SubnetOverride');
  const byNet = {};
  for (const r of rows) if (r.githubUrl) byNet[Number(r.netuid)] = r.githubUrl;
  await p.$disconnect();
  const scraperSrc = fs.readFileSync('src/lib/infranex/github-scraper.ts', 'utf8');
  const start = scraperSrc.indexOf('export const CURATED_MINER_REPOS');
  const body = scraperSrc.slice(start, start + 12000);
  const curated = {};
  for (const m of body.matchAll(/^\\s{2}(\\d+):\\s*"([^"]+)"/gm)) curated[Number(m[1])] = m[2];
  console.log(JSON.stringify({ overrides: byNet, curated }));
})();
"""
    out = subprocess.run(["node", "-e", node_script], capture_output=True, text=True, cwd=ROOT)
    if out.returncode != 0 or not out.stdout.strip():
        raise RuntimeError(f"node helper failed: {out.stderr[:500]}")
    data = json.loads(out.stdout.strip())
    targets = {}
    for netuid in range(0, 129):
        url = data["overrides"].get(str(netuid)) or data["curated"].get(str(netuid))
        if not url:
            targets[netuid] = None
            continue
        m = url.replace("https://", "").replace("http://", "").split("?")[0].rstrip("/").split("/")
        if len(m) >= 2 and m[0] != "github.com" and "github.com" not in url:
            targets[netuid] = None
            continue
        owner_repo = None
        for i, part in enumerate(m):
            if part == "github.com" and i + 2 < len(m):
                owner_repo = f"{m[i+1]}/{m[i+2]}"
                break
        if not owner_repo and len(m) >= 2 and "github.com" not in url:
            owner_repo = f"{m[0]}/{m[1]}"
        if owner_repo:
            owner_repo = owner_repo.removesuffix(".git")
            targets[netuid] = owner_repo
    return targets


def fetch_tarball(owner_repo: str):
    url = f"https://codeload.github.com/{owner_repo}/tar.gz/refs/heads/HEAD"
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=45) as resp:
            return resp.read(), None
    except urllib.error.HTTPError as e:
        if e.code == 404:
            # default branch may not be HEAD on old setups — try master/main
            for br in ("master", "main"):
                try:
                    req = urllib.request.Request(
                        f"https://codeload.github.com/{owner_repo}/tar.gz/refs/heads/{br}", headers=UA)
                    with urllib.request.urlopen(req, timeout=45) as resp:
                        return resp.read(), None
                except urllib.error.HTTPError:
                    continue
                except Exception as ex:
                    return None, str(ex)
            return None, "404"
        return None, f"HTTP {e.code}"
    except Exception as e:
        return None, str(e)


def extract_inputs(blob: bytes):
    """Pull validator candidates + READMEs out of the tarball."""
    files = {}
    validator_paths_all = []
    total = 0
    root_prefix = None
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tar:
        for member in tar.getmembers():
            if not member.isfile():
                continue
            total += 1
            path = member.posix_name if hasattr(member, "posix_name") else member.name
            parts = path.split("/", 1)
            if len(parts) < 2:
                continue
            if root_prefix is None:
                root_prefix = parts[0]
            rel = parts[1]
            base = os.path.basename(rel).lower()
            is_validator = bool(VALIDAT_RE.search(rel))
            is_readme = base in ("readme.md", "readme.rst", "readme")
            if not (is_validator or is_readme):
                continue
            if member.size > 1_500_000:  # 1.5MB cap per file
                continue
            try:
                f = tar.extractfile(member)
                if f is None:
                    continue
                raw = f.read()
                try:
                    text = raw.decode("utf-8")
                except UnicodeDecodeError:
                    text = raw.decode("latin-1", errors="replace")
                files[rel] = text
            except Exception:
                continue
            if is_validator:
                validator_paths_all.append(rel)
    return files, validator_paths_all, total


def process(owner_repo: str):
    cache_path = os.path.join(WORK, owner_repo.replace("/", "__") + ".json")
    if os.path.exists(cache_path):
        with open(cache_path) as f:
            return owner_repo, json.load(f)
    blob, err = fetch_tarball(owner_repo)
    if err:
        rec = {"status": "404" if err == "404" else "error", "error": err, "files": {}, "validator_paths_all": [], "total_files": 0}
    else:
        try:
            files, vpaths, total = extract_inputs(blob)
            rec = {"status": "ok", "files": files, "validator_paths_all": vpaths, "total_files": total}
        except Exception as e:
            rec = {"status": "error", "error": f"untar: {e}", "files": {}, "validator_paths_all": [], "total_files": 0}
    with open(cache_path, "w") as f:
        json.dump(rec, f)
    return owner_repo, rec


def main():
    targets = load_targets()
    unique_repos = sorted({r for r in targets.values() if r})
    print(f"targets: 129 netuids, {len(unique_repos)} unique repos, "
          f"{sum(1 for v in targets.values() if v is None)} without repo")
    results = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(process, r): r for r in unique_repos}
        done = 0
        for fut in as_completed(futures):
            owner_repo, rec = fut.result()
            results[owner_repo] = rec
            done += 1
            if done % 20 == 0 or done == len(unique_repos):
                print(f"  {done}/{len(unique_repos)} repos fetched")
    # attach per-netuid mapping
    by_netuid = {}
    for netuid, repo in targets.items():
        by_netuid[str(netuid)] = {"repo": repo, "data": results.get(repo)} if repo else {"repo": None, "data": None}
    out = {"by_netuid": by_netuid, "repos": results}
    with open(os.path.join(BASE, "tarball-inputs.json"), "w") as f:
        json.dump(out, f)
    ok = sum(1 for r in results.values() if r["status"] == "ok")
    missing = sum(1 for v in targets.values() if v is None)
    print(f"DONE: ok={ok} missing-repo={missing} failed={len(unique_repos)-ok}")


if __name__ == "__main__":
    main()
