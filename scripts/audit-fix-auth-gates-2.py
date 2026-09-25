#!/usr/bin/env python3
"""
AUDIT-SEC-2 (v2): gate the remaining GET handlers whose signatures are
either (), (req: Request), or (_req: Request, ctx...).
Idempotent.
"""
import re

# path -> ("cookies" | "plain", param_name or None)
TARGETS = {
    "src/app/api/cpu-offers/route.ts": ("cookies", None),
    "src/app/api/gpu-offers/route.ts": ("cookies", None),
    "src/app/api/monitoring/route.ts": ("cookies", None),
    "src/app/api/network/route.ts": ("cookies", None),
    "src/app/api/subnet-overrides/route.ts": ("cookies", None),
    "src/app/api/subnets/odds-history/route.ts": ("plain", "request"),
    "src/app/api/workers/status/route.ts": ("cookies", None),
    "src/app/api/devops/monitor/route.ts": ("cookies", None),
    "src/app/api/devops/subnet-options/route.ts": ("cookies", None),
    "src/app/api/devops/subnet-requirements/route.ts": ("plain", "req"),
    "src/app/api/deployments/[id]/route.ts": ("plain", "_req"),
    "src/app/api/devops/hosts/route.ts": ("cookies", None),
    "src/app/api/devops/hosts/[id]/route.ts": ("plain", "_req"),
    "src/app/api/providers/keys/route.ts": ("cookies", None),
    "src/app/api/triggers/route.ts": ("cookies", None),
}

GATE = '  // AUDIT-SEC-2: DB-backed session gate (revocation + active check),\n  // not just the edge-proxy cookie check.\n'

changed, skipped = [], []
for path, (kind, pname) in TARGETS.items():
    try:
        s = open(path).read()
    except FileNotFoundError:
        skipped.append((path, "MISSING")); continue

    m = re.search(r"export async function GET\s*\(([^)]*)\)", s, re.S)
    if not m:
        skipped.append((path, "no GET")); continue
    sig_end = m.end()
    brace = s.find("{", sig_end)
    insert_at = brace + 1
    after = s[insert_at:insert_at + 500]
    if "requireActive" in after:
        skipped.append((path, "already gated")); continue

    if kind == "cookies":
        lines = (
            GATE
            + "  const gate = await requireActiveUserCookies();\n"
            + '  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });\n'
        )
        needed_import = 'requireActiveUserCookies'
    else:
        lines = (
            GATE
            + f"  const gate = await requireActiveUserRequest({pname});\n"
            + '  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });\n'
        )
        needed_import = 'requireActiveUserRequest'

    s = s[:insert_at] + "\n" + lines.rstrip("\n") + "\n" + s[insert_at:]

    # add import if missing from the whole pre-GET region
    head = s.split("export async function GET")[0]
    if needed_import not in head:
        imp = f'import {{ {needed_import} }} from "@/lib/auth-admin";'
        if 'import { NextRequest, NextResponse } from "next/server";' in head:
            s = s.replace('import { NextRequest, NextResponse } from "next/server";',
                          'import { NextRequest, NextResponse } from "next/server";\n' + imp, 1)
        else:
            lines2 = s.split("\n")
            last_import = max(i for i, l in enumerate(lines2) if l.startswith("import "))
            lines2.insert(last_import + 1, imp)
            s = "\n".join(lines2)

    open(path, "w").write(s)
    changed.append(path)

print(f"changed {len(changed)}:")
for c in changed: print("  +", c)
print(f"skipped {len(skipped)}:")
for c, r in skipped: print("  -", c, "→", r)
