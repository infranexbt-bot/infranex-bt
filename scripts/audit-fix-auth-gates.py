#!/usr/bin/env python3
"""
AUDIT-SEC-2: add requireActiveUser gates to GET handlers that were only
protected by the edge proxy cookie check (no DB-backed revocation).
Idempotent: skips files/handlers already gated.
"""
import re, sys

FILES = [
    "src/app/api/cpu-offers/route.ts",
    "src/app/api/gpu-offers/route.ts",
    "src/app/api/judge/profiles/route.ts",
    "src/app/api/judge/runs/route.ts",
    "src/app/api/monitoring/route.ts",
    "src/app/api/network/route.ts",
    "src/app/api/subnet-overrides/route.ts",
    "src/app/api/subnets/[netuid]/metadata/route.ts",
    "src/app/api/subnets/odds-history/route.ts",
    "src/app/api/workers/status/route.ts",
    "src/app/api/devops/monitor/route.ts",
    "src/app/api/devops/subnet-options/route.ts",
    "src/app/api/devops/subnet-requirements/route.ts",
    "src/app/api/devops/wallet-registration/route.ts",
    "src/app/api/deployments/[id]/verify/route.ts",
    # GET handlers inside otherwise-gated files:
    "src/app/api/deployments/route.ts",
    "src/app/api/deployments/[id]/route.ts",
    "src/app/api/devops/hosts/route.ts",
    "src/app/api/devops/hosts/[id]/route.ts",
    "src/app/api/providers/keys/route.ts",
    "src/app/api/triggers/route.ts",
]

GATE_LINES = (
    '  // AUDIT-SEC-2: DB-backed session gate (revocation + active check),\n'
    '  // not just the edge-proxy cookie check.\n'
    '  const gate = await requireActiveUser(req);\n'
    '  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });\n'
)

changed, skipped = [], []
for path in FILES:
    try:
        s = open(path).read()
    except FileNotFoundError:
        skipped.append((path, "MISSING FILE")); continue

    m = re.search(r"export async function GET\s*\(([^)]*)\)", s)
    if not m:
        skipped.append((path, "no GET handler")); continue
    params = m.group(1)
    if not re.search(r"req\s*:\s*NextRequest", params):
        skipped.append((path, f"GET has no NextRequest param: ({params.strip()})")); continue

    # find the opening brace that ends the GET signature
    sig_end = m.end()
    brace = s.find("{", sig_end)
    # ensure brace belongs to this function (no other code between)
    between = s[sig_end:brace]
    if "\n" in between.strip() or "=>" in between:
        skipped.append((path, "unexpected signature shape")); continue
    insert_at = brace + 1

    # already gated right there?
    after = s[insert_at:insert_at + 400]
    if "requireActiveUser" in after or "requireActiveAdmin" in after:
        skipped.append((path, "already gated")); continue

    s = s[:insert_at] + "\n" + GATE_LINES.rstrip("\n") + "\n" + s[insert_at:]

    # imports
    if 'requireActiveUser' not in s.split('export async function GET')[0]:
        s = s.replace('import { NextRequest, NextResponse } from "next/server";',
                      'import { NextRequest, NextResponse } from "next/server";\nimport { requireActiveUser } from "@/lib/auth-admin";', 1)
        if 'requireActiveUser' not in s.split('export async function GET')[0]:
            # different import shape: insert after last import line
            lines = s.split("\n")
            last_import = max(i for i, l in enumerate(lines) if l.startswith("import "))
            lines.insert(last_import + 1, 'import { requireActiveUser } from "@/lib/auth-admin";')
            s = "\n".join(lines)
    if "NextResponse" not in s.split('export async function GET')[0]:
        s = s.replace('import { requireActiveUser } from "@/lib/auth-admin";',
                      'import { NextResponse } from "next/server";\nimport { requireActiveUser } from "@/lib/auth-admin";', 1)

    open(path, "w").write(s)
    changed.append(path)

print(f"changed {len(changed)}:")
for c in changed: print("  +", c)
print(f"skipped {len(skipped)}:")
for c, r in skipped: print("  -", c, "→", r)
