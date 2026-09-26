#!/usr/bin/env python3
"""deep-scrape.py — full-repo tarball grep for GPU requirements evidence.

For each ESTIMATE subnet: download codeload tarball, walk every text file,
collect GPU-model / VRAM / hardware-requirement evidence lines with file paths.
Rate-limit free (codeload CDN, not api.github.com).

Output: scripts/gpu-audit/deep-scrape-results.json
"""
import io
import json
import os
import re
import tarfile
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = os.path.dirname(os.path.abspath(__file__))
TARGETS = json.load(open(os.path.join(BASE, "estimate-targets.json")))
OUT = os.path.join(BASE, "deep-scrape-results.json")
WORK = os.path.join(BASE, "deep-trees")
os.makedirs(WORK, exist_ok=True)

UA = {"User-Agent": "infranex-gpu-audit/1.0"}

GPU_MODEL_RE = re.compile(
    r"\b(B300|B200|GB200|H200|H100|H800|A800|A100|A90|L40S|L40|A40|A6000|A5000|RTX\s?PRO\s?6000|"
    r"RTX\s?6000\s?ADA|RTX\s?5090|RTX\s?5080|RTX\s?4090|RTX\s?4080|RTX\s?3090\s?TI|RTX\s?3090|RTX\s?3080|"
    r"GTX\s?1660|GTX\s?1080|MI300X|MI250X|T4|V100|P100|A10G|A10\b|L4\b)\b",
    re.I,
)
VRAM_RE = re.compile(
    r"(?i)(?:vram|gpu\s*memory|graphics\s*memory|memory\s*requirement|min(?:imum)?\s*memory)"
    r"[^\n]{0,60}?\b(\d{2,4})\s?gb\b|\b(\d{2,4})\s?gb\b[^\n]{0,30}?(?:vram|gpu memory)"
)
REQ_CONTEXT_RE = re.compile(
    r"(?i)(require|minimum|minimum of|at least|need|needs|recommend(?:ed)?|supported|"
    r"hardware|spec(?:ification)?s?|must have|runs? on|deploy)"
)
RANGE_RE = re.compile(r"(?i)\b\d{2,5}\s?gb?\b(?:\s*(?:-|to|–)\s*\d{2,5}\s?gb?\b)+")
GPU_WORD_RE = re.compile(r"(?i)\b(gpu|graphics card|cuda|vram|a100|h100|rtx)\b")
CPU_ONLY_HINT_RE = re.compile(r"(?i)(no\s+gpu|gpu[- ]less|cpu[- ]only|without\s+(?:a\s+)?gpu)")
SKIP_DIR_PARTS = ("node_modules/", "/.git/", "dist/", "build/", ".next/", "__pycache__/", "vendor/")
TEXT_EXT = (".md", ".txt", ".yml", ".yaml", ".toml", ".py", ".sh", ".json", ".cfg", ".ini",
            ".ts", ".js", ".rs", ".go", ".dockerfile", "")
SKIP_NAMES = ("package-lock.json", "yarn.lock", "bun.lock", "poetry.lock", "Cargo.lock", "pnpm-lock.yaml")


def fetch_tarball(owner_repo: str):
    owner, repo = owner_repo.split("/")
    url = f"https://codeload.github.com/{owner}/{repo}/tar.gz/HEAD"
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=45) as r:
            return r.read()
    except Exception as e:
        return None


def walk_text_files(tf: tarfile.TarFile):
    for m in tf.getmembers():
        if not m.isfile() or m.size > 600_000:
            continue
        p = m.name
        if any(part in p for part in SKIP_DIR_PARTS):
            continue
        base = os.path.basename(p)
        if base in SKIP_NAMES:
            continue
        if not base.lower().endswith(TEXT_EXT) and "." in base:
            continue
        try:
            data = tf.extractfile(m).read()
        except Exception:
            continue
        try:
            yield p, data.decode("utf-8", errors="ignore")
        except Exception:
            continue


def scan_repo(target):
    nt, name, repo = target["netuid"], target["name"], target["repo"]
    m = re.match(r"https?://github\.com/([^/]+)/([^/#?]+)", repo or "")
    if not m:
        return {"netuid": nt, "name": name, "repo": repo, "error": "bad-repo-url", "files": []}
    owner, rname = m.group(1), m.group(2).removesuffix(".git")
    blob = fetch_tarball(f"{owner}/{rname}")
    if blob is None:
        return {"netuid": nt, "name": name, "repo": repo, "error": "download-failed", "files": []}
    hits = []
    try:
        tf = tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz")
        for path, text in walk_text_files(tf):
            short = re.sub(r"^[^/]+/", "", path)  # strip top-level versioned dir
            low = short.lower()
            lines = text.splitlines()
            file_hits = []
            for i, line in enumerate(lines):
                if len(line) > 240:
                    line = line[:240]
                # min_compute.yml handled wholesale below
                if GPU_MODEL_RE.search(line) and REQ_CONTEXT_RE.search(line):
                    file_hits.append({"line": line.strip(), "kind": "model+req"})
                elif VRAM_RE.search(line):
                    file_hits.append({"line": line.strip(), "kind": "vram"})
                elif GPU_MODEL_RE.search(line) and GPU_WORD_RE.search(lines[max(0, i - 1)]) if i else False:
                    file_hits.append({"line": line.strip(), "kind": "model+gpu-ctx"})
                elif RANGE_RE.search(line) and GPU_WORD_RE.search(line):
                    file_hits.append({"line": line.strip(), "kind": "range"})
            # dedupe by line, cap 8
            seen, dedup = set(), []
            for h in file_hits:
                if h["line"] not in seen:
                    seen.add(h["line"])
                    dedup.append(h)
            if dedup:
                hits.append({"file": short, "hits": dedup[:8]})
        tf.close()
    except Exception as e:
        return {"netuid": nt, "name": name, "repo": repo, "error": f"parse: {e}", "files": []}
    # priority sort: yml specs, docs, then code
    prio = {"min_compute": 0, "docs/": 1, "miner": 2, "readme": 3}
    hits.sort(key=lambda h: next((v for k, v in prio.items() if k in h["file"].lower()), 9))
    return {"netuid": nt, "name": name, "repo": repo, "error": None, "files": hits[:14]}


def main():
    results = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(scan_repo, t): t for t in TARGETS}
        for f in as_completed(futs):
            r = f.result()
            tag = "ERR:" + (r["error"] or "") if r["error"] else f"{len(r['files'])} files"
            print(f"SN{r['netuid']:>3} {r['name'][:24]:<24} {tag}")
            results.append(r)
    results.sort(key=lambda r: r["netuid"])
    json.dump(results, open(OUT, "w"), indent=1)
    with_hit = sum(1 for r in results if r["files"])
    print(f"\nscanned {len(results)} repos, {with_hit} with GPU evidence, OUT={OUT}")


if __name__ == "__main__":
    main()
