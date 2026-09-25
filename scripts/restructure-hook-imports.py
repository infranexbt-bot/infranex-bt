#!/usr/bin/env python3
"""Rewrite relative imports inside the 17 hooks moved from src/lib/infranex/ to src/hooks/.

Mapping (from src/lib/infranex/X.ts to src/hooks/X.ts):
  "./use-Y"        -> "./use-Y"          (hook-to-hook: same dir after move)
  "./Y"            -> "../lib/infranex/Y" (lib sibling)
  anything else (../, @/) -> hard fail (census says none exist; if one appears it needs a manual decision)
"""
import re
import pathlib
import sys

HOOKS = [
    "use-cpu-offers", "use-deployments", "use-devops-monitor", "use-error-log",
    "use-gpu-offers", "use-health-checks", "use-local-hosts", "use-monitoring",
    "use-network", "use-odds", "use-platform", "use-profitability",
    "use-stake-portfolio", "use-subnet-overrides", "use-triggers", "use-trust",
    "use-worker-status",
]

pat = re.compile(r'(from\s*)(["\'])((?:\.\./|\./)[^"\']*)\2')


def fix(m: re.Match) -> str:
    kw, q, spec = m.group(1), m.group(2), m.group(3)
    if spec.startswith("./use-"):
        return f"{kw}{q}{spec}{q}"
    if spec.startswith("./"):
        return f'{kw}{q}../lib/infranex/{spec[2:]}{q}'
    print(f"FATAL: unexpected ../ import: {spec}")
    sys.exit(1)


base = pathlib.Path("src/hooks")
changed = 0
for h in HOOKS:
    p = base / f"{h}.ts"
    if not p.exists():
        print(f"FATAL: missing {p}")
        sys.exit(1)
    t = p.read_text()
    t2 = pat.sub(fix, t)
    if t2 != t:
        p.write_text(t2)
        changed += 1
        print(f"patched {p.name} ({len(pat.findall(t))} relative imports)")
    else:
        print(f"ok      {p.name} (no relative imports)")
print(f"\n{changed}/{len(HOOKS)} files patched")
