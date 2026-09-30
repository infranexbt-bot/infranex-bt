"""Inspect candidate guide PDFs: pages, checksum, title text — dedupe + order."""
import hashlib
import os

from pypdf import PdfReader

CANDIDATES = [
    "docs/Infranex-BT-MVP-Architecture.pdf",
    "docs/Infranex_BT_Architecture_Documentation.pdf",
    "docs/setup-guide/cpu-miner-setup-guide.pdf",
    "docs/setup-guide/gpu-miner-setup-guide.pdf",
    "docs/devops-engine-miner-guide.pdf",
    "public/guides/cpu-miner-setup-guide-v2.pdf",
    "public/guides/deployment-hosting-guide.pdf",
    "public/guides/devops-engine-miner-guide.pdf",
    "public/devops-engine-miner-guide.pdf",
]

os.chdir("/home/z/my-project")
seen = {}
for path in CANDIDATES:
    if not os.path.exists(path):
        print(f"MISSING  {path}")
        continue
    raw = open(path, "rb").read()
    md5 = hashlib.md5(raw).hexdigest()[:10]
    dup_of = seen.get(md5)
    seen[md5] = path
    try:
        r = PdfReader(path)
        n = len(r.pages)
        first = (r.pages[0].extract_text() or "")[:90].replace("\n", " | ")
        size_mb = len(raw) / 1048576
        box = r.pages[0].mediabox
        orient = "landscape" if float(box.width) > float(box.height) else "portrait"
        dup = f"  == DUP of {dup_of}" if dup_of else ""
        print(f"{path}\n  pages={n} size={size_mb:.2f}MB {orient} md5={md5}{dup}\n  title: {first}\n")
    except Exception as e:
        print(f"{path}\n  ERROR: {e}\n")
