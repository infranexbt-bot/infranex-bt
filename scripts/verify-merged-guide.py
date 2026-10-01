"""Verify integrity of the merged InfraneX BT Complete Guide PDF.

Checks: page count, metadata, bookmark outline, TOC link annotations,
page-size uniformity, and non-empty text on sampled pages.
Restorable via scripts/verify-merged-guide.py (survives snapshot resets).
"""
import json
from pypdf import PdfReader

PDF = "/home/z/my-project/download/InfraneX-BT-Complete-Guide.pdf"

r = PdfReader(PDF)
pages = len(r.pages)
meta = r.metadata or {}

print(f"pages: {pages}")
print(f"title: {meta.get('/Title')}")
print(f"author: {meta.get('/Author')}")
print(f"creator: {meta.get('/Creator')}")
print(f"subject: {meta.get('/Subject')}")

# Bookmark outline (top level + first children)
def walk(outline, depth=0, out=None):
    out = out if out is not None else []
    for item in outline:
        if isinstance(item, list):
            walk(item, depth + 1, out)
        else:
            try:
                pg = r.get_destination_page_number(item) + 1
            except Exception:
                pg = "?"
            out.append((depth, item.title, pg))
    return out

try:
    entries = walk(r.outline)
    print(f"bookmarks: {len(entries)}")
    for d, t, p in entries:
        print(f"  {'  ' * d}- {t} -> p.{p}")
except Exception as e:
    print(f"outline ERROR: {e}")

# TOC link annotations on pages 2-3 (TOC area)
links = 0
for i in (1, 2):
    if i < pages:
        annots = r.pages[i].get("/Annots") or []
        links += len(annots)
print(f"toc-area link annotations: {links}")

# Page size uniformity
sizes = set()
for p in r.pages:
    box = p.mediabox
    sizes.add((round(float(box.width), 1), round(float(box.height), 1)))
print(f"distinct page sizes: {sizes}")

# Sample text presence (pymupdf — robust against odd embedded font descriptors)
import fitz  # pymupdf

doc = fitz.open(PDF)
empty = []
for i in [0, 1, 2, pages // 2, pages - 1]:
    txt = (doc[i].get_text() or "").strip()
    if len(txt) < 20:
        empty.append(i + 1)
print(f"near-empty sampled pages: {empty if empty else 'none'}")
doc.close()

ok = (
    pages == 155
    and links >= 7
    and len(entries) >= 7
    and len(sizes) == 1
    and not empty
)
print("VERDICT:", "PASS" if ok else "CHECK-REQUIRED")
print(json.dumps({"pages": pages, "links": links, "bookmarks": len(entries)}))
