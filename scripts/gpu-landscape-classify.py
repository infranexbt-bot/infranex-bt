#!/usr/bin/env python3
"""
gpu-landscape-classify.py — Task: gpu-landscape-page
Classify every GPU-relevant SubnetOverride row into the 4 user categories:
  A) Consumer RTX class  — 3090/4090/5090 (24–32 GB)
  B) Pro / workstation   — A6000, L40S, RTX PRO 6000 (48–96 GB)
  C) Datacenter class    — A100 / H100 / H200 / B200 / B300
  D) Special cases       — mixed lists, flexible wording, TEE, banned, CPU-only
Outputs the classification JSON (same logic the API route will use in TS)
so we can eyeball it before wiring the UI.
"""
import sqlite3, json, re

db = sqlite3.connect("/home/z/my-project/db/custom.db")
db.row_factory = sqlite3.Row

seed_src = open("/home/z/my-project/src/lib/infranex/compat-seed.ts").read()
tiers = {}
for m in re.finditer(r'(\d+):\s*\{\s*tier:\s*"([a-z-]+)"', seed_src):
    tiers[int(m.group(1))] = m.group(2)

# --- GPU model taxonomy -------------------------------------------------
CONSUMER = re.compile(r'\b(3090|3090 Ti|4090|5090|GeForce|4080|5080|4070)\b', re.I)
PRO      = re.compile(r'\b(A6000|L40S|L40|RTX PRO 6000|RTX 6000 Ada|RTX 5000|A5000|A4000)\b', re.I)
DC       = re.compile(r'\b(A100|H100|H200|B200|B300|GB200|H20|A800|H800|MI300X|MI325X|V100|T4|L4)\b', re.I)
VRAM_FLOOR = re.compile(r'(?:>=?\s*|≥\s*|at least\s*)(\d{1,2})\s*GB', re.I)

rows = db.execute("""
  SELECT netuid, name, minVramGb, recommendedGpu, gpuCount,
         hostingRequirements
  FROM SubnetOverride ORDER BY netuid""").fetchall()

snap = db.execute("SELECT subnetsJson, blockNumber, taoPriceUsd FROM ChainSnapshot ORDER BY createdAt DESC LIMIT 1").fetchone()
subs = {s["netuid"]: s for s in json.loads(snap["subnetsJson"])} if snap else {}

A, B, C, D = [], [], [], []   # consumer, pro, datacenter, special

for r in rows:
    gpu = (r["recommendedGpu"] or "").strip()
    flags = {}
    if r["hostingRequirements"]:
        try: flags = json.loads(r["hostingRequirements"])
        except Exception: pass
    s = subs.get(r["netuid"], {})
    rec = {
        "netuid": r["netuid"],
        "name": r["name"],
        "gpu": gpu,
        "vram": r["minVramGb"],
        "count": r["gpuCount"],
        "tier": tiers.get(r["netuid"], "unknown"),
        "tee": bool(flags.get("teeRequired")),
        "bareMetal": bool(flags.get("bareMetalOnly")),
        "staticIp": bool(flags.get("staticIpRequired")),
        "miners": s.get("minersCount"),
        "emissionTaoPerDay": s.get("minerEmissionTaoPerDay"),
        "movingPrice": s.get("movingPrice"),
    }
    low = gpu.lower()
    is_cpu_only = low.find("cpu-only") >= 0 or (r["minVramGb"] == 0 and not gpu)
    has_consumer = bool(CONSUMER.search(gpu))
    has_pro = bool(PRO.search(gpu))
    has_dc = bool(DC.search(gpu))

    if is_cpu_only:
        rec["why"] = "CPU-only workload — GPU not used"
        D.append(rec); continue
    if "excluded" in low:
        rec["why"] = "GPU explicitly excluded/banned (e.g. 5090 ban)"
        D.append(rec); continue
    # classify by strongest mention
    if has_consumer and not (has_dc or has_pro):
        A.append(rec); continue
    if has_pro and not has_dc:
        B.append(rec); continue
    if has_dc and not (has_consumer or has_pro):
        C.append(rec); continue
    if has_consumer and has_pro and not has_dc:
        rec["why"] = "Mixed consumer+pro list"
        D.append(rec); continue
    if (has_dc and has_consumer) or (has_dc and has_pro):
        rec["why"] = "Mixed datacenter+consumer/pro list"
        D.append(rec); continue
    # no named model — fall back to VRAM floor
    floor = None
    m = VRAM_FLOOR.search(gpu)
    if m: floor = int(m.group(1))
    elif r["minVramGb"]: floor = r["minVramGb"]
    if floor is None:
        rec["why"] = "Flexible/ambiguous GPU wording"
        D.append(rec); continue
    if floor <= 24:
        rec["why"] = f"VRAM floor {floor} GB ≤ 24 → any consumer card fits"
        A.append(rec); continue
    if floor <= 32:
        rec["why"] = f"VRAM floor {floor} GB ≤ 32 → 4090/5090 fit"
        A.append(rec); continue
    if floor <= 48:
        rec["why"] = f"VRAM floor {floor} GB → pro-class needed"
        B.append(rec); continue
    rec["why"] = f"VRAM floor {floor} GB > 48 → datacenter-class needed"
    C.append(rec)

def show(title, lst):
    print(f"\n=== {title} ({len(lst)}) ===")
    for x in sorted(lst, key=lambda z: z["netuid"]):
        em = x["emissionTaoPerDay"]
        em_s = f"{em:.3f}" if isinstance(em, (int, float)) else "?"
        print(f"SN{x['netuid']:<3} {x['name']:<22} vram>={x['vram'] if x['vram'] is not None else '?':<3} x{x['count'] or 1} "
              f"em/day={em_s:<7} miners={x['miners'] or '?':<4} | {x['gpu'][:70]}")

show("A) CONSUMER RTX (3090/4090/5090, 24-32 GB)", A)
show("B) PRO / WORKSTATION (A6000, L40S, RTX PRO 6000, 48-96 GB)", B)
show("C) DATACENTER (A100/H100/H200/B200/B300)", C)
show("D) SPECIAL CASES", D)
print(f"\nsnapshot: block={snap['blockNumber'] if snap else '?'} tao=${snap['taoPriceUsd'] if snap else '?'}")
print(f"totals: A={len(A)} B={len(B)} C={len(C)} D={len(D)}")
