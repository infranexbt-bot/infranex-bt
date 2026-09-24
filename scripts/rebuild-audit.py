#!/usr/bin/env python3
"""Rebuild the subnet hosting audit end-to-end after a sandbox reset.

Steps: DB registry -> bulk README harvest -> tarball fallbacks -> org-repo
resolution -> raw-text GPU mentions -> classification -> compat seed.
"""
import json
import sqlite3
import subprocess
import sys
import urllib.request
import tarfile
import io
import re
import concurrent.futures as cf

sys.path.insert(0, "scripts")


def sh(cmd):
    print(f"+ {cmd}")
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(r.stdout[-2000:] if r.stdout else "", end="")
    if r.returncode != 0:
        print(r.stderr[-1000:])
    return r.returncode


# 1. registry from DB ----------------------------------------------------------
con = sqlite3.connect("db/custom.db")
cur = con.cursor()
cur.execute("SELECT subnetsJson FROM ChainSnapshot ORDER BY id DESC LIMIT 1")
subs = json.loads(cur.fetchone()[0])
cur.execute("SELECT netuid, githubUrl FROM SubnetOverride")
ov = {str(r[0]): r[1] for r in cur.fetchall()}
merged = {}
for s in subs:
    n = str(s["netuid"])
    gh = s.get("identityGithub") or ov.get(n)
    merged[n] = {"name": s.get("name"), "gh": gh,
                 "emission": s.get("emissionTaoPerDay") or 0,
                 "miners": s.get("minersCount") or 0}
json.dump(merged, open("tool-results/subnet-registry.json", "w"), indent=1)
print(f"registry: {len(merged)} subnets, {sum(1 for v in merged.values() if v['gh'])} with repo")

# 2. bulk harvest ---------------------------------------------------------------
sh("python3 scripts/harvest-readmes.py")

# 3. tarball fallbacks for repos raw fetch missed -------------------------------
def tarball_readme(repo):
    url = f"https://codeload.github.com/{repo}/tar.gz/HEAD"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "infranex-bt/1.0"})
        data = urllib.request.urlopen(req, timeout=30).read()
        tf = tarfile.open(fileobj=io.BytesIO(data), mode="r:gz")
        out = []
        for m in tf.getmembers():
            base = m.name.split("/")[-1].lower()
            if base.startswith("readme") and (base.endswith((".md", ".mdx", ".rst")) or "." not in base):
                out.append(tf.extractfile(m).read().decode("utf-8", errors="replace"))
        return "\n\n".join(out) if out else None
    except Exception:
        return None

FALLBACK = {"95": "actual-computer/actual-subnet-95", "97": "unarbos/albedo",
            "117": "everyframe-studios/everyframe-miner", "120": "AffineFoundation/affine",
            "126": "attelierai/attelierai_subnet", "39": "deprecated/deprecated"}
for n, repo in FALLBACK.items():
    txt = tarball_readme(repo)
    if txt:
        open(f"tool-results/readme-{n}.txt", "w").write(txt)
        print(f"fallback {n} {repo}: {len(txt.split())} words")
    else:
        print(f"fallback {n} {repo}: unavailable")

# 4. org/profile repo resolution -------------------------------------------------
def list_repos(org, is_user=False):
    url = f"https://github.com/{org}{'' if is_user else '/orgs/' + org + '/repositories'}?tab=repositories&type=all" if is_user \
        else f"https://github.com/orgs/{org}/repositories?q=&type=all"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        html = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", errors="replace")
        repos = sorted(set(re.findall(rf'href="/{org}/([^/"?#]+)"', html)))
        skip = {"orgs", "topics", "sponsors", "about", "people", "repositories", "settings", ".github"}
        return [r for r in repos if r not in skip]
    except Exception as e:
        print(f"org {org}: ERR {e}")
        return []

cap = list_repos("Capcomp-AI")
beam = list_repos("Beam-Network")
ditto = list_repos("ditto-assistant")
cook = list_repos("CookingTao", is_user=True)
INJECT = {
    "103": ("Capcomp-AI", cap[0] if cap else None),
    "105": ("Beam-Network", "beam" if "beam" in beam else (beam[0] if beam else None)),
    "118": ("ditto-assistant", "bittensor-pylon" if "bittensor-pylon" in ditto else None),
    "122": ("CookingTao", "CookingTAO-Subnet" if "CookingTAO-Subnet" in cook else None),
    "64": (None, "chutesai/chutes-miner"),  # authoritative miner README supplement
}
for n, (org, repo) in INJECT.items():
    if not repo:
        print(f"inject {n}: no repo found")
        continue
    full = f"{org}/{repo}" if org else repo
    txt = tarball_readme(full)
    if txt:
        # classify-subnets.py expects SN64's supplement at readme-extra-64s.txt
        fn = f"tool-results/readme-extra-{n}s.txt" if n == "64" else f"tool-results/readme-extra-{n}.txt"
        open(fn, "w").write(txt)
        print(f"inject {n} {full}: {len(txt.split())} words -> {fn}")
    else:
        print(f"inject {n} {full}: unavailable")

# 5. raw-text GPU mentions --------------------------------------------------------
rep = json.load(open("tool-results/readme-report.json"))

def raw_get(repo):
    for p in ("README.md", "readme.md", "README.mdx"):
        try:
            req = urllib.request.Request(f"https://raw.githubusercontent.com/{repo}/HEAD/{p}",
                                         headers={"User-Agent": "infranex-bt/1.0"})
            return urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="replace")
        except Exception:
            continue
    return None

targets = [r["repo"] for r in rep if r["repo"]]
texts = {}
with cf.ThreadPoolExecutor(max_workers=8) as ex:
    for repo, txt in zip(targets, ex.map(raw_get, targets)):
        if txt:
            texts[repo] = txt
print(f"raw text for {len(texts)} repos")
json.dump(texts, open("tool-results/readme-raw.json", "w"))

summary = {}
for r in rep:
    txt = texts.get(r["repo"])
    if not txt:
        continue
    summary[str(r["netuid"])] = {
        "repo": r["repo"],
        "gpu_mentions": txt.lower().count("gpu"),
        "total_words": len(txt.split()),
        "req_sections": [],
    }
json.dump(summary, open("tool-results/gpu-mention-summary.json", "w"), indent=1)
print(f"gpu-mention summary: {len(summary)} entries")

# 6. classify + seed --------------------------------------------------------------
sh("python3 scripts/classify-subnets.py > tool-results/classify-output.txt")
sh("python3 scripts/gen-compat-seed.py")
print("AUDIT REBUILD DONE")
