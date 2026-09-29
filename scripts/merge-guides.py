"""Merge all InfraneX BT guide PDFs into one bookmarked operator guide.

Structure (155 pages):
  p1    cover            scripts/guide-cover.pdf
  p2    contents         scripts/guide-toc.pdf
  p3-52    Part 1  MVP Architecture            (50 pp)
  p53-67   Part 2  Architecture Doc v2         (15 pp)
  p68-90   Part 3  CPU Miner Setup Guide       (23 pp)
  p91-117  Part 4  GPU Miner Setup Guide       (27 pp)
  p118-130 Part 5  SN6 Laptop CPU Guide v2     (13 pp)
  p131-142 Part 6  Deployment & Hosting        (12 pp)
  p143-155 Part 7  DevOps Engine Field Guide   (13 pp)
"""
import os

from pypdf import PdfReader, PdfWriter

os.chdir("/home/z/my-project")

A4_W, A4_H = 595.276, 841.890  # exact A4 in pt — the majority size among sources
TMP = "scripts/tmp-normalized"
os.makedirs(TMP, exist_ok=True)


def normalize_a4(src: str) -> str:
    """Scale every page of src to exact A4 and return the temp path.

    Sources mix exact-A4 (595.3pt) with px-rendered (595.9pt) pages; a 0.1%
    scale makes all 155 pages uniform so viewers don't resize per page.
    """
    reader = PdfReader(src)
    writer = PdfWriter()
    for page in reader.pages:
        w, h = float(page.mediabox.width), float(page.mediabox.height)
        if abs(w - A4_W) > 0.2 or abs(h - A4_H) > 0.2:
            page.scale_to(A4_W, A4_H)
        writer.add_page(page)
    out = os.path.join(TMP, os.path.basename(src).replace(" ", "_"))
    with open(out, "wb") as f:
        writer.write(f)
    return out

PARTS = [
    ("docs/Infranex-BT-MVP-Architecture.pdf", "Part 1 — Platform Architecture: MVP Overview"),
    ("docs/Infranex_BT_Architecture_Documentation.pdf", "Part 2 — Architecture Documentation v2"),
    ("docs/setup-guide/cpu-miner-setup-guide.pdf", "Part 3 — CPU Miner Setup Guide"),
    ("docs/setup-guide/gpu-miner-setup-guide.pdf", "Part 4 — GPU Miner Setup Guide"),
    ("public/guides/cpu-miner-setup-guide-v2.pdf", "Part 5 — SN6 Laptop CPU Operator Guide"),
    ("public/guides/deployment-hosting-guide.pdf", "Part 6 — Deployment & Hosting Guide"),
    ("docs/devops-engine-miner-guide.pdf", "Part 7 — DevOps Engine: Miner Operations Field Guide"),
]

EXPECTED_STARTS = [3, 53, 68, 91, 118, 131, 143]  # 1-indexed

writer = PdfWriter()
writer.append(normalize_a4("scripts/guide-cover.pdf"))
writer.append(normalize_a4("scripts/guide-toc.pdf"))

total = 2
for (path, title), expect in zip(PARTS, EXPECTED_STARTS):
    norm = normalize_a4(path)
    n = len(PdfReader(norm).pages)
    assert total + 1 == expect, f"{title}: expected start {expect}, got {total + 1}"
    writer.append(norm, outline_item=title)
    total += n
    print(f"  appended {title}  ({n} pp, starts p{expect})")

writer.add_metadata({
    "/Title": "InfraneX BT — Complete Operator Guide",
    "/Author": "InfraneX BT · Z.ai",
    "/Subject": "All InfraneX BT architecture, miner setup and operations guides merged into one bookmarked document",
    "/Creator": "Z.ai",
})

out = "download/InfraneX-BT-Complete-Guide.pdf"
with open(out, "wb") as f:
    writer.write(f)

check = PdfReader(out)
print(f"\nDONE: {out}")
print(f"  pages: {len(check.pages)} (expected {total})")
print(f"  size:  {os.path.getsize(out) / 1048576:.2f} MB")
print(f"  outline entries: {len(check.outline)}")
assert len(check.pages) == total, "page count mismatch!"
