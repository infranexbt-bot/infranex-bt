import os
#!/usr/bin/env python3
"""Infranex BT — live engine health check.
Exercises every engine end-to-end and prints a green/red verdict table:
  1. Auth                       POST /api/auth/login
  2. 8 background workers       GET  /api/workers/status
  3. Chain intelligence         GET  /api/network
  4. Deployment engine          GET  /api/deployments
  5. DevOps engine payload      GET  /api/devops/monitor
  6. Autopilot rules store      GET  /api/autopilot/rules
  7. Ops Agent notes            GET  /api/devops/agent
  8. Monitor master pass (LIVE) POST /api/triggers {action:run}
  9. Autopilot pass (LIVE)      POST /api/autopilot/rules {action:run}
 10. Ops Agent LLM run (LIVE)   POST /api/devops/agent
"""
import json, time, urllib.request, urllib.error, http.cookiejar, sys

BASE = "http://localhost:3000"
JAR = http.cookiejar.CookieJar()
OPENER = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(JAR))
results = []

def call(name, method, path, body=None, timeout=90):
    t0 = time.time()
    try:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(BASE + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        with OPENER.open(req, timeout=timeout) as r:
            payload = json.loads(r.read().decode())
            ms = int((time.time() - t0) * 1000)
            results.append((name, "OK", ms, payload, None))
            return payload
    except urllib.error.HTTPError as e:
        ms = int((time.time() - t0) * 1000)
        try:
            payload = json.loads(e.read().decode())
        except Exception:
            payload = {}
        results.append((name, f"HTTP {e.code}", ms, payload, payload.get("error")))
        return payload
    except Exception as e:
        ms = int((time.time() - t0) * 1000)
        results.append((name, "FAIL", ms, {}, str(e)))
        return {}

# 1 ── auth
call("Auth / login", "POST", "/api/auth/login",
     {"userId": "admin", "code": os.environ.get("INFRANEX_ADMIN_CODE", "")})

# 2 ── workers
wk = call("Workers status", "GET", "/api/workers/status")

# 3 ── chain
net = call("Chain / network", "GET", "/api/network")

# 4 ── deployments
deps = call("Deployment engine", "GET", "/api/deployments")

# 5 ── devops monitor
mon = call("DevOps monitor", "GET", "/api/devops/monitor")

# 6 ── autopilot rules
ap = call("Autopilot rules", "GET", "/api/autopilot/rules")

# 7 ── ops agent notes
ag = call("Ops Agent notes", "GET", "/api/devops/agent")

# 8 ── LIVE master monitor pass (uid + devops + mindset + service passes)
call("Monitor master pass (LIVE)", "POST", "/api/triggers", {"action": "run"}, timeout=180)

# 9 ── LIVE autopilot pass
call("Autopilot pass (LIVE)", "POST", "/api/autopilot/rules", {"action": "run"}, timeout=120)

# 10 ── LIVE ops agent LLM run
call("Ops Agent LLM (LIVE)", "POST", "/api/devops/agent",
     {"question": "engine health check — summarize fleet posture"}, timeout=180)

# ────────────────────────── report ──────────────────────────
print("=" * 78)
print("INFRANEX BT — ENGINE HEALTH CHECK  (%s)" % time.strftime("%Y-%m-%d %H:%M:%S"))
print("=" * 78)
for name, status, ms, payload, err in results:
    print(f"{status:<8} {ms:>6}ms  {name}" + (f"  — {err}" if err and status != "OK" else ""))

print("\n" + "-" * 78)
w = wk.get("workers", []) if isinstance(wk, dict) else []
if w:
    print("WORKERS (8 background engines):")
    for x in w:
        last = x.get("lastRunAt") or x.get("lastAt") or "—"
        st = x.get("lastStatus") or x.get("status") or "?"
        extra = ""
        for k in ("lastError", "lastResult", "lastSummary"):
            if x.get(k):
                extra = f" | {x[k]}" if not isinstance(x[k], dict) else ""
                break
        print(f"  - {x.get('name', x.get('key', '?')):<14} {st:<8} last={last}{extra}")
snap = wk.get("latestSnapshot") or {}
if snap:
    print(f"  chain snapshot: block {snap.get('blockNumber')} · {snap.get('totalSubnets')} subnets · "
          f"{snap.get('neuronCount')} neurons · TAO ${snap.get('taoPriceUsd')} · src={snap.get('source')}")

print("\n" + "-" * 78)
d = (deps.get("deployments") or [None])[0] if isinstance(deps, dict) else None
if d:
    print(f"DEPLOYMENT ENGINE: {d['minerName']} status={d['status']} progress={d.get('progress')}% "
          f"install={d.get('installStatus')} mode={d.get('mode')}")
    steps = d.get("installSteps") or []
    print(f"  install steps recorded: {len(steps)} · provider pod {d.get('providerPodId')}")

print("\n" + "-" * 78)
s = mon.get("summary") or {}
print(f"DEVOPS ENGINE: monitored={s.get('monitored')} healthy={s.get('healthy')} "
      f"warning={s.get('warning')} critical={s.get('critical')} daemons={s.get('daemonsOnline')} "
      f"health={s.get('avgHealthScore')}/100")
m0 = (mon.get("miners") or [None])[0]
if m0:
    print(f"  miner {m0['minerName']}: daemon={m0['daemon']['status']} uid={m0.get('uid')} "
          f"alerts={[a['code'] for a in m0.get('alerts', [])]}")
    print(f"  autopilot: {len((mon.get('autopilot') or {}).get('rules', []))} rules · "
          f"{len((mon.get('autopilot') or {}).get('recentActions', []))} recent auto-actions")
    bm = (mon.get("benchmarks") or [None])[0]
    if bm:
        print(f"  benchmarks: runs={bm.get('runs')} baselineP50={bm.get('baselineP50Ms')} latest={bm.get('latest')}")

print("\n" + "-" * 78)
for name, status, ms, payload, err in results:
    if "LIVE" not in name:
        continue
    if "triggers" in name.lower() or "master" in name.lower():
        pass
print("LIVE PASS RESULTS:")
for name, status, ms, payload, err in results:
    if "LIVE" not in name:
        continue
    if "Monitor master" in name:
        p = payload.get("pass") or payload
        print(f"  master pass: {json.dumps(p)[:300]}")
    elif "Autopilot" in name:
        r = payload.get("result") or payload
        acted = r.get("acted", [])
        print(f"  autopilot: openEvents={r.get('openEvents')} acted={len(acted)} "
              f"skipped={len(r.get('skipped', []))}")
    elif "Ops Agent" in name:
        note = payload.get("note") or {}
        content = (note.get("content") or "")[:220].replace("\n", " | ")
        print(f"  ops agent: latencyMs={note.get('meta', {}).get('latencyMs')} → {content}")

ok = sum(1 for _, s, *_ in results if s == "OK")
print("\n" + "=" * 78)
print(f"VERDICT: {ok}/{len(results)} checks OK")
print("=" * 78)
