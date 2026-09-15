#!/usr/bin/env python3
"""Update scripts/handbook_content.py + scripts/handbook_cover.html:
Judge Lab -> Validator Lab rename (secondary ReportLab handbook variant),
edition bump, residual scan. Syncs the cover copy to download/.
"""
import shutil
import sys
import re

CONTENT = "/home/z/my-project/scripts/handbook_content.py"
COVER = "/home/z/my-project/scripts/handbook_cover.html"
COVER_DL = "/home/z/my-project/download/infranex-bt-handbook-cover.html"

CONTENT_REPL = [
    # specific multi-word rules first
    ("judge-fix entries", "validator-fix entries"),
    ("automatically before Judge fixes", "automatically before Validator Lab fixes"),
    ("the expectations the Judge simulates against", "the expectations the Validator Lab simulates against"),
    ("ending with the Judge, which is the platform's sharpest edge",
     "ending with the Validator Lab, which is the platform's sharpest edge"),
    ("snapshot-then-push pipeline as the Judge", "snapshot-then-push pipeline as the Validator Lab"),
    ("Use it when the Judge is satisfied", "Use it when the Validator Lab is satisfied"),
    ("re-runs the Judge a few minutes later", "re-runs the simulation a few minutes later"),
    ("Re-run the Judge; consider a re-quant or reprice", "Re-run the simulation; consider a re-quant or reprice"),
    ("re-judge it, reprice it, move it, or kill it", "re-validate it, reprice it, move it, or kill it"),
    ("Judged as an operations tool", "Rated as an operations tool"),
    ("Closed Judge-to-Apply loop", "Closed Validate-to-Apply loop"),
    ("The weekly judge-apply-remeasure cycle", "The weekly validate-apply-remeasure cycle"),
    # global
    ("Judge Lab", "Validator Lab"),
]

COVER_REPL = [
    ("how the Judge-to-Apply loop reaches your GPUs", "how the Validate-to-Apply loop reaches your GPUs"),
    ("September 2026 &middot; Edition 1", "September 2026 &middot; Edition 2"),
]


def apply(path: str, repls: list[tuple[str, str]], label: str) -> int:
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    fails = []
    for old, new in repls:
        n = text.count(old)
        if n == 0:
            continue  # already applied / not present
        text = text.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    residual = [(i + 1, ln.rstrip()) for i, ln in enumerate(text.splitlines()) if re.search(r"judge", ln, re.I)]
    if residual:
        print(f"{label} RESIDUAL judge mentions:")
        for ln, txt in residual:
            print(f"  L{ln}: {txt.strip()[:100]}")
        return 1
    print(f"{label} OK — 0 residual judge mentions")
    return 0


def main() -> int:
    rc1 = apply(CONTENT, CONTENT_REPL, "handbook_content.py")
    rc2 = apply(COVER, COVER_REPL, "handbook_cover.html")
    if rc1 or rc2:
        return 1
    shutil.copyfile(COVER, COVER_DL)
    print("cover synced to download/infranex-bt-handbook-cover.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
