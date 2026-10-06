#!/usr/bin/env python3
"""
gpu-category-dive.py — Task: gpu-category-dive (2026-10-06)
Dump every GPU-bearing subnet grouped by GPU CLASS, with live economics.

Categories:
  consumer  — RTX 3090/4090/5090 class (24-32 GB), consumer GeForce
  pro       — workstation/pro accelerators: A6000, RTX PRO 6000, L40S/L4/L40
  datacenter — A100/H100/H200/B200/B300 (40 GB+ per card)
  mixed     — lists span more than one class (flagship recommended, consumer allowed)
"""
import sqlite3, json, re

db = sqlite3.connect("/home/z/my-project/db/custom.db")
db.row_factory = sqlite3.Row

# live metrics
snap = db.execute("SELECT subnetsJson FROM ChainSnapshot ORDER BY createdAt DESC LIMIT 1").fetchone()
live = {}
if snap:
    for s in json.loads(snap["subnetsJson"]):
        live[s.get("netuid")] = s

CONSUMER = re.compile(r'\b(RTX\s*(?:30|40|50)\s?90|GTX|GeForce|5090|4090|3090)\b', re.I)
PRO = re.compile(r'\b(A6000|RTX PRO 6000|PRO 6000|L40S|L40|L4\b|RTX 6000 Ada|6000 Ada)\b', re.I)
DC = re.compile(r'\b(A100|H100|H200|H20|B200|B300|GB200|MI300X|MI325X)\b', re.I)

rows = db.execute("""
  SELECT netuid, name, minVramGb, recommendedGpu, gpuCount, hostingRequirements
  FROM SubnetOverride ORDER BY netuid""").fetchall()

cats = {"consumer": [], "pro": [], "datacenter": [], "mixed": [], "special": []}
for r in rows:
    gpu = r["recommendedGpu"] or ""
    if not gpu or gpu.strip().lower().startswith(("none", "—")) or "CPU-only" in gpu:
        continue
    flags = {}
    if r["hostingRequirements"]:
        try: flags = json.loads(r["hostingRequirements"])
        except Exception: pass
    l = live.get(r["netuid"], {})
    mepd = l.get("minerEmissionTaoPerDay") or 0
    price = l.get("movingPrice") or l.get("emaMovingPrice") or 0
    rec = {
        "nid": r["netuid"], "name": (r["name"] or "")[:22], "gpu": gpu[:95],
        "vram": r["minVramGb"], "n": r["gpuCount"],
        "tee": bool(flags.get("teeRequired")), "bm": bool(flags.get("bareMetalOnly")),
        "sip": bool(flags.get("staticIpRequired")),
        "pool": mepd * price, "tao_d": mepd, "alpha": price,
        "miners": l.get("minersCount"),
    }
    c, p, d = bool(CONSUMER.search(gpu)), bool(PRO.search(gpu)), bool(DC.search(gpu))
    if c and (p or d): cats["mixed"].append(rec)
    elif c: cats["consumer"].append(rec)
    elif p and d: cats["mixed"].append(rec)
    elif p: cats["pro"].append(rec)
    elif d: cats["datacenter"].append(rec)
    else: cats["special"].append(rec)

def show(title, lst):
    print(f"\n=== {title} ({len(lst)}) ===")
    for x in sorted(lst, key=lambda z: -(z["pool"] or 0)):
        t = ("TEE" if x["tee"] else "") + ("+BM" if x["bm"] else "") + ("+SIP" if x["sip"] else "") or "-"
        pool = f"${x['pool']:.0f}/d" if x["pool"] else "?"
        print(f"SN{x['nid']:<4}{x['name']:<23}{t:<9}pool={pool:<9}{x['n'] or 1}x {x['gpu']}")

for k in ("consumer", "pro", "datacenter", "mixed", "special"):
    show(k.upper(), cats[k])
