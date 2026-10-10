#!/usr/bin/env python3
"""DEADCODE-1: find files in src/ that are never imported by any other src/ file.
Reports: components, hooks, lib files with zero inbound imports.
Entry points (app/ pages, layouts, route.ts, middleware) are treated as roots.
"""
import os, re, json

SRC = "/home/z/my-project/src"

def basename_no_ext(path):
    return os.path.splitext(os.path.basename(path))[0]

def index_variants(path):
    # components/foo/index.tsx imports as components/foo
    d = os.path.dirname(path)
    return basename_no_ext(d) if os.path.basename(d) else None

candidates = []  # (path, module keys it could be imported by)
imports_text = []

for dirpath, _, files in os.walk(SRC):
    for fn in files:
        if not fn.endswith((".ts", ".tsx")):
            continue
        p = os.path.join(dirpath, fn)
        rel = os.path.relpath(p, SRC)
        with open(p, encoding="utf-8") as f:
            txt = f.read()
        imports_text.append((rel, txt))
        # skip entry points
        if rel.startswith("app/") and (fn in ("page.tsx", "layout.tsx", "providers.tsx", "not-found.tsx", "error.tsx") or fn == "route.ts"):
            continue
        if rel.startswith("app/") and "route.ts" in fn:
            continue
        candidates.append((rel, p))

def is_referenced(rel):
    base = basename_no_ext(rel)
    alias = "@/components/" + rel[len("components/"):] if rel.startswith("components/") else "@/lib/" + rel[len("lib/"):] if rel.startswith("lib/") else None
    alias = alias.replace(os.sep, "/") if alias else None
    idx_alias = None
    if alias and alias.endswith("/index"):
        idx_alias = alias[:-len("/index")]
    for _, txt in imports_text:
        if alias and (alias in txt or (idx_alias and idx_alias in txt)):
            # crude but effective: substring of an import path
            if re.search(r'from\s+["\']' + re.escape(alias), txt) or re.search(r'import\(["\']' + re.escape(alias), txt):
                return True
            if idx_alias and (re.search(r'from\s+["\']' + re.escape(idx_alias) + '["\']', txt)):
                return True
        # same-basename relative import
        if re.search(r'from\s+["\'][^"\']*\/' + re.escape(base) + r'["\']', txt):
            return True
        if re.search(r'from\s+["\']\./' + re.escape(base) + r'["\']', txt):
            return True
    return False

orphans = []
for rel, p in candidates:
    if rel == "lib/utils.ts" or rel == "lib/db.ts":
        continue
    if not is_referenced(rel):
        orphans.append(rel)

print("=== src/ files with ZERO inbound imports (candidates for dead code) ===")
for o in sorted(orphans):
    print(" ", o)
print(f"\nTotal: {len(orphans)} of {len(candidates)} non-entry files")
