"""Inspect remaining PDFs with pypdfium2 (pypdf chokes on their content streams)."""
import hashlib
import os

import pypdfium2 as pdfium

CANDIDATES = [
    "docs/devops-engine-miner-guide.pdf",
    "public/guides/cpu-miner-setup-guide-v2.pdf",
    "public/guides/deployment-hosting-guide.pdf",
    "public/guides/devops-engine-miner-guide.pdf",
    "public/devops-engine-miner-guide.pdf",
]

os.chdir("/home/z/my-project")
for path in CANDIDATES:
    raw = open(path, "rb").read()
    md5 = hashlib.md5(raw).hexdigest()[:10]
    try:
        pdf = pdfium.PdfDocument(path)
        n = len(pdf)
        page = pdf[0]
        w, h = page.get_size()
        text = page.get_textpage().get_text_range()[:90].replace("\n", " | ").replace("\r", "")
        print(f"{path}\n  pages={n} size={len(raw)/1048576:.2f}MB "
              f"{'landscape' if w > h else 'portrait'} md5={md5}\n  title: {text}\n")
        pdf.close()
    except Exception as e:
        print(f"{path}\n  ERROR: {e}\n")
