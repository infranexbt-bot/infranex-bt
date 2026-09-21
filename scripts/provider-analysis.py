#!/usr/bin/env python3
"""GPU provider analysis — extract platform data for the provider report.

Sources:
  1. db/custom.db (SQLite): Deployment + GpuSample telemetry history
  2. /api/gpu-offers via authenticated session (live market offers per provider)

Outputs JSON to tool-results/provider-data.json
"""
import json
import sqlite3
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone

DB = "/home/z/my-project/db/custom.db"
OUT = "/home/z/my-project/tool-results/provider-data.json"
BASE = "http://localhost:3000"

# ---------- 1. DB: deployments ----------
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()

deployments = []
for r in cur.execute(
    "SELECT id, minerName, netuid, subnetName, gpuModel, provider, status, mode,"
    " hourlyCost, monthlyCost, estimatedRevenue, projectedNetMonthlyUsd,"
    " createdAt, updatedAt, providerPodId, installStatus"
    " FROM Deployment ORDER BY createdAt"
):
    d = dict(r)
    d["ageHours"] = (
        (datetime.now(timezone.utc) - datetime.fromisoformat(d["createdAt"].replace("Z", "+00:00"))).total_seconds() / 3600
        if d["createdAt"] else None
    )
    deployments.append(d)

by_provider_deploys = defaultdict(list)
for d in deployments:
    by_provider_deploys[d["provider"]].append(d)

# ---------- 2. DB: GpuSample telemetry → runtime reliability ----------
# daemonStatus: "online" | "unreachable" | "missing" | "mock"
dep_provider = {d["id"]: d["provider"] for d in deployments}
samples_by_provider = defaultdict(lambda: {"total": 0, "online": 0, "unreachable": 0, "missing": 0, "mock": 0,
                                           "util": [], "temp": [], "per_dep": defaultdict(lambda: [0, 0])})
for r in cur.execute("SELECT deploymentId, daemonStatus, gpuUtilPct, tempC FROM GpuSample"):
    p = dep_provider.get(r["deploymentId"])
    if not p:
        continue
    s = samples_by_provider[p]
    st = r["daemonStatus"] or "missing"
    s["total"] += 1
    s[st if st in ("online", "unreachable", "missing", "mock") else "missing"] += 1
    per = s["per_dep"][r["deploymentId"]]
    per[0] += 1
    if st == "online":
        per[1] += 1
    if st == "online":
        if r["gpuUtilPct"] is not None:
            s["util"].append(r["gpuUtilPct"])
        if r["tempC"] is not None:
            s["temp"].append(r["tempC"])

provider_stats = {}
for p, deps in by_provider_deploys.items():
    tel = samples_by_provider.get(p, {"total": 0, "online": 0, "unreachable": 0, "missing": 0, "mock": 0, "util": [], "temp": [], "per_dep": {}})
    real_total = tel["total"] - tel["mock"]
    online_ratio = (tel["online"] / real_total * 100) if real_total else None
    dep_uptimes = []
    for dep_id, (tot, on) in tel["per_dep"].items():
        if tot - tel["mock"] > 0:
            dep_uptimes.append(on / (tot - tel["mock"]) * 100)
    running = [d for d in deps if d["status"] in ("running", "provisioning", "installed", "registering")]
    provider_stats[p] = {
        "deployments": len(deps),
        "deployments_by_status": dict(defaultdict(int, {st: sum(1 for d in deps if d["status"] == st) for st in {d["status"] for d in deps}})),
        "gpu_models": dict(defaultdict(int, {g: sum(1 for d in deps if d["gpuModel"] == g) for g in {d["gpuModel"] for d in deps}})),
        "avg_hourly_cost": round(sum(d["hourlyCost"] or 0 for d in deps) / len(deps), 3) if deps else None,
        "total_sample_count": tel["total"],
        "real_sample_count": real_total,
        "online_ratio_pct": round(online_ratio, 1) if online_ratio is not None else None,
        "per_deployment_uptime_pct": [round(u, 1) for u in sorted(dep_uptimes, reverse=True)][:20],
        "avg_util_pct": round(sum(tel["util"]) / len(tel["util"]), 1) if tel["util"] else None,
        "avg_temp_c": round(sum(tel["temp"]) / len(tel["temp"]), 1) if tel["temp"] else None,
        "running_now": len(running),
    }

# ---------- 3. Live GPU offers via authenticated API ----------
login = subprocess.run(
    ["curl", "-s", "-c", "/tmp/infranex-cookies.txt", BASE + "/api/auth/login",
     "-H", "Content-Type: application/json",
     "-d", '{"userId":"admin","code":"BRJ2-W2GT-WJNF-97VC"}', "--max-time", "15"],
    capture_output=True, text=True)
offers_raw = subprocess.run(
    ["curl", "-s", "-b", "/tmp/infranex-cookies.txt", BASE + "/api/gpu-offers?limit=200", "--max-time", "60"],
    capture_output=True, text=True)
try:
    offers = json.loads(offers_raw.stdout)
except Exception:
    offers = {"error": offers_raw.stdout[:300], "login": login.stdout[:200]}

# Summarize offers per provider (shape: model, provider, hourlyPrice, isSpot, _availabilityDetail)
offers_summary = {}
if isinstance(offers, dict) and "offers" in offers:
    off_list = offers["offers"]
elif isinstance(offers, list):
    off_list = offers
else:
    off_list = []
by_p = defaultdict(list)
for o in off_list:
    by_p[o.get("provider") or o.get("source") or "?"].append(o)
for p, rows in by_p.items():
    prices = [r["hourlyPrice"] for r in rows if isinstance(r.get("hourlyPrice"), (int, float))]
    models = {}
    for r in rows:
        det = r.get("_availabilityDetail") or {}
        models[r.get("model") or "?"] = {
            "vramGb": r.get("vramGb"),
            "hourlyPrice": r.get("hourlyPrice"),
            "monthlyPrice": r.get("monthlyPrice"),
            "isSpot": r.get("isSpot"),
            "total": det.get("total"),
            "available": det.get("available"),
        }
    offers_summary[p] = {
        "count": len(rows),
        "min_price": min(prices) if prices else None,
        "max_price": max(prices) if prices else None,
        "median_price": sorted(prices)[len(prices)//2] if prices else None,
        "gpus_total": sum(m["total"] or 0 for m in models.values()),
        "gpus_available": sum(m["available"] or 0 for m in models.values()),
        "models": models,
    }

result = {
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "provider_stats": provider_stats,
    "offers_api_keys": list(offers.keys()) if isinstance(offers, dict) else "list",
    "offers_summary": offers_summary,
    "offers_raw_sample": off_list[:3] if off_list else offers if isinstance(offers, dict) else None,
}
with open(OUT, "w") as f:
    json.dump(result, f, indent=2, default=str)
print(json.dumps({"providers": {p: {k: v for k, v in s.items() if k != "per_deployment_uptime_pct"} for p, s in provider_stats.items()},
                  "offers_summary_keys": {p: {k: v for k, v in s.items() if k != "models"} for p, s in offers_summary.items()}}, indent=2, default=str)[:3000])
