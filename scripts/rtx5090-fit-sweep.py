#!/usr/bin/env python3
"""
rtx5090-fit-sweep.py — Task: rtx5090-subnet-pick
Classify every SubnetOverride row: can a standard/OC RTX 5090 (32 GB,
consumer Blackwell, e.g. ASUS TUF / MSI Gaming Trio) be the miner GPU?

Rules (in order):
  CPU-ONLY      — no GPU needed, 5090 irrelevant
  EXCLUDED      — 5090 explicitly banned (SN44)
  DATACENTER    — requires cards a 5090 cannot stand in for (>32 GB/card,
                  or datacenter-only model lists without a consumer branch)
  TEE-FLAG      — GPU fits but hosting needs TDX/SEV-SNP attestation
                  (unrealistic for a home/consumer rig)
  FIT           — 5090 explicitly named, or generic >=16/24 GB consumer-OK
  MAYBE         — gpu-flexible with ambiguous model wording (README check)
"""
import sqlite3, json, re

db = sqlite3.connect("/home/z/my-project/db/custom.db")
db.row_factory = sqlite3.Row

# compat-seed tiers
seed_src = open("/home/z/my-project/src/lib/infranex/compat-seed.ts").read()
tiers = {}
for m in re.finditer(r'(\d+):\s*\{\s*tier:\s*"([a-z-]+)"', seed_src):
    tiers[int(m.group(1))] = m.group(2)

DC_ONLY = re.compile(
    r'\b(H100|H200|H20|B200|B300|GB200|A100|A800|H800|MI300X|MI325X|L40S|L40|A6000|RTX PRO 6000|RTX 6000 Ada|V100|T4|L4)\b', re.I)
NAMED_5090 = re.compile(r'5090', re.I)
CONSUMER_OK = re.compile(r'(RTX\s*(4090|5090|3090)|4090/5090|GeForce)', re.I)
VRAM_FLOOR = re.compile(r'(?:>=?\s*|≥\s*|at least\s*)(\d{1,2})\s*GB', re.I)

rows = db.execute("""
  SELECT netuid, name, minVramGb, recommendedGpu, gpuCount,
         hostingRequirements, mechanicsJson
  FROM SubnetOverride ORDER BY netuid""").fetchall()

fit, maybe, tee_flag, excluded, datacenter, cpunoly = [], [], [], [], [], []

for r in rows:
    gpu = r["recommendedGpu"] or ""
    flags = {}
    if r["hostingRequirements"]:
        try: flags = json.loads(r["hostingRequirements"])
        except Exception: pass
    rec = {
        "netuid": r["netuid"], "name": (r["name"] or "")[:24],
        "gpu": gpu[:80], "vram": r["minVramGb"], "count": r["gpuCount"],
        "tier": tiers.get(r["netuid"], "?"),
        "tee": bool(flags.get("teeRequired")), "bm": bool(flags.get("bareMetalOnly")),
        "sip": bool(flags.get("staticIpRequired")),
    }
    if gpu.lower().find("cpu-only") >= 0 or (r["minVramGb"] == 0 and not gpu):
        cpunoly.append(rec); continue
    if "excluded" in gpu.lower() and re.search(r'5090[^)]*excluded|excluded[^)]*5090', gpu, re.I):
        excluded.append(rec); continue
    if NAMED_5090.search(gpu):
        fit.append(rec); continue
    if CONSUMER_OK.search(gpu):
        fit.append(rec); continue
    # per-card VRAM floor: 5090 = 32 GB
    floor = None
    m = VRAM_FLOOR.search(gpu)
    if m: floor = int(m.group(1))
    elif r["minVramGb"]: floor = r["minVramGb"]
    if DC_ONLY.search(gpu) and not CONSUMER_OK.search(gpu):
        # datacenter-only wording; 5090 can substitute only if floor <= 32 AND wording allows
        if floor is not None and floor <= 32 and re.search(r'(or|fallback|works?|e\.g\.)', gpu, re.I):
            fit.append(rec)
        else:
            datacenter.append(rec)
        continue
    if floor is not None and floor <= 32:
        fit.append(rec); continue
    if floor is not None and floor > 32:
        datacenter.append(rec); continue
    maybe.append(rec)

def show(title, lst):
    print(f"\n=== {title} ({len(lst)}) ===")
    for x in sorted(lst, key=lambda z: z["netuid"]):
        t = f"tee={'Y' if x['tee'] else '-'}{'/bm' if x['bm'] else ''}{'/sip' if x['sip'] else ''}"
        print(f"SN{x['netuid']:<3} {x['name']:<24} tier={x['tier']:<16} vram>={x['vram']} x{x['count']} | {t:<8} | {x['gpu']}")

show("FIT (5090 named or consumer-OK / floor <= 32 GB)", fit)
show("MAYBE (ambiguous wording — README check needed)", maybe)
show("TEE-FLAG would apply to these only if they were FIT", tee_flag)
show("EXCLUDED (5090 banned)", excluded)
show("DATACENTER-ONLY (needs >32 GB/card or DC-only list)", datacenter)
show("CPU-ONLY (GPU not used)", cpunoly)

# live metrics for FIT/MAYBE candidates from latest ChainSnapshot
snap = db.execute("SELECT subnetsJson FROM ChainSnapshot ORDER BY createdAt DESC LIMIT 1").fetchone()
print(f"\n=== Live snapshot available: {bool(snap)} ===")
if snap:
    subs = json.loads(snap["subnetsJson"])
    keys = set()
    if subs and isinstance(subs[0], dict): keys = set(subs[0].keys())
    print("snapshot row keys:", sorted(keys)[:20])
    ids = {x["netuid"] for x in fit + maybe}
    for s in subs:
        nid = s.get("netuid")
        if nid in ids:
            print(f"SN{nid}: emission={s.get('emission')} price={s.get('price')} "
                  f"stake={s.get('stake')} neurons={s.get('neuronCount')}")
