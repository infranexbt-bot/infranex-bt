#!/usr/bin/env python3
"""Classify all Bittensor subnets by GPU hosting requirements.

Merges the bulk README scan + recovered extras, applies classification rules,
and prints a full table sorted by emission. Writes tool-results/classified.json.
"""
import json
import re

OUT = "tool-results/classified.json"

# ---- load bulk report -------------------------------------------------------
rep = json.load(open("tool-results/readme-report.json"))

# ---- merge recovered extras into report entries ------------------------------
EXTRA_SCAN = {
    "64": "tool-results/readme-extra-64s.txt",   # chutes-miner (authoritative)
    "95": None, "97": "tool-results/readme-97.txt",
    "103": "tool-results/readme-extra-103.txt",
    "105": "tool-results/readme-extra-105.txt",
    "117": None, "120": "tool-results/readme-120.txt",
    "122": "tool-results/readme-extra-122.txt",
    "126": None, "39": None,
}

CATEGORIES = {
    "bare_metal": r"bare[\s\-_]?metal",
    "static_ip": r"static[\s\-_]?ip|dedicated[\s\-_]?ip|unique[\s\-_]?ip|1:1\s*(?:port|nat)|port[\s\-_]?forward|ip[\s\-_]?whitelist",
    "runpod": r"runpod",
    "vast": r"\bvast\.ai\b",
    "provider_ban": r"(?:not|no|won\s?.t|cannot|can\s?t|doesn\s?t)\s+(?:work|run|operate|be\s+(?:run|hosted|used)|support|allow(?:ed)?)\s[^.\n]{0,60}(?:runpod|vast|container|docker|cloud|shared)",
    "residential_ip": r"residential",
    "tee": r"\btee\b|confidential[\s\-]?(?:comput|ai|gpu)|\btdx\b|\bsgx\b|dstack|attestation|\bcc[\s\-]?mode",
    "docker": r"\bdocker\b|container(?:ized|s)?\b|kubernetes|\bk8s\b",
    "own_hardware": r"own\s+(?:hardware|server|machine|gpu|infra)|colocation|\bcolo\b|on[\s\-]?prem(?:ise)?|self[\s\-]host",
    "rental_mention": r"\brent(?:al|ed|ing)?\b",
    "gpu_model": r"\b(?:H100|H200|B200|B300|A100|H800|A6000|L40S?|RTX\s?4090|RTX\s?5090|RTX\s?PRO|3090|4090|5090)\b",
    "vram": r"\b\d{2,3}\s?GB\b",
    "cpu_only": r"cpu[\s\-]?only|no\s+gpu|without\s+(?:a\s+)?gpu|does\s+not\s+(?:require|need)\s+(?:a\s+)?gpu",
    "gpu_required": r"(?:requires?|needs?|must\s+(?:have|run))[^.\n]{0,40}\bGPU",
}


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


def merge_hits(base, extra):
    out = dict(base)
    for cat, lines in extra.items():
        if cat in out:
            merged = out[cat] + [l for l in lines if l not in out[cat]]
            out[cat] = merged[:6]
        else:
            out[cat] = lines
    return out


PARKED = re.compile(r"parked|for sale|available|unknown|deprecated|coming soon", re.I)
NOGPU_HINT = re.compile(r"agents?|search|data|social|trading|prediction|storage|map|dns|api", re.I)

entries = {}
for r in rep:
    n = str(r["netuid"])
    e = {"netuid": r["netuid"], "name": r["name"], "repo": r["repo"],
         "readme": r["readme"], "words": r["words"], "hits": r["hits"]}
    xp = EXTRA_SCAN.get(n)
    if xp:
        txt = open(xp).read()
        e["hits"] = merge_hits(e["hits"], scan_text(txt))
        e["words"] = max(e["words"], len(txt.split()))
        e["readme"] = e["readme"] or f"tarball:{xp}"
    entries[n] = e

registry = json.load(open("tool-results/subnet-registry-multi.json"))
for n, info in registry.items():
    e = entries.setdefault(n, {"netuid": int(n), "name": info["name"], "repo": None,
                               "readme": None, "words": 0, "hits": {}})
    e["name"] = info["name"] or e["name"]
    e["emission"] = info.get("emission") or 0
    e["miners"] = info.get("miners") or 0

# ---- classification ----------------------------------------------------------
for n, e in entries.items():
    h = e["hits"]
    name = (e["name"] or "").lower()
    if n == "0":
        e["cls"] = "ROOT"; e["why"] = "root subnet, not mineable"; continue
    if not e["repo"] and PARKED.search(name):
        e["cls"] = "PARKED"; e["why"] = "subnet parked/for-sale/inactive"; continue
    if not e["repo"]:
        e["cls"] = "NO_REPO"; e["why"] = "no public GitHub registered on-chain"; continue
    if e["words"] < 50:
        e["cls"] = "REPO_EMPTY"; e["why"] = "repo has no readable README"; continue
    bm = "bare_metal" in h
    tee = "tee" in h
    sip = "static_ip" in h or "residential_ip" in h
    ban = "provider_ban" in h
    if bm or (tee and sip) or ban:
        e["cls"] = "BARE_METAL_TEE"
        why = []
        if bm: why.append("bare metal stated")
        if ban: why.append("explicit provider restriction")
        if tee: why.append("TEE/confidential compute")
        if sip: why.append("static/dedicated IP")
        e["why"] = "; ".join(why)
    elif tee:
        e["cls"] = "TEE"
        e["why"] = "TEE/confidential compute mentioned (hardware constraints likely)"
    elif "docker" in h and ("runpod" in h or "vast" in h):
        e["cls"] = "PROVIDER_GUIDES"
        e["why"] = "README ships RunPod/Vast setup instructions"
    elif "cpu_only" in h and "gpu_model" not in h and "gpu_required" not in h:
        e["cls"] = "CPU"
        e["why"] = "README states CPU-only / no GPU"
    elif "gpu_model" in h or "gpu_required" in h or "vram" in h:
        e["cls"] = "GPU_FLEXIBLE"
        e["why"] = "GPU specs stated, no hosting restriction in README"
    elif "cpu_only" in h:
        e["cls"] = "CPU"
        e["why"] = "CPU-only signals"
    else:
        e["cls"] = "UNSPECIFIED"
        e["why"] = "README silent on GPU/hosting (light requirements or non-GPU task)"

