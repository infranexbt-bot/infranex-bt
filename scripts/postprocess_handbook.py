#!/usr/bin/env python3
"""Post-process infranex-operator-handbook.pdf:
1. Stamp Arabic page numbers on body pages (skip cover p1 + dark ending p11),
   numbering starts at 1 on the first content page (standard scheme: cover hidden).
2. Set PDF metadata (Title / Author / Subject / Creator).
3. Scan extracted text for U+FFFD corruption.
"""
import io
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

SRC = "/home/z/my-project/download/infranex-operator-handbook.pdf"
W, H = 595.5, 842.25  # 794x1123 px @96dpi -> pt (x0.75)

reader = PdfReader(SRC)
n = len(reader.pages)
writer = PdfWriter()

for i, page in enumerate(reader.pages):
    # skip cover (0) and ending (n-1): no visible page number there
    if i not in (0, n - 1):
        num = str(i)  # first content page -> 1
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(W, H))
        c.setFont("Helvetica", 8.5)
        c.setFillColorRGB(0.353, 0.478, 0.588)  # #5a7a96 muted blue-gray
        c.drawCentredString(W / 2, 20, num)
        c.save()
        buf.seek(0)
        overlay = PdfReader(buf).pages[0]
        page.merge_page(overlay)
    writer.add_page(page)

writer.add_metadata({
    "/Title": "Infranex BT - Operator Handbook: The Complete Mining Workflow",
    "/Author": "Z.ai",
    "/Subject": "Step-by-step Bittensor mining workflow: subnet selection, GPU deployment, node daemon connection, Judge Lab testing and fix application",
    "/Creator": "Z.ai PDF Workbench (Playwright + Paged.js)",
})

with open(SRC, "wb") as f:
    writer.write(f)
print(f"stamped pages 2..{n-1} as 1..{n-2}, metadata set, {n} pages total")

# corruption scan
text = "".join(p.extract_text() or "" for p in PdfReader(SRC).pages)
bad = text.count("\ufffd")
print(f"U+FFFD count in extracted text: {bad}")
print(f"extracted chars: {len(text)}")
