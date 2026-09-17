// Append the GUIDE-4b worklog entry (persisted script — never inline).
import fs from "node:fs";

const ENTRY = `
---
Task ID: GUIDE-4b
Agent: main (Super Z)
Task: User reported the 22-page PDF still shows "v1.0" — cover version chip missed in previous bumps.

Work Log:
- ROOT CAUSE: the guide carries TWO version strings — the end-meta footer (bumped v1.0→v1.1→v1.2 in GUIDE-3/4) and a separate cover chip "Edition v1.0 · September 14, 2026" (line 176) that was never bumped. User's copy was actually the current 22-page build with the verdict note; only the cover badge was stale.
- FIX: cover chip Edition v1.0 → v1.2 (date kept, same day).
- RE-RENDER pipeline (GUIDE-1 recipe): poster_validate check-html zero errors; html2pdf-next.js --nopaged 720x1020 → 22 pp, 2.7 MB, 24 figures, 5 tables; stamp-guide-pagenums.py re-stamped (cover hidden, body 1..21) + metadata; pdf_qa --no-tables hard checks PASS (same cosmetic line-start-dash warning disproven by pypdf: zero line-start dashes).
- VERIFIED in extracted PDF text: cover now reads "Edition v1.2", string "v1.0" absent anywhere in the document, verdict note + v1.2 footer both present, 22 pages.
- No app code changed; 436-check baseline untouched.

Stage Summary:
- Guide v1.2 is now consistent on both version labels (cover chip + end footer). Deliverable refreshed in place: download/miner-setup-guide/gpu-miner-setup-guide.pdf. Lesson: version strings live in two places — always bump both (grep "Edition" + "gpu-miner-setup-guide · v").
`;

fs.appendFileSync("/home/z/my-project/worklog.md", ENTRY, "utf8");
console.log("worklog appended:", ENTRY.length, "chars");
