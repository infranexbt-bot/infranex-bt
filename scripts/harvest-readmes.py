#!/usr/bin/env python3
"""Harvest all Bittensor subnet READMEs and scan for GPU hosting requirements.

Fetches raw.githubusercontent.com/{owner}/{repo}/HEAD/README(.md|.mdx) for each
subnet repo, scans for keyword categories (bare metal, static IP, provider bans,
TEE, container, GPU/VRAM, CPU-only), and writes tool-results/readme-report.json.
"""
import concurrent.futures as cf
import json
import re
import time
import urllib.request

REGISTRY = "tool-results/subnet-registry.json"
OUT = "tool-results/readme-report.json"

CATEGORIES = {
    "bare_metal": r"bare[\s\-_]?metal",
    "static_ip": r"static[\s\-_]?ip|dedicated[\s\-_]?ip|unique[\s\-_]?ip|1:1\s*(?:port|nat)|port[\s\-_]?forward|ip[\s\-_]?whitelist",
    "runpod": r"runpod",
    "vast": r"\bvast\.ai\b",
    "lambda_cloud": r"lambda\s*(?:labs|cloud|gpu)",
    "provider_ban": r"(?:not|no|won\s?.t|cannot|can\s?t|doesn\s?t)\s+(?:work|run|operate|be\s+(?:run|hosted|used)|support|allow(?:ed)?)\s[^.\n]{0,60}(?:runpod|vast|container|docker|cloud|shared)",
    "residential_ip": r"residential",
    "tee": r"\btee\b|confidential[\s\-]?(?:comput|ai|gpu)|\btdx\b|\bsgx\b|dstack|attestation|\bcc[\s\-]?mode",
    "container_ok": r"\bdocker\b|container(?:ized|s)?\b|kubernetes|\bk8s\b",
    "own_hardware": r"own\s+(?:hardware|server|machine|gpu|infra)|colocation|\bcolo\b|on[\s\-]?prem(?:ise)?|self[\s\-]host",
    "rental_mention": r"\brent(?:al|ed|ing)?\b",
    "gpu_model": r"\b(?:H100|H200|B200|B300|A100|H800|A6000|L40S?|RTX\s?4090|RTX\s?5090|RTX\s?PRO|3090|4090|5090)\b",
    "vram": r"\b\d{2,3}\s?GB\b",
    "cpu_only": r"cpu[\s\-]?only|no\s+gpu|without\s+(?:a\s+)?gpu|does\s+not\s+(?:require|need)\s+(?:a\s+)?gpu",
    "gpu_required": r"(?:requires?|needs?|must\s+(?:have|run))[^.\n]{0,40}\bGPU",
}

HDRS = {"User-Agent": "infranex-bt-research/1.0", "Accept": "text/plain"}


def parse_repo(url):
    if not url:
        return None
    m = re.search(r"github\.com/([^/]+)/([^/#?]+)", url)
    if not m:
        return None
    owner, repo = m.group(1), m.group(2)
    if owner == "orgs":  # org listing URL, not a repo
        return None
    return f"{owner}/{repo}".replace(".git", "")


def fetch(url, timeout=15):
    try:
        req = urllib.request.Request(url, headers=HDRS)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception:
        return None


def scan_text(text):
    hits = {}
    lines = text.splitlines()
    for cat, pat in CATEGORIES.items():
        rx = re.compile(pat, re.IGNORECASE)
        found = []
        for i, ln in enumerate(lines):
            if rx.search(ln):
                ctx = " ".join(x.strip() for x in lines[max(0, i - 1): i + 2] if x.strip())
                found.append(ctx[:300])
            if len(found) >= 4:
                break
        if found:
            hits[cat] = found
    return hits


def process(entry):
    netuid, info = entry
    repo = parse_repo(info.get("gh"))
    res = {"netuid": netuid, "name": info.get("name"), "gh": info.get("gh"),
           "repo": repo, "readme": None, "words": 0, "hits": {}}
    if not repo:
        return res
    for path in ("README.md", "readme.md", "README.mdx", "Readme.md"):
        url = f"https://raw.githubusercontent.com/{repo}/HEAD/{path}"
        txt = fetch(url)
        if txt and len(txt) > 80:
            res["readme"] = url
            res["words"] = len(txt.split())
            res["hits"] = scan_text(txt)
            break
    return res


def main():
    registry = json.load(open(REGISTRY))
    results = []
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        for i, r in enumerate(ex.map(process, sorted(registry.items(), key=lambda kv: int(kv[0])))):
            results.append(r)
            if (i + 1) % 20 == 0:
                print(f"  ... {i + 1}/{len(registry)}")
    json.dump(results, open(OUT, "w"), indent=1)
    got = sum(1 for r in results if r["readme"])
    print(f"done: {got}/{len(results)} READMEs fetched -> {OUT}")


if __name__ == "__main__":
    t0 = time.time()
    main()
    print(f"elapsed: {time.time() - t0:.1f}s")
