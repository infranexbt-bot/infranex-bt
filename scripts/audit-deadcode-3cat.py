#!/usr/bin/env python3
"""Three-category audit scanner: dead exports, security patterns, AI mistakes."""
import os, re, json, subprocess, sys

ROOT = "/home/z/my-project"
SRC = os.path.join(ROOT, "src")

# ---------- collect files ----------
ts_files = []
for dirpath, dirs, files in os.walk(SRC):
    dirs[:] = [d for d in dirs if d not in ("node_modules", ".next")]
    for f in files:
        if f.endswith((".ts", ".tsx")):
            ts_files.append(os.path.join(dirpath, f))

all_src = {}
for p in ts_files:
    try:
        all_src[p] = open(p, encoding="utf-8").read()
    except Exception:
        pass

# ---------- 1. DEAD CODE: exported symbols never referenced elsewhere ----------
print("=" * 70)
print("1. DEAD CODE — exported symbols with zero external references")
print("=" * 70)
dead = []
export_re = re.compile(
    r"^export\s+(?:async\s+)?(function|const|class|type|interface)\s+([A-Za-z0-9_]+)",
    re.M,
)
for path, text in all_src.items():
    if "/app/api/" in path:
        continue  # Next.js routes are entry points
    for m in export_re.finditer(text):
        kind, name = m.groups()
        if name in ("GET", "POST", "PUT", "PATCH", "DELETE", "dynamic", "revalidate", "metadata"):
            continue
        uses = 0
        for p2, t2 in all_src.items():
            if p2 == path:
                continue
                # count references in other files
            if re.search(r"\b" + re.escape(name) + r"\b", t2):
                uses += 1
        if uses == 0:
            # used inside its own file (besides export decl)?
            body_refs = len(re.findall(r"\b" + re.escape(name) + r"\b", text)) - 1
            rel = os.path.relpath(path, ROOT)
            dead.append((rel, kind, name, body_refs))

for rel, kind, name, body in sorted(dead):
    tag = "FILE-INTERNAL-ONLY" if body > 0 else "NEVER-USED-ANYWHERE"
    print(f"  {rel}: export {kind} {name}  [{tag}]")
print(f"  -> {len(dead)} candidates")

# ---------- orphan component files (never imported) ----------
print("\n--- orphan files (components/lib never imported by anyone) ---")
orphans = []
for path in all_src:
    rel = os.path.relpath(path, ROOT)
    if "/app/" in path or path.endswith(("route.ts", "page.tsx", "layout.tsx")):
        continue
    base = os.path.splitext(os.path.basename(path))[0]
    # index files re-export folder
    if base == "index":
        continue
    imp_re = re.compile(r"""from\s+["'@/.\w-]*""" + re.escape(base) + r"""["']""")
    hits = sum(1 for p2, t2 in all_src.items() if p2 != path and imp_re.search(t2))
    if hits == 0:
        # also check scripts/ dir
        orphans.append(rel)
for o in sorted(orphans):
    print(f"  ORPHAN: {o}")
print(f"  -> {len(orphans)} orphan files")
