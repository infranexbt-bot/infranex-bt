"""Post-process the CPU miner guide PDF: stamp page numbers + verify text.

Per pagination.md standard scheme: cover (page 1) hidden, body pages get
Arabic numerals starting at 1, bottom-center, no denominator.
Also scans extracted text for U+FFFD corruption (post-generation check).
"""
import io
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

SRC = "/home/z/my-project/download/cpu-miner-setup-guide.pdf"
OUT = "/home/z/my-project/download/cpu-miner-setup-guide.pdf"

reader = PdfReader(SRC)
n = len(reader.pages)
box = reader.pages[0].mediabox
W, H = float(box.width), float(box.height)
print(f"pages={n} size={W:.1f}x{H:.1f}pt")

# Build overlay PDF: one page per source page; number only pages 2..N as 1..N-1
buf = io.BytesIO()
c = canvas.Canvas(buf, pagesize=(W, H))
for i in range(n):
    if i > 0:
        c.setFont("Helvetica", 8.5)
        c.setFillColorRGB(0.45, 0.44, 0.42)
        c.drawCentredString(W / 2, 12, str(i))
    c.showPage()
c.save()
buf.seek(0)
overlay = PdfReader(buf)

writer = PdfWriter()
for i, page in enumerate(reader.pages):
    if i > 0:
        page.merge_page(overlay.pages[i])
    writer.add_page(page)

# Metadata
writer.add_metadata({
    "/Title": "CPU Miner Setup Guide — Laptop to Live on SN67",
    "/Author": "Z.ai",
    "/Creator": "Infranex · Z.ai",
    "/Subject": "Step-by-step workflow: connect local machine, create and fund wallet, deploy SN67 Harnyx, pass Validator Lab gate, register (burn), submit agent, monitor",
})
with open(OUT, "wb") as f:
    writer.write(f)
print("stamped + metadata OK")

# U+FFFD / corruption scan (pymupdf — pypdf chokes on KaTeX font descriptors)
import fitz
doc = fitz.open(OUT)
bad = []
empty = []
for i, p in enumerate(doc):
    t = p.get_text() or ""
    if "\ufffd" in t:
        bad.append(i + 1)
    if len(t.strip()) < 5:
        empty.append(i + 1)
print("replacement-char pages:", bad if bad else "none")
print("near-empty text pages:", empty if empty else "none")