# refine CPU for UNSPECIFIED using name heuristics only as note

# ---- inject resolved repos that bulk scan missed (org/profile URLs) -----------
INJECTED = {
    "103": ("Capcomp-AI/capability-composition-subnet", "tool-results/readme-extra-103.txt"),
    "105": ("Beam-Network/beam", "tool-results/readme-extra-105.txt"),
    "118": ("ditto-assistant/bittensor-pylon", "tool-results/readme-extra-118.txt"),
    "122": ("CookingTao/CookingTAO-Subnet", "tool-results/readme-extra-122.txt"),
}
for n, (repo, fn) in INJECTED.items():
    e = entries.get(n)
    if not e:
        continue
    e["repo"] = repo
    txt = open(fn).read()
    e["hits"] = merge_hits(e["hits"], scan_text(txt))
    e["words"] = max(e["words"], len(txt.split()))
    e["readme"] = e["readme"] or f"tarball:{fn}"

# ---- refine with GPU mention counts from raw text ----------------------------
try:
    raw = json.load(open("tool-results/readme-raw.json"))
    mentions = json.load(open("tool-results/gpu-mention-summary.json"))
    for nid, s in mentions.items():
        e = entries.get(str(nid))
        if not e:
            continue
        e["gpu_mentions"] = s["gpu_mentions"]
        if e["cls"] in ("UNSPECIFIED", "CPU"):
            if s["gpu_mentions"] >= 4:
                e["cls"] = "GPU_FLEXIBLE_INFERRED"
                e["why"] = f"no stated restriction; {s['gpu_mentions']} GPU refs in README -> GPU subnet, providers allowed"
            elif s["gpu_mentions"] == 0 and e["cls"] == "UNSPECIFIED":
                e["cls"] = "LIKELY_NON_GPU"
                e["why"] = "no GPU mention in README -> CPU/API/data task likely"
except Exception:
    pass

# ---- curated corrections: known GPU subnets whose README is silent -----------
CORRECTIONS = {
    "1": ("GPU_FLEXIBLE_INFERRED", "Apex physics/RL competition sims; README silent on hosting -> no stated ban (manual)"),
    "3": ("GPU_FLEXIBLE_INFERRED", "Teutonic RL training subnet; README silent -> no stated ban (manual)"),
    "8": ("GPU_FLEXIBLE_INFERRED", "Vanta audio ML; README silent -> no stated ban (manual)"),
    "44": ("GPU_FLEXIBLE_INFERRED", "Score Vision miners run vision models; README silent -> no stated ban (manual)"),
    "56": ("GPU_FLEXIBLE", "Gradients LLM training via Docker; no hosting restriction found"),
    "61": ("GPU_FLEXIBLE_INFERRED", "RedTeam runs LLM attacks; README silent -> no stated ban (manual)"),
    "80": ("GPU_FLEXIBLE_INFERRED", "OpenRoboto VLA robotics models; README silent -> no stated ban (manual)"),
    "83": ("GPU_FLEXIBLE_INFERRED", "CliqueAI LLM math solving; README silent -> no stated ban (manual)"),
    "85": ("GPU_FLEXIBLE_INFERRED", "Vidaio video upscaling GPUs; README silent -> no stated ban (manual)"),
    "95": ("GPU_FLEXIBLE_INFERRED", "Actual: repo unreachable; requirements live in subnet Discord -> no stated ban found"),
    "120": ("GPU_FLEXIBLE_INFERRED", "Affine Docker-based RL; docs silent on hosting -> community runs on rented clouds (manual)"),
    "24": ("GPU_FLEXIBLE_INFERRED", "Quasar LLM workloads; README silent -> no stated ban (manual)"),
}
for n, (c, why) in CORRECTIONS.items():
    e = entries.get(n)
    if e and e["cls"] in ("UNSPECIFIED", "REPO_EMPTY", "LIKELY_NON_GPU"):
        e["cls"] = c
        e["why"] = why

json.dump(list(entries.values()), open(OUT, "w"), indent=1)

# ---- print sorted table -------------------------------------------------------
rows = sorted(entries.values(), key=lambda e: -(e.get("emission") or 0))
order = {"BARE_METAL_TEE": 0, "TEE": 1, "PROVIDER_GUIDES": 2, "GPU_FLEXIBLE": 3,
         "CPU": 4, "UNSPECIFIED": 5, "NO_REPO": 6, "PARKED": 7, "REPO_EMPTY": 8, "ROOT": 9}
counts = {}
for e in rows:
    counts[e["cls"]] = counts.get(e["cls"], 0) + 1
print("CLASS COUNTS:", json.dumps(counts))
print()
for e in rows:
    print(f"{e['netuid']:>3} {e['cls']:<14} em={e.get('emission') or 0:>7.1f} "
          f"{(e['name'] or '?')[:20]:20} {e['why'][:70]}")
