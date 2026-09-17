// Append the GUIDE-1 worklog entry (persisted script — never inline).
import fs from "node:fs";

const ENTRY = `
---
Task ID: GUIDE-1
Agent: main (Super Z)
Task: User asked for a complete step-by-step miner setup guide with menus to click, screenshots with examples, delivered as a PDF. Built via pdf skill (Creative Flow pipeline) + agent-browser live screenshots.

Work Log:
- STALE-STATE CHECK first: WALLET-ECON-1 (e077e71) was already committed+pushed after the summary point — verified via worklog + git, NOT rebuilt; closed the dirty runtime cache with chore 5c92d82. (Earlier in session: PREVIEW-FRAME-1 fixed "refused to connect" — X-Frame-Options DENY -> CSP frame-ancestors 'self' *.space-z.ai *.z.ai, commit ba293d9, header verified through the preview domain.)
- SCREENSHOTS (agent-browser, admin login via /api/auth/login eval then reload): 15 live shots into download/miner-setup-guide/images/ — login, dashboard (live finney block 9,061,018, TAO $234.84, honest empty P&L), Subnets grid + Chutes card (Min VRAM 24GB, burn-entry ~0.0005 TAO), Chutes Requirements dialog, GPU Catalog, Provider API keys dialog, Deployments + Mining Journey card (5-step state machine), full Deploy wizard step 1 (subnet grid) / step 2 (requirements, auto-opened via journey preselect) / step 3 (live offers: 3090 $0.22, A6000 $0.33, RTX 4090 $0.34/hr + RunPod(real) + wallet-chip prefill), Wallet & registration wizard steps 1-4 (btcli commands + copy buttons), System view (health board + wallet profiles + platform settings + audit). Browser closed after pass.
- WIZARD GOTCHAS for future passes: clicking a subnet card in wizard step 1 selects but the journey path (Pick a subnet -> search -> "SN64 Chutes RTX 4090 24GB" -> Pull requirements -> Mine this subnet) is what enables "Deploy SN64 Chutes" (needs host validation first); wizard opens at step 2 when journey subnet is set; find text fails on split button labels ("+ Deploy a miner" needs snapshot refs).
- GUIDE (creative-flow brief): download/miner-setup-guide/gpu-miner-setup-guide.html — 720x1020 flow doc, cover + Golden Order (flow diagram + money map + checklist) + Part A platform prep + Part B wallet on laptop (terminal example blocks with btcli output) + Part C subnet/GPU/rent + Part D SCP + Part E register-last + Part F monitoring + Binance click-by-click + Troubleshooting + ending page. 18 figures, 3 tables, terminal blocks with example output. Local fonts only (Carlito/Noto Sans SC/DejaVu Mono — no Google Fonts, dodges the fonts.gstatic flakiness).
- PIPELINE FIXES: (1) html2pdf auto-injects KaTeX on $...$ patterns and would mangle "$0.22/hr ... $0.34/hr" into math — neutralized with window.katex stub in head (lib truthy, renderMathInElement undefined -> no auto-render); (2) pagedjs blocked by npm allow-scripts sandbox -> used documented --nopaged (Chromium native @page; break-inside rules are natively honored); (3) decorative cover/ending rings moved fully inside bounds after the tool stripped overflow:hidden on .ending (160px clipped); (4) em-dashes bound with &nbsp; to kill line-start dashes.
- QA: poster_validate check-html PASS (1 benign warning); pdf_qa --no-tables: 9 checks PASS, 1 cosmetic dash warning that text extraction disproves (pypdf shows zero line-start dashes). 16 pages, 2.1MB, vector text, fonts embedded, no blank pages, fill adequate, margins symmetric. Page numbers stamped via scripts/stamp-guide-pagenums.py (cover hidden, body 1..15) + metadata (Title/Author Z.ai/Creator/Subject).

Stage Summary:
- DELIVERED: download/miner-setup-guide/gpu-miner-setup-guide.pdf (16 pp) + the editable HTML source + images/ folder. Numbers in the guide are LIVE at capture time (4090 $0.34/hr, SN64 burn-entry ~0.0005 TAO, block 9,061,018) and the guide tells the reader to re-check at rent time. No app code changed this session beyond the earlier header fix (already pushed). User's next action per the guide: Part A (paste RunPod key), Part B (wallet), then C4 is the first dollar.
`;

fs.appendFileSync("/home/z/my-project/worklog.md", ENTRY, "utf8");
console.log("worklog appended:", ENTRY.length, "chars");
