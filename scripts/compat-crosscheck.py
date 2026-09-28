#!/usr/bin/env python3
"""Cross-check compat-seed.ts tiers against the scraper's SubnetOverride GPU data.

Finds contradictions:
  A) seed says cpu-only  but scraper says a GPU is needed  (dangerous: user might not rent a GPU)
  B) seed says GPU/TEE   but scraper says CPU-only          (dangerous: user wastes money on a GPU)
"""
import re
import sqlite3

SEED = "/home/z/my-project/src/lib/infranex/compat-seed.ts"

src = open(SEED, encoding="utf-8").read()
# Entries look like:   32: { tier: "cpu-only", source: "inferred", note: "...",
seed = {}
for m in re.finditer(r'^\s*(\d+):\s*\{\s*tier:\s*"([a-z-]+)"', src, re.M):
    seed[int(m.group(1))] = m.group(2)
print(f"seed entries parsed: {len(seed)}")

con = sqlite3.connect("/home/z/my-project/db/custom.db")
cur = con.cursor()
rows = cur.execute(
    "SELECT netuid, minVramGb, recommendedGpu FROM SubnetOverride WHERE recommendedGpu IS NOT NULL"
).fetchall()

def scraper_needs_gpu(vram, rec):
    if rec is None:
        return None
    r = rec.lower()
    if "cpu-only" in r or "qpu" in r or r.startswith("none"):
        return False
    if vram is not None and vram > 0:
        return True
    if "gpu" in r or re.search(r"rtx|a100|h100|h200|b200|b300|l4|l40|a6000|a4000|5090|4090", r):
        return True
    return None

print("\n=== A) seed=cpu-only but scraper says GPU needed ===")
for netuid, vram, rec in sorted(rows):
    need = scraper_needs_gpu(vram, rec)
    st = seed.get(netuid)
    if need and st == "cpu-only":
        print(f"  SN{netuid}: seed=cpu-only | scraper: minVram={vram} rec={rec!r}")

print("\n=== B) seed=GPU-ish but scraper says CPU-only ===")
for netuid, vram, rec in sorted(rows):
    need = scraper_needs_gpu(vram, rec)
    st = seed.get(netuid)
    if need is False and st in ("gpu-flexible", "provider-friendly", "bare-metal-only", "tee-required"):
        print(f"  SN{netuid}: seed={st} | scraper: minVram={vram} rec={rec!r}")

print("\n=== C) seed=cpu-only entries with NO scraper row (unverified guesses) ===")
gpu_rows = {r[0] for r in rows}
for netuid, st in sorted(seed.items()):
    if st == "cpu-only" and netuid not in gpu_rows:
        print(f"  SN{netuid}")
