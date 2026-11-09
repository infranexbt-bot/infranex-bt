#!/usr/bin/env python3
"""Sanity-run of the GPU Buy Decision math against the live DB.

Mirrors what src/lib/infranex/gpu-decision.ts will compute:
  - canonical GPU token catalog (vram, class, TEE, price, power, rent)
  - eligibility: named-token match OR (vram floor + class), TEE gate,
    gpuCount awareness, landscape-override respect
  - per (card, subnet): per-earning TAO/day, capex, power, net/mo, payback
"""
import json, sqlite3, statistics, sys

DB = "/home/z/my-project/db/custom.db"
KWH = 0.12
MEDIAN_FACTOR = 0.35   # mean-vs-median: top earners skew the mean ~3x
BOOST = 1.0            # skillBoost on P(earning) — you vs the average miner
TARGET_TAO_MO = 2.0

# card catalog: token -> (vram, cls, tee, price_used, price_new, tdp_W, vast_hr)
CARDS = {
    #                vram  cls   tee          used    new   tdp  vast$/hr
    "H100":        (80,  "dc", "yes", 18000, 28000, 700, 2.50),
    "H200":        (141, "dc", "yes", 28000, 34000, 700, 5.70),
    "B200":        (192, "dc", "yes", 48000, 48000, 1000, 8.19),
    "A100":        (80,  "dc", "no",   6500, 11000, 400, 0.90),
    "RTX Pro 6000":(96,  "pro", "unverified", 12000, 16000, 600, 1.55),
    "RTX 6000 Ada":(48,  "pro", "no",   5500,  6800, 300, 0.95),
    "RTX A6000":   (48,  "pro", "no",   3200,  4600, 300, 0.75),
    "L40S":        (48,  "pro", "no",   6500,  8000, 350, 0.95),
    "RTX 5090":    (32,  "con", "no",   6200,  6900, 575, 1.20),
    "RTX 4090":    (24,  "con", "no",   1800,  2300, 450, 0.50),
    "RTX 3090":    (24,  "con", "no",    700,   950, 350, 0.32),
    "L4":          (24,  "pro", "no",   2800,  3600,  72, 0.45),
    "A10":         (24,  "dc",  "no",   1800,  2800, 150, 0.45),
    "GTX 1660":    (6,   "con", "no",    120,   200, 120, 0.10),
}

# family equivalences: requirement token -> card tokens that satisfy it
FAMILY = {
    "H800/A800": {"H100", "A100"},   # china variants ≈ H100/A100 class
    "A6000 Ada": {"RTX 6000 Ada"},
    "RTX A6000": {"RTX A6000"},
}

CLS_RANK = {"con": 0, "pro": 1, "dc": 2}
TOKENS = list(CARDS.keys()) + ["GH200", "B300", "MI300X", "MI325X", "H20", "A40", "L40"]

import re
def esc(s): return re.escape(s).replace(r"\ ", r"\s+")
TOKEN_RE = {t: re.compile(r"\b(?:" + "|".join(esc(a) for a in t.split("/")) + r")\b", re.I) for t in TOKENS}
FLOOR_RE = re.compile(r"(?:>=?\s*|≥\s*|at least\s*|>\s*)(\d{1,3})\s*GB", re.I)
CPU_RE = re.compile(r"cpu-only|no\s*gpu|\bqpu\b|quantum", re.I)
BAN_RE = re.compile(r"excluded|banned|not\s*(?:allowed|supported|accepted)", re.I)

def tokens_in(text):
    if not text: return []
    return [t for t in TOKENS if TOKEN_RE[t].search(text)]

con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
ov = {r["netuid"]: dict(r) for r in con.execute(
    "SELECT netuid, name, recommendedGpu, minVramGb, gpuCount, hostingRequirements FROM SubnetOverride")}
snap = con.execute("SELECT * FROM ChainSnapshot ORDER BY createdAt DESC LIMIT 1").fetchone()
live = {int(s["netuid"]): s for s in json.loads(snap["subnetsJson"]) if isinstance(s.get("netuid"), int)}
tao = snap["taoPriceUsd"]

def special_of(row):
    gpu = (row.get("recommendedGpu") or "").strip()
    floor = row.get("minVramGb")
    if CPU_RE.search(gpu): return "cpu"
    if not gpu and floor == 0: return "cpu"
    if not gpu and not floor: return "unverified"
    if BAN_RE.search(gpu): return "banned"
    return None

def floor_of(row):
    gpu = row.get("recommendedGpu") or ""
    m = FLOOR_RE.search(gpu)
    return int(m.group(1)) if m else (row.get("minVramGb") or None)

