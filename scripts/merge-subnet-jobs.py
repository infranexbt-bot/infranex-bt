#!/usr/bin/env python3
"""
subnet-info-1 (final): merge synthesis batches + live chain stats + hosting notes
→ download/subnet-miner-jobs.csv
"""
import json, csv, sqlite3, os, re

BASE = "/home/z/my-project"
SYN = os.path.join(BASE, "scripts", "subnet-info-synth")
EXT = os.path.join(BASE, "scripts", "subnet-info-extracts")
OUT = os.path.join(BASE, "download", "subnet-miner-jobs.csv")
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# 1) merge batches
rows = []
for b in (1, 2, 3, 4):
    rows.extend(json.load(open(os.path.join(SYN, f"batch-{b}.json"))))
by_netuid = {r["netuid"]: r for r in rows}
assert len(by_netuid) == 129, f"expected 129 unique netuids, got {len(by_netuid)}"

# 2) live chain stats + overrides
con = sqlite3.connect(os.path.join(BASE, "db", "custom.db"))
cur = con.cursor()
snap = json.loads(cur.execute(
    "SELECT subnetsJson FROM ChainSnapshot ORDER BY createdAt DESC LIMIT 1").fetchone()[0])
chain = {s["netuid"]: s for s in snap}
tao_price = cur.execute(
    "SELECT taoPriceUsd FROM ChainSnapshot ORDER BY createdAt DESC LIMIT 1").fetchone()[0]
ov = {r[0]: r[1] for r in cur.execute(
    "SELECT netuid, requirementsSource FROM SubnetOverride").fetchall()}

# hosting verdict from compat seed (bare-metal / tee etc.) — pull notes summary from extract headers
def hosting_note(netuid):
    p = os.path.join(EXT, f"{netuid}.md")
    if not os.path.exists(p):
        return ""
    m = re.search(r"- known hosting notes: (.*)", open(p).read(3000))
    return m.group(1).strip() if m else ""

def fmt(x, nd=2):
    if x is None:
        return ""
    try:
        return round(float(x), nd)
    except Exception:
        return ""

COLS = [
    "netuid", "name", "category", "minerWorkType",
    "whatItDoes", "whatMinerDoes", "whatValidatorDoes", "rewardBasis",
    "minerEmissionTaoPerDay", "emissionPerRewardingMinerTao",
    "emissionPerRewardingMinerUsdPerDay", "minersCount", "rewardedMiners",
    "alphaPriceUsd", "taoPriceUsd",
    "confidence", "source", "githubUrl", "hostingNotes",
]

with open(OUT, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=COLS)
    w.writeheader()
    for n in sorted(by_netuid):
        r = by_netuid[n]
        s = chain.get(n, {})
        em = s.get("minerEmissionTaoPerDay") or 0
        rewarded = s.get("rewardedMiners") or 0
        per_miner = (em / rewarded) if rewarded > 0 else 0
        w.writerow({
            "netuid": n,
            "name": r.get("name") or s.get("name") or f"Subnet {n}",
            "category": r.get("category", ""),
            "minerWorkType": r.get("minerWorkType", ""),
            "whatItDoes": r.get("whatItDoes", ""),
            "whatMinerDoes": r.get("whatMinerDoes", ""),
            "whatValidatorDoes": r.get("whatValidatorDoes", ""),
            "rewardBasis": r.get("rewardBasis", ""),
            "minerEmissionTaoPerDay": fmt(em, 2),
            "emissionPerRewardingMinerTao": fmt(per_miner, 2),
            "emissionPerRewardingMinerUsdPerDay": fmt(per_miner * tao_price, 0),
            "minersCount": s.get("minersCount", ""),
            "rewardedMiners": rewarded,
            "alphaPriceUsd": fmt(s.get("movingPrice"), 4),
            "taoPriceUsd": fmt(tao_price, 2),
            "confidence": r.get("confidence", ""),
            "source": r.get("source", ""),
            "githubUrl": ov.get(n) or s.get("identityGithub") or "",
            "hostingNotes": hosting_note(n)[:600],
        })

# quick stats for the summary
from collections import Counter
cats = Counter(by_netuid[n].get("category", "?") for n in by_netuid)
confs = Counter(by_netuid[n].get("confidence", "?") for n in by_netuid)
print("CSV written:", OUT)
print("\nconfidence:", dict(confs))
print("\ncategories:")
for c, k in cats.most_common():
    print(f"  {k:>3}  {c}")
# top-10 by emission per rewarding miner
top = sorted(chain.items(), key=lambda kv: -(kv[1].get("minerEmissionTaoPerDay") or 0) / max(kv[1].get("rewardedMiners") or 1, 1))[:12]
print("\ntop by TAO/day per rewarded miner:")
for n, s in top:
    rw = s.get("rewardedMiners") or 0
    em = (s.get("minerEmissionTaoPerDay") or 0) / max(rw, 1)
    print(f"  {n:>3} {by_netuid[n].get('name','?')[:24]:<24} {em:8.2f} TAO/d/miner  ({rw} rewarded)")
