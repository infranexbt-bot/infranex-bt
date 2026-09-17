#!/usr/bin/env python3
"""MOCK-PURGE-2 — strip fabricated datasets from src/lib/infranex/data.ts.

Removes (fabricated product-facing mock data):
  - gpuOffers (o1..o14 synthetic marketplace offers)
  - userMiners (fake portfolio m1..m5 with invented earnings/rank/uptime)
  - deployments (fake deployments d1..d3 with invented costs/progress)
  - revenueSeries (Math.random revenue history)
  - emissionShares + EMISSION_COLORS (static emission distribution)
  - workers (fake system worker statuses)

Keeps (legit reference/fallback data):
  - subnets (curated catalog: scraping seed + live-merge base)
  - opportunities (documented offline fallback base for mergeOpportunities)
  - gpuModels, gpuProviders (hardware spec reference + provider filter list)
"""
import re, sys

PATH = "/home/z/my-project/infranex-bt/src/lib/infranex/data.ts"
src = open(PATH).read()
orig_len = len(src)

# 1) Drop the fabricated type imports (keep Subnet, Opportunity, OpportunityFactor, GPUModel).
src = src.replace(
    """import type {
  Subnet,
  Opportunity,
  OpportunityFactor,
  UserMiner,
  GPUModel,
  GPUOffer,
  Deployment,
  RevenuePoint,
  EmissionShare,
  WorkerStatus,
} from "./types";""",
    """import type {
  Subnet,
  Opportunity,
  OpportunityFactor,
  GPUModel,
} from "./types";""",
    1,
)

# 2) Remove the gpuOffers block (from its comment banner to the banner before "User miners").
start = src.index("// ---------------------------------------------------------------------------\n// User miners (portfolio)")
gpu_start = src.rindex("// ---------------------------------------------------------------------------", 0, start - 2)
# include the blank lines between the gpuOffers block end and the User miners banner
src = src[:gpu_start] + src[start:]

# 3) Truncate everything from the "User miners (portfolio)" banner to EOF.
start = src.index("// ---------------------------------------------------------------------------\n// User miners (portfolio)")
src = src[:start].rstrip() + "\n"

open(PATH, "w").write(src)
print(f"data.ts: {orig_len} -> {len(src)} bytes")

# sanity: no fabricated identifiers remain
leftover = [w for w in ["userMiners", "revenueSeries", "emissionShares", "gpuOffers", "WorkerStatus"] if re.search(rf"\b{w}\b", src)]
print("leftover fake identifiers:", leftover or "NONE")
if leftover:
    sys.exit(1)