def can_mine(card_tok, row):
    """-> (ok, reason, tee_blocked, node_scale)"""
    gpu = (row.get("recommendedGpu") or "").strip()
    sp = special_of(row)
    if sp: return (False, sp, False, False)
    req_toks = tokens_in(gpu)
    floor = floor_of(row)
    vram, cls, tee, *_ = CARDS[card_tok]
    try:
        host = json.loads(row.get("hostingRequirements") or "{}")
    except Exception:
        host = {}
    tee_req = host.get("teeRequired") is True
    count = row.get("gpuCount") or 1
    if tee_req and tee != "yes":
        return (False, "tee", True, count > 1)
    if req_toks:
        ok = False
        for rt in req_toks:
            fam = FAMILY.get(rt, {rt})
            if card_tok in fam:
                ok = True
            # RTX 6000 Ada / A6000 Ada family cross
            if card_tok == "RTX 6000 Ada" and rt in ("A6000 Ada",): ok = True
        if ok and vram >= (floor or 0):
            return (True, "named", False, count > 1)
        if ok:
            return (False, f"vram{floor}", False, count > 1)
        return (False, "named-other", False, count > 1)
    if floor:
        need = 2 if floor > 96 else (1 if floor > 32 else 0)
        if vram >= floor and CLS_RANK[cls] >= need:
            return (True, "floor", False, count > 1)
        return (False, "floor", False, count > 1)
    return (False, "unspecified", False, count > 1)

report = {}
for card in CARDS:
    entries = []
    for netuid, row in sorted(ov.items()):
        s = live.get(netuid, {})
        ok, why, tee_bl, node = can_mine(card, row)
        if not ok: continue
        em = s.get("minerEmissionTaoPerDay")
        rew = s.get("rewardedMiners"); reg = s.get("minersCount")
        rz = s.get("rewardRealizability"); rzu = rz if (rz and rz > 0) else 1.0
        rew_ratio = (rew / reg) if (rew is not None and reg and reg > 0) else None
        # mean over today's EARNING miners (what the average rewarded UID gets)
        mean_earner = (em * rzu / rew) if (em and em > 0 and rew and rew > 0) else None
        # EV for a NEW entrant, two factors (both slider-adjustable in the UI):
        #   P(earning at all) ≈ rewardedRatio × skillBoost  — with rew% at
        #     1.6% the median registered miner earns ZERO, so pool/reg is a
        #     lottery ticket, not an income.
        #   payout if you DO earn ≈ pool × rz ÷ (rew+1) × medianFactor —
        #     your UID dilutes the earning pool by one, and you land near the
        #     reward median, not the top-10% mean that pulls the average up.
        rew_ratio_b = min(0.9, (rew_ratio or 0) * BOOST) if rew_ratio is not None else None
        entrant = (rew_ratio_b * em * rzu / (rew + 1) * MEDIAN_FACTOR) \
            if (em and em > 0 and rew and rew > 0 and rew_ratio_b) else None
        vram, cls, tee, pu, pn, tdp, vast = CARDS[card]
        count = max(1, row.get("gpuCount") or 1)
        capex = pu * count
        entrant_mo_usd = (entrant or 0) * 30 * tao
        power_mo = tdp / 1000 * 720 * KWH * count
        rent_mo = vast * 720 * count
        entries.append({
            "netuid": netuid, "name": row.get("name") or f"SN{netuid}",
            "gpu": (row.get("recommendedGpu") or "")[:60], "count": count,
            "pool": round(em or 0, 2), "rew": rew, "reg": reg,
            "rew_ratio": round(rew_ratio, 3) if rew_ratio else None,
            "mean_earner": round(mean_earner, 2) if mean_earner else None,
            "entrant": round(entrant, 2) if entrant else None,
            "entrant_mo": round(entrant_mo_usd), "net_mo": round(entrant_mo_usd - power_mo),
            "capex": capex, "payback": round(capex / (entrant_mo_usd - power_mo), 1) if entrant_mo_usd - power_mo > 0 else None,
            "rent_mo": round(rent_mo), "rent_margin": round(entrant_mo_usd - power_mo - rent_mo),
            "node": node, "why": why,
        })
    ranked = sorted([e for e in entries if e["entrant"]], key=lambda e: -e["net_mo"])
    report[card] = ranked

print(f"TAO ${tao}  medianFactor {MEDIAN_FACTOR}  target {TARGET_TAO_MO} TAO/mo\n")
order = sorted(report.items(), key=lambda kv: -(kv[1][0]["net_mo"] if kv[1] else -1))
for card, es in order:
    if not es:
        print(f"{card:15s} — no eligible subnets with rewards"); continue
    e = es[0]
    tao_mo = (e["entrant"] or 0) * 30
    print(f"{card:15s} best SN{e['netuid']:3d} {e['name'][:22]:22s} entrant={e['entrant']:6.2f} TAO/d  "
          f"rew%={e['rew_ratio']} net ${e['net_mo']:6,}/mo  capex ${e['capex']:7,}  payback {e['payback'] if e['payback'] else '—':>6}mo  "
          f"rentmo ${e['rent_mo']:5,} margin ${e['rent_margin']:6,}  | eligible={len(es)} pools={sum(x['pool'] for x in es):7.1f} TAO/d  2TAO@50%: {'YES' if tao_mo>=2 else 'no (%.1f)' % tao_mo}")
print("\n--- top 3 subnets per shortlisted card ---")
for card in ("H100", "RTX Pro 6000", "A100", "RTX 4090", "RTX 5090", "RTX A6000"):
    es = report.get(card) or []
    print(f"\n{card}:")
    for e in es[:3]:
        print(f"  SN{e['netuid']:<3d} {e['name'][:26]:26s} gpu='{e['gpu'][:40]:40s}' x{e['count']} pool={e['pool']:7.1f} reg={e['reg']} rew={e['rew']} entrant={e['entrant']} net=${e['net_mo']:,}/mo payback={e['payback']}")
