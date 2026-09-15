#!/usr/bin/env python3
"""Stamp page numbers on the guide PDF (pagination.md scheme):
- Page 1 (cover): no number
- Pages 2..N: Arabic numerals starting at 1, bottom center, muted gray
Also sets PDF metadata (Title/Author/Creator/Subject).

Usage: python3 scripts/stamp-guide-pagenums.py <pdf-path>
"""
import io
import sys

from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

SRC = sys.argv[1] if len(sys.argv) > 1 else \
    "/home/z/my-project/download/miner-setup-guide/gpu-miner-setup-guide.pdf"
OUT = SRC

reader = PdfReader(SRC)
writer = PdfWriter()
n = len(reader.pages)

for i, page in enumerate(reader.pages):
    if i == 0:  # cover — hidden number
        writer.add_page(page)
        continue
    w = float(page.mediabox.width)
    h = float(page.mediabox.height)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(w, h))
    c.setFont("Helvetica", 8.5)
    c.setFillColor(HexColor("#7a8aa0"))
    c.drawCentredString(w / 2, 16, str(i))  # body numbering starts at 1
    c.save()
    overlay = PdfReader(io.BytesIO(buf.getvalue())).pages[0]
    page.merge_page(overlay)
    writer.add_page(page)

writer.add_metadata({
    "/Title": "GPU Miner Setup Guide — INFRANEX BT",
    "/Author": "Z.ai",
    "/Creator": "INFRANEX BT operator handbook pipeline",
    "/Subject": "Bittensor miner setup — GPU path (SN64 Chutes) and CPU script-mining path (SN67 Harnyx)",
})

with open(OUT, "wb") as f:
    writer.write(f)

print(f"stamped {n} pages -> {OUT}")
