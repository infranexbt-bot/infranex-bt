"""Make the merged guide's TOC page clickable: add link annotations over each
part row (text-anchored via pymupdf search) pointing to the part start page."""
import fitz  # pymupdf

PDF = "/home/z/my-project/download/InfraneX-BT-Complete-Guide.pdf"

# TOC row text (search substring) -> 0-indexed target page
ROWS = [
    ("MVP Overview", 2),            # Part 1 -> p3
    ("Architecture Documentation v2", 52),  # Part 2 -> p53
    ("CPU Miner Setup Guide", 67),  # Part 3 -> p68
    ("GPU Miner Setup Guide", 90),  # Part 4 -> p91
    ("SN6 Laptop CPU Operator Guide", 117),  # Part 5 -> p118
    ("Deployment & Hosting Guide", 130),     # Part 6 -> p131
    ("Miner Operations Field Guide", 142),   # Part 7 -> p143
]

doc = fitz.open(PDF)
toc_page = doc[1]  # page 2 (0-indexed)
added = 0
for needle, target in ROWS:
    hits = toc_page.search_for(needle)
    if not hits:
        print(f"  NOT FOUND on TOC: {needle}")
        continue
    r = hits[0]
    # widen the link to cover the full row band (from left edge of number to right margin)
    row_rect = fitz.Rect(48, r.y0 - 2, 546, r.y1 + 2)
    toc_page.insert_link({
        "kind": fitz.LINK_GOTO,
        "from": row_rect,
        "page": target,
        "to": fitz.Point(0, 0),
    })
    added += 1
    print(f"  linked: {needle[:40]:<42} -> page {target + 1}")

doc.saveIncr()
doc.close()
print(f"\n{added}/7 TOC links added")
