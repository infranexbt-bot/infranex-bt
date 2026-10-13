#!/usr/bin/env python3
"""Extract SubnetAlpha.ai directory (from saved page_reader HTML) with corrected
netuid pairing, and cross-check against Infranex BT's SubnetOverride table.

Pairing rule (verified by two anchors): each entry's "Subnet N" badge renders at
the END of the preceding segment, i.e. segment k's trailing badge belongs to
entry k+1. Anchors: "It's AI" description self-identifies as Subnet 32; the
bare "Subnet 82" slot matches our own finding that SN82 chain identity is null.
"""
import json, re, sqlite3

# ---- load saved HTML ----
d = json.load(open('/tmp/subnetalpha.json'))
html = d.get('data', d).get('html', '')

parts = re.split(r'<h1[^>]*>', html)[1:]
raw = []
for p in parts:
    head = re.sub(r'<[^>]+>', '\n', p)
    lines = [l.strip() for l in head.split('\n') if l.strip()]
    if not lines:
        continue
    name = lines[0]
    chrome = {'VIEW PROFILE', 'View Directory', 'Read More', 'Learn more'}
    desc = ''
    badge = None  # trailing "Subnet N" badge in THIS segment
    for l in lines[1:]:
        m = re.match(r'^Subnet\s+(\d+)$', l)
        if m:
            badge = int(m.group(1))
        elif l not in chrome and len(l) > 40 and not desc:
            desc = l
    raw.append({'name': name, 'badge_in_segment': badge, 'desc': desc})

# corrected pairing: entry k's netuid = badge found in segment k-1
entries = []
for i, e in enumerate(raw):
    netuid = raw[i - 1]['badge_in_segment'] if i > 0 else None
    entries.append({'name': e['name'], 'netuid': netuid, 'description': e['desc']})

# drop the page-title pseudo entry ("Bittensor Subnet Directory")
entries = [e for e in entries if e['name'] not in ('Bittensor Subnet Directory',)]
print(f'SubnetAlpha entries: {len(entries)}')
labeled = [e for e in entries if e['netuid'] is not None]
print(f'with corrected netuid: {len(labeled)}')

# ---- sanity anchors ----
for want in ("It’s AI", "It's AI", "Subnet 82", "Reliquary"):
    for e in entries:
        if e['name'] == want:
            print(f"anchor: {e['name']!r} -> netuid {e['netuid']} | {e['description'][:60]}")

# ---- cross-check vs our SubnetOverride table ----
con = sqlite3.connect('/home/z/my-project/db/custom.db')
ours = {r[0]: r for r in con.execute(
    "SELECT netuid, name, description, category FROM SubnetOverride")}
print(f'\nOur SubnetOverride rows: {len(ours)}')

match, diff, missing = 0, [], []
for e in labeled:
    nu = e['netuid']
    if nu in ours:
        ours_name = (ours[nu][1] or '').strip().lower()
        sa_name = e['name'].strip().lower()
        if ours_name and sa_name and (sa_name in ours_name or ours_name in sa_name):
            match += 1
        else:
            diff.append((nu, ours[nu][1], e['name']))
    else:
        missing.append((nu, e['name'], e['description'][:80]))

print(f'name matches: {match}')
print(f'name diffs: {len(diff)}')
for nu, a, b in diff[:12]:
    print(f'  SN{nu}: ours={a!r} | subnetalpha={b!r}')
print(f'netuids SubnetAlpha has that we lack: {len(missing)}')
for nu, n, desc in missing[:15]:
    print(f'  SN{nu}: {n} | {desc}')

# ---- save the extracted directory for reuse ----
out = {'source': 'subnetalpha.ai/#directory', 'extractedAt': '2026-10-14',
       'count': len(entries), 'entries': entries}
with open('/home/z/my-project/tool-results/subnetalpha-directory.json', 'w') as f:
    json.dump(out, f, indent=2, ensure_ascii=False)
print('\nsaved -> tool-results/subnetalpha-directory.json')

# ---- SN32 focus ----
print('\n--- SN32 (pending deep-dive target) ---')
for e in entries:
    if e['netuid'] == 32:
        print(json.dumps(e, indent=2, ensure_ascii=False))
