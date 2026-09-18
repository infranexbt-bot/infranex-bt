#!/usr/bin/env python3
"""Post-process the CPU miner guide PDF:
1. Stamp Arabic page numbers (bottom center) on every page except the cover —
   matching the GPU guide precedent (body starts at 1 on the page after cover).
2. Set PDF metadata (Title / Author / Creator / Subject).
"""
import fitz

SRC = "/home/z/my-project/docs/setup-guide/cpu-miner-setup-guide.pdf"
OUT = "/home/z/my-project/docs/setup-guide/cpu-miner-setup-guide-final.pdf"

doc = fitz.open(SRC)
W = doc[0].rect.width   # 540 pt
H = doc[0].rect.height  # 765 pt

for i in range(1, len(doc)):  # skip cover (index 0)
    page = doc[i]
    label = str(i)  # body numbering starts at 1 on the page after the cover
    page.insert_text(
        fitz.Point(W / 2 - 3 * len(label), H - 28),
        label,
        fontsize=9,
        fontname="helv",
        color=(0.42, 0.49, 0.57),
    )

doc.set_metadata({
    "title": "CPU Miner Setup Guide — INFRANEX BT",
    "author": "Z.ai",
    "creator": "INFRANEX BT operator handbook pipeline",
    "subject": "Bittensor CPU miner setup — rent a CPU VPS (Hetzner/DigitalOcean), auto-install, and launch on SN61 RedTeam; manual DIY path included",
    "producer": "Playwright + Paged.js via html2pdf-next.js",
})

doc.save(OUT, garbage=3, deflate=True)
doc.close()

# verify
d = fitz.open(OUT)
print("pages:", len(d), "| metadata:", d.metadata["title"], "|", d.metadata["author"])
for p in (1, 2, 11, 22):
    t = d[p].get_text().strip().splitlines()
    print(f"page {p+1} last line: {t[-1]!r}")
d.close()
