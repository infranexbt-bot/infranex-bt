#!/usr/bin/env python3
"""Check scraped hosting requirements for top GPU mining targets in infranex DB."""
import json
import sqlite3

conn = sqlite3.connect("/home/z/my-project/db/custom.db")
conn.row_factory = sqlite3.Row
cur = conn.cursor()

TOP_TARGETS = [5, 41, 123, 61, 67]

print("=== TOP GPU MINING TARGETS ===")
for netuid in TOP_TARGETS:
    row = cur.execute(
        "SELECT netuid, name, recommendedGpu, minVramGb, gpuCount, hostingRequirements, mechanicsJson "
        "FROM subnetOverride WHERE netuid = ?",
        (netuid,),
    ).fetchone()
    if row is None:
        print(f"SN{netuid}: (no scraped override)")
        continue
    hosting = json.loads(row["hostingRequirements"]) if row["hostingRequirements"] else None
    mech = json.loads(row["mechanicsJson"]) if row["mechanicsJson"] else None
    print(f"SN{row['netuid']} {row['name']}: gpu={row['recommendedGpu']} vram={row['minVramGb']}GB x{row['gpuCount']}")
    if hosting:
        print(f"   bareMetalOnly={hosting.get('bareMetalOnly')} teeRequired={hosting.get('teeRequired')} "
              f"staticIp={hosting.get('staticIpRequired')}")
        for note in (hosting.get("notes") or [])[:2]:
            print(f"   evidence: {note[:130]}")
    else:
        print("   hosting: not scraped")
    if mech:
        print(f"   mechanics subnetType={mech.get('subnetType')} workType={mech.get('workType')}")

print()
print("=== ALL BARE-METAL-FLAGGED SUBNETS IN DB ===")
rows = cur.execute(
    "SELECT netuid, name, hostingRequirements FROM subnetOverride "
    "WHERE hostingRequirements LIKE '%\"bareMetalOnly\":true%' OR hostingRequirements LIKE '%\"bareMetalOnly\": true%'"
).fetchall()
if not rows:
    print("(none flagged bare metal among scraped subnets)")
for r in rows:
    print(f"SN{r['netuid']} {r['name']}")

print()
total = cur.execute("SELECT COUNT(*) FROM subnetOverride WHERE hostingRequirements IS NOT NULL").fetchone()[0]
print(f"=== {total} subnets have scraped hosting requirements ===")
conn.close()
