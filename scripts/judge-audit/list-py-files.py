#!/usr/bin/env python3
"""list-py-files.py — for the 10 discovery-gap repos, list top-level/neuron-ish
.py files so the report can name where validator logic actually lives."""
import io
import tarfile
import urllib.request

REPOS = [
    "manifold-inc/targon", "404-Repo/404-gen-subnet", "taostat/blockmachine",
    "urfoundation/sn", "Subnet46/sn46-validator", "tensorplex-labs/dojo",
    "thenervelab/thebrain", "creativebuilds/sn77", "moirai115/MoirAI",
    "Barbariandev/refinery",
]
UA = {"User-Agent": "infranex-judge-audit/1.0"}

KEY = re.compile(r"(neuron|vali|score|reward|scoring|evaluat|incentiv)", re.I) if False else None
import re
KEY = re.compile(r"(neuron|vali|score|reward|evaluat|incentiv)", re.I)


def fetch(repo: str):
    for ref in ("HEAD", "main", "master"):
        try:
            req = urllib.request.Request(
                f"https://codeload.github.com/{repo}/tar.gz/refs/heads/{ref}", headers=UA)
            return urllib.request.urlopen(req, timeout=45).read()
        except urllib.error.HTTPError:
            continue
    return None


for repo in REPOS:
    blob = fetch(repo)
    if blob is None:
        print(repo, "-> unreachable")
        continue
    tf = tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz")
    pys = []
    for m in tf.getmembers():
        if not m.isfile() or not m.name.endswith(".py"):
            continue
        rel = m.name.split("/", 1)[-1]
        pys.append(rel)
    hot = [p for p in pys if KEY.search(p)]
    top = [p for p in pys if "/" not in p][:6]
    print(repo)
    print("   scoring-ish:", hot[:8] or "none")
    print("   root .py:", top or "none")
