"""CPU-mining earning analysis: join curated seed (hardware classification)
with live chain snapshot (emissions, miners, prices) and rank CPU subnets.

Outputs: per-subnet table + scenario math + verdict inputs.
"""
import json, re

SNAP = "/tmp/network-snap.json"
SEED = "/home/z/my-project/src/lib/infranex/subnet-jobs-seed.ts"

snap = json.load(open(SNAP))
TAO = snap["taoPriceUsd"]

# ---- parse seed entries -------------------------------------------------
src = open(SEED).read()
body = src[src.find("SUBNET_JOBS_SEED"):]
# split entries on  N: {  ... next N: {
starts = [m.start() for m in re.finditer(r"(?m)^\s{2}(\d+):\s*\{", body)]
entries = {}
for idx, s in enumerate(starts):
    end = starts[idx + 1] if idx + 1 < len(starts) else len(body)
    chunk = body[s:end]
    uid = int(re.search(r"^\s{2}(\d+):", chunk).group(1))

    def field(name):
        m = re.search(name + r':\s*"((?:[^"\\]|\\.)*)"', chunk)
        return m.group(1).replace('\\"', '"') if m else ""

    entries[uid] = {
        "name": field("name"),
        "category": field("category"),
        "work": field("minerWorkType"),
        "does": field("whatMinerDoes"),
        "reward": field("rewardBasis"),
        "confidence": field("confidence"),
    }
print(f"seed entries: {len(entries)}")

# ---- classify CPU-viable ------------------------------------------------
def cpu_class(e):
    txt = (e["work"] + " " + e["does"]).lower()
    if "n/a" in e["work"] or "root" in e["work"] or "nothing" in e["does"]:
        return "no"
    gpu_required = ("gpu required" in txt or "8+ gb-vram gpu" in txt
                    or "gpu with" in txt or "requires a gpu" in txt
                    or "24gb" in txt.replace(" ", "") or "gpu-heavy" in txt)
    cpu_lead = txt.startswith("cpu") or "cpu-only" in txt or "cpu compute" in txt \
        or "cpu scraping" in txt or "(cpu)" in txt or "no gpu required" in txt \
        or "cpu-only" in txt or "runs on cpu" in txt or "cpu-friendly" in txt
    if "cpu" in txt and not gpu_required:
        return "cpu" if cpu_lead else "cpu-maybe"
    if not gpu_required and ("api" in txt or "storage" in txt or "llm" in txt):
        return "non-gpu-service"
    return "gpu"

classes = {}
for uid, e in entries.items():
    classes[uid] = cpu_class(e)

from collections import Counter
print("classification:", Counter(classes.values()))

# ---- join with live metrics --------------------------------------------
rows = []
for s in snap["subnets"]:
    uid = s["netuid"]
    if uid not in entries or classes.get(uid) not in ("cpu", "cpu-maybe"):
        continue
    c = classes[uid]
    miners = s["minersCount"] or 0
    rewarded = s["rewardedMiners"] or 0
    miner_emis = s["minerEmissionTaoPerDay"] or 0.0
    med_ratio = s["incentiveMedianShare"] or 0.0  # median/mean of earning UIDs (capped 1.2)
    mean_rewarded = miner_emis / rewarded if rewarded else (miner_emis / miners if miners else 0)
    median_day = mean_rewarded * med_ratio if med_ratio else mean_rewarded
    top10pct_n = max(1, int(miners * 0.1)) if miners else 1
    top10_avg = (miner_emis * (s["top10IncentiveShare"] or 0) / top10pct_n) if s["top10IncentiveShare"] else 0
    saturated = miner_emis / miners if miners else 0  # if all 256 slots earned evenly
    rows.append({
        "netuid": uid,
        "name": entries[uid]["name"] or f"SN{uid}",
        "cls": c,
        "work": entries[uid]["work"][:60],
        "miners": miners,
        "rewarded": rewarded,
        "minerEmissionTaoDay": round(miner_emis, 3),
        "alphaPrice": round(s["movingPrice"] or 0, 4),
        "alphaChg24h": round((s["alphaPriceChange24h"] or 0) * 100, 1),
        "satTaoDay": round(saturated, 4),
        "medianTaoDay": round(median_day, 4),
        "topTaoDay": round(top10_avg, 4),
        "burnTao": round(s["burnCostTao"] or 0, 2),
        "medianUsdDay": round(median_day * TAO, 2),
        "topUsdDay": round(top10_avg * TAO, 2),
        "satUsdDay": round(saturated * TAO, 2),
        "alphaPriceUsd": round((s["movingPrice"] or 0) * TAO, 3),
    })

rows.sort(key=lambda r: -r["medianTaoDay"])
print(f"\nCPU-viable subnets with live data: {len(rows)} (TAO=${TAO})")
hdr = f"{'SN':>4} {'name':<22} {'cls':<10} {'miners':>6} {'rew':>4} {'poolT/d':>8} {'a$':>7} {'med$/d':>7} {'sat$/d':>6} {'top10%$/d':>9} {'burnTao':>7} {'a24h%':>6}"
print(hdr)
for r in rows:
    print(f"{r['netuid']:>4} {r['name'][:22]:<22} {r['cls']:<10} {r['miners']:>6} {r['rewarded']:>4} {r['minerEmissionTaoDay']:>8} {r['alphaPriceUsd']:>7} {r['medianUsdDay']:>7} {r['satUsdDay']:>6} {r['topUsdDay']:>9} {r['burnTao']:>7} {r['alphaChg24h']:>6}")

# ---- GPU comparison (top GPU subnets by median) -------------------------
gpu_rows = []
for s in snap["subnets"]:
    uid = s["netuid"]
    if uid not in entries or classes.get(uid) != "gpu":
        continue
    miners = s["minersCount"] or 0
    me = s["minerEmissionTaoPerDay"] or 0
    rew = s["rewardedMiners"] or 0
    mr = s["incentiveMedianShare"] or 0
    mean_r = me / rew if rew else (me / miners if miners else 0)
    med = mean_r * mr if mr else mean_r
    gpu_rows.append((uid, entries[uid]["name"][:20], miners, rew, round(med * TAO, 2)))
gpu_rows.sort(key=lambda x: -x[4])
print("\nTop-10 GPU subnets (median miner $/day) for comparison:")
for g in gpu_rows[:10]:
    print(f"  SN{g[0]:>3} {g[1]:<20} miners={g[2]:>4} rewarded={g[3]:>4} med=${g[4]}/d")

# sanity: total network TAO-equivalent emission/day
tot = sum((s.get('emissionTaoPerDay') or 0) for s in snap['subnets'])
print(f"\nsanity: sum emissionTaoPerDay across {len(snap['subnets'])} subnets = {tot:,.0f} TAO/d = ${tot*TAO:,.0f}/d")

json.dump(rows, open("/home/z/my-project/scripts/cpu-earnings-rows.json", "w"), indent=1)
print("\nsaved -> scripts/cpu-earnings-rows.json")
