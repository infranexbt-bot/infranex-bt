#!/usr/bin/env python3
"""AUTH-AUDIT-1: for every Next.js API route, report which auth guard (if any) it uses.
Guards considered: requireActiveUserCookies, requireActiveAdmin, requireAgentAuth,
verifyAgentToken, requireDaemonAuth, verifyDaemonToken, or any custom token check
(headers.authorization / x-agent-token / bearer patterns).
"""
import os, re

ROOT = "/home/z/my-project/src/app/api"
GUARDS = [
    "requireActiveUserCookies",
    "requireActiveUserRequest",
    "requireActiveUser(",
    "requireActiveAdmin",
    "requireAgentAuth",
    "verifyAgentToken",
    "requireDaemonAuth",
    "verifyDaemonToken",
    "verifySessionToken",
    "requireSession",
]
TOKEN_PATTERNS = [
    r"authorization",
    r"x-agent-token",
    r"bearer",
    r"enrollment",
    r"agentKey",
    r"daemonKey",
    r"ENROLL",
    r"secret",
]

unauthed = []
for dirpath, _, files in os.walk(ROOT):
    for fn in files:
        if fn != "route.ts":
            continue
        p = os.path.join(dirpath, fn)
        rel = os.path.relpath(p, "/home/z/my-project")
        with open(p, "r", encoding="utf-8") as f:
            src = f.read()
        found = [g for g in GUARDS if g in src]
        toks = [t for t in TOKEN_PATTERNS if re.search(t, src, re.IGNORECASE)]
        methods = re.findall(r"export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)", src)
        status = "OK" if found else ("TOKEN?" if toks else "UNAUTHED")
        entry = (status, rel, methods, found, toks)
        if status == "UNAUTHED":
            unauthed.append(entry)
        else:
            print(f"{status:8} {rel}  methods={','.join(methods)}  guards={found or toks}")

print("\n=== NO GUARD FOUND (manual review needed) ===")
for status, rel, methods, found, toks in unauthed:
    print(f"{status:8} {rel}  methods={','.join(methods)}")
print(f"\nTotal unguarded: {len(unauthed)}")
