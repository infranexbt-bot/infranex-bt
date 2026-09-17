#!/usr/bin/env python3
"""Render key pages of the CPU guide PDF to PNG for visual verification."""
import pypdfium2 as pdfium

SRC = "/home/z/my-project/download/cpu-miner-setup-guide/cpu-miner-setup-guide.pdf"
OUT = "/home/z/my-project/tool-results"

pdf = pdfium.PdfDocument(SRC)
print("pages:", len(pdf))
for i in range(len(pdf)):
    page = pdf[i]
    bmp = page.render(scale=1.6)
    img = bmp.to_pil()
    img.save(f"{OUT}/cg-p{i+1:02d}.png")
print("rendered all pages to", OUT)
