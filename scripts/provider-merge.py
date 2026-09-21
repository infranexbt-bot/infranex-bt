#!/usr/bin/env python3
"""Merge Template 07 cover + ReportLab body into the final provider report PDF."""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89
COVER = "/home/z/my-project/tool-results/provider-cover.pdf"
BODY = "/home/z/my-project/tool-results/provider-body.pdf"
OUT = "/home/z/my-project/download/GPU-Provider-Analysis-Infranex-BT.pdf"


def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 0.1 or abs(h - A4_H) > 0.1:
        page.scale_to(A4_W, A4_H)
    return page


writer = PdfWriter()
writer.add_page(normalize_page_to_a4(PdfReader(COVER).pages[0]))
for page in PdfReader(BODY).pages:
    writer.add_page(normalize_page_to_a4(page))
writer.add_metadata({
    "/Title": "GPU Provider Analysis - Rented GPUs, Ranked by Runtime",
    "/Author": "Z.ai",
    "/Creator": "Z.ai",
    "/Subject": "Runtime-first comparison of GPU rental providers (Vast, Akash, RunPod, Lambda) for Bittensor mining",
})
with open(OUT, "wb") as f:
    writer.write(f)
print("merged:", OUT, "pages:", len(writer.pages))
