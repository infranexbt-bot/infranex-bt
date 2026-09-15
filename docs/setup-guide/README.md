# GPU Miner Setup Guide — INFRANEX BT Operator Handbook

The complete, screenshot-by-screenshot setup guide for going from an empty
dashboard to a first live Bittensor miner on subnet 64 (Chutes) with an RTX
4090 — wallet, provider key, GPU rental, auto-install, register-last, and the
ongoing operator routine.

## Contents

| File | What it is |
|------|------------|
| `gpu-miner-setup-guide.pdf` | The deliverable — 27 pages, Edition v1.4. Read/print this. |
| `gpu-miner-setup-guide.html` | Editable source for the PDF (single self-contained file + `images/`). |
| `images/` | 20 UI screenshots referenced by the HTML (1600×1000, light theme). |

## Structure (v1.4)

- **Parts A–C** — wallet on laptop, provider API key, pick subnet (incl. the
  RUN / WATCH / AVOID verdict note) and rent the GPU (meter starts at C4).
- **Parts D–F** — hotkey onto the pod, register LAST (burn + earning clock),
  verification.
- **Part G / G.2** — living as a miner: the daily 5-minute checklist and the
  weekly/monthly cadence (UID Defense risk codes, monitoring thresholds,
  RunPod runway math).

- **Part H** — Judge Lab pre-burn gate: mine the judge profile (archetype,
  composite weights, cohort brutality), run the mock-validator simulator, and
  the verdict table that decides whether a burn is justified.
- **Part I** — the CPU path: Harnyx SN67 script mining with NO GPU (v1.4).
  Nine phases P0–P8 mirrored from the app's CPU Guide view (nav 05), live
  SN67 economics, the gate numbers (41.9 weak vs 62.1 competitive ≈ p90),
  the four-command sequence, and the honest boundaries (no CPU pod
  provisioning, no script upload, no self-managed earnings ledger).

## Re-rendering the PDF after editing the HTML

```bash
python3 skills/pdf/scripts/poster_validate.py check-html docs/setup-guide/gpu-miner-setup-guide.html
node skills/pdf/scripts/html2pdf-next.js docs/setup-guide/gpu-miner-setup-guide.html \
  --nopaged --width 720px --height 1020px --title "GPU Miner Setup Guide — INFRANEX BT"
python3 scripts/stamp-guide-pagenums.py
python3 skills/pdf/scripts/pdf_qa.py docs/setup-guide/gpu-miner-setup-guide.pdf --no-tables
```

Version strings live in **two places** — bump both when revising:
the cover chip (`Edition v…`, near the top of the HTML) and the end-meta
footer (`gpu-miner-setup-guide · v…`, at the bottom).

The page-number stamp script lives in the repo (`scripts/stamp-guide-pagenums.py`)
and stamps the rendered PDF in place — pass the PDF path as the first argument.
