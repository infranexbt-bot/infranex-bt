#!/usr/bin/env python3
"""Merge chain scan + taostats prices + recycle costs -> CPU miner earnings verdict."""
import json

TAO_USD = 305.0
BLOCKS_PER_DAY = 7200
MINER_SHARE = 0.41  # 18% owner / 41% miners / 41% validators+stakers

CPU_NAMES = {  # from compat-seed + known subnet names
    2: "DSperse", 5: "Hone", 6: "Numinous", 7: "Allways", 8: "Vanta", 11: "TrajectoryRL",
    13: "Data Universe", 15: "ORO", 18: "Zeus", 19: "blockmachine", 21: "AdTAO", 22: "Desearch",
    23: "Trishool", 25: "UR", 37: "Aurelius", 41: "Almanac", 43: "Graphite", 46: "Instant",
    48: "Quantum Compute", 50: "Synth", 52: "Dojo", 56: "Gradients", 60: "Bitsec.ai",
    61: "RedTeam", 62: "Ridges", 63: "Enigma", 65: "True Perf.", 66: "conjectures",
    67: "Harnyx", 69: "Herald", 71: "Leadpoet", 77: "Liquidity", 78: "Umi", 79: "MVTRX",
    83: "CliqueAI", 88: "Investing", 89: "InfiniteQuant", 93: "Bitcast", 98: "NeverPlayAlone",
    101: "Tag101", 104: "TAOstatus", 107: "Minos", 111: "Claims", 115: "MoirAI",
    119: "CapabilityForge", 121: "sundae_bar", 124: "Swarm", 127: "Astrid", 128: "ByteLeap",
}

scan = json.load(open('/home/z/my-project/scripts/cpu-scan-result.json'))
stats = json.load(open('/tmp/subnet_stats.json'))
recycle = json.load(open('/home/z/my-project/scripts/cpu-recycle.json'))

prices = {s['netuid']: float(s.get('price') or 0) for s in stats}
rows = []
for r in scan['results']:
    n = r['netuid']
    tao_in = r.get('taoInRao')
    pool_tao_day = (tao_in / 1e9) * BLOCKS_PER_DAY if tao_in is not None else 0.0
    miner_pool_day = pool_tao_day * MINER_SHARE
    price = prices.get(n, 0.0)
    entry = recycle.get(str(n)) or {}
    cost = (entry.get('recycleOrBurn') or entry.get('burn') or 0) / 1e9
    rows.append({
        'netuid': n, 'name': CPU_NAMES.get(n, f'SN{n}'),
        'alpha_usd': price * TAO_USD,
        'pool_tao_day': pool_tao_day,
        'pool_usd_day': pool_tao_day * TAO_USD,
        'miner_pool_usd_day': miner_pool_day * TAO_USD,
        'registered': r['registered'], 'earning': r['earningUids'],
        'entry_cost_tao': cost,
        'median_usd_day': r.get('earnP50', 0) * TAO_USD,
        'p90_usd_day': r.get('earnP90', 0) * TAO_USD,
        'top_usd_day': r.get('earnTop', 0) * TAO_USD,
        'open_slots': max(0, 256 - r['registered']) if r['registered'] > 0 else 0,
    })

rows.sort(key=lambda x: -x['pool_usd_day'])
total_pool = sum(r['pool_tao_day'] for r in rows)
total_usd = sum(r['pool_usd_day'] for r in rows)

print(f"=== ALL 49 CPU SUBNETS, LIVE CHAIN (block {scan['block']}) ===")
print(f"Total TAO/day flowing into CPU subnets: {total_pool:.1f} TAO (${total_usd:,.0f}/day)")
print(f"That is {total_pool/3600*100:.0f}% of the whole network's ~3,600 TAO/day\n")
hdr = f"{'SN':>4} {'name':16} {'a$':>7} {'pool$/day':>10} {'earn':>5} {'reg':>4} {'entryTAO':>8} {'med$/d':>8} {'p90$/d':>7} {'top$/d':>8}"
print(hdr)
for r in rows:
    print(f"{r['netuid']:>4} {r['name'][:16]:16} {r['alpha_usd']:7.2f} {r['pool_usd_day']:10.0f} {r['earning']:>5} {r['registered']:>4} {r['entry_cost_tao']:8.3f} {r['median_usd_day']:8.3f} {r['p90_usd_day']:7.3f} {r['top_usd_day']:8.2f}")

# grouping
worth = [r for r in rows if r['median_usd_day'] >= 0.5]
pennies = [r for r in rows if 0.01 <= r['median_usd_day'] < 0.5]
traps = [r for r in rows if r['median_usd_day'] < 0.01]
print(f"\nGroup A (median earner makes >= $0.50/day): {len(worth)} subnets")
print(f"Group B (median earner makes $0.01-0.50/day): {len(pennies)} subnets")
print(f"Group C (median earner makes < $0.01/day or 1-5 earning slots): {len(traps)} subnets")
json.dump(rows, open('/home/z/my-project/scripts/cpu-earnings-merged.json', 'w'), indent=1)
print("\nsaved -> scripts/cpu-earnings-merged.json")
