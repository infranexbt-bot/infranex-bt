"""Stamp page numbers + metadata on the Bittensor guide PDF (pymupdf-based).

Scheme (pagination.md zone rules):
- Page 1 (cover): hidden number
- Pages 2..N-1 (body): Arabic 1..N-2, bottom center, muted gray
- Page N (ending/back cover): hidden number
"""
import fitz

SRC = "/home/z/my-project/download/bittensor-guide-infranex-bt.pdf"
MUTED = (0x83 / 255, 0x8A / 255, 0x8D / 255)

doc = fitz.open(SRC)
n = len(doc)
for idx in range(1, n - 1):  # skip cover (0) and ending (n-1)
    page = doc[idx]
    label = str(idx)  # body numbering starts at 1 on physical page 2
    w = page.rect.width
    # bottom center; 24px above bottom edge
    tw = fitz.get_text_length(label, fontname="helv", fontsize=8)
    page.insert_text(
        fitz.Point((w - tw) / 2, page.rect.height - 24),
        label,
        fontname="helv",
        fontsize=8,
        color=MUTED,
    )

doc.set_metadata(
    {
        "title": "Bittensor: The Complete Guide - What It Is, How Subnets Work, and Why It Matters for Infranex BT",
        "author": "Infranex BT",
        "subject": "Bittensor protocol guide: subnets, TAO tokenomics, halving, validators, miners, and the miner-intelligence business case",
        "creator": "Infranex BT Miner Intelligence Platform",
        "keywords": "Bittensor, TAO, subnets, dTAO, miners, validators, Yuma Consensus, Infranex BT",
    }
)
doc.saveIncr()
doc.close()
print(f"stamped pages 2..{n-1} as 1..{n-2}; metadata set; total pages {n}")
