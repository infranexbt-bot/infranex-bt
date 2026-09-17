#!/usr/bin/env python3
"""Debug: probe macrocosm-os/apex repo files used by the profiler."""
import json, urllib.request

REPO = "macrocosm-os/apex"
BRANCHES = ["main", "master"]
UA = {"User-Agent": "infranex-devops/1.0"}

def get(url):
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.read().decode("utf-8", "replace")
    except Exception as e:
        return None

# 1) repo tree
tree = None
for b in BRANCHES:
    raw = get(f"https://api.github.com/repos/{REPO}/git/trees/{b}?recursive=1")
    if raw:
        j = json.loads(raw)
        tree = [t["path"] for t in j.get("tree", []) if t.get("type") == "blob"]
        print(f"TREE via branch {b}: {len(tree)} files")
        break
if tree is None:
    print("TREE: FAILED (rate limit?)")

# 2) top-level listing
if tree:
    tops = sorted({p.split("/")[0] for p in tree})
    print("top-level entries:", tops[:20])
    interesting = [p for p in tree if p.endswith((".py", ".toml", ".txt", ".yml", "Dockerfile")) and p.count("/") <= 2]
    print("candidates:")
    for p in interesting[:40]:
        print("  ", p)

# 3) requirements / pyproject raw
for path in ["requirements.txt", "requirements-min.txt", "pyproject.toml"]:
    for b in BRANCHES:
        c = get(f"https://raw.githubusercontent.com/{REPO}/{b}/{path}")
        if c:
            print(f"--- {path} @ {b} ({len(c)} bytes) ---")
            print(c[:600])
            break
        else:
            print(f"{path} @ {b}: 404")
