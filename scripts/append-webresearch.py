#!/usr/bin/env python3
"""subnet-info-1: append web-research notes to gap subnet extract files."""
import json, os, glob, re

BASE = "/home/z/my-project/scripts/subnet-info-extracts"

for f in sorted(glob.glob(os.path.join(BASE, "websearch", "*.json"))):
    netuid = os.path.basename(f).replace(".json", "")
    try:
        data = json.load(open(f))
    except Exception:
        print(f"{netuid}: unparseable"); continue
    # data may be wrapped
    items = data if isinstance(data, list) else data.get("data") or data.get("results") or []
    lines = ["", "## WEB RESEARCH (search snippets, unverified)"]
    used = 0
    for it in items:
        if not isinstance(it, dict): continue
        name = (it.get("name") or "").strip()
        snip = (it.get("snippet") or "").strip().replace("\n", " ")
        url = it.get("url") or ""
        if not snip: continue
        lines.append(f"- [{name}]({url}): {snip[:420]}")
        used += 1
        if used >= 5: break
    if used == 0:
        lines.append("- (no usable results)")
    target = os.path.join(BASE, f"{netuid}.md")
    with open(target, "a") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"{netuid}: +{used} snippets")
