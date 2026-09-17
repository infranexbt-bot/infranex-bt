// Append the GUIDE-5 worklog entry (persisted script — never inline).
import fs from "node:fs";

const ENTRY = `
---
Task ID: GUIDE-5
Agent: main (Super Z)
Task: User asked to archive the setup guide into the git repo and push.

Work Log:
- Created docs/setup-guide/ in the infranex-bt repo; copied gpu-miner-setup-guide.html (editable source), gpu-miner-setup-guide.pdf (22 pp, Edition v1.2 deliverable) and images/ (19 screenshots, 4.3 MB) from download/miner-setup-guide/ (7.7 MB total).
- Added docs/setup-guide/README.md: contents table, guide structure summary (Parts A-G, verdict note in Part C), exact re-render pipeline commands (poster_validate → html2pdf-next --nopaged 720x1020 → stamp-guide-pagenums → pdf_qa --no-tables), and the two-version-strings rule (cover chip + end footer — the GUIDE-4b lesson).
- Commit 9763963 "docs: archive GPU Miner Setup Guide v1.2" pushed to origin/nextjs-platform; tree clean after push.
- No app code changed; 436-check baseline untouched.

Stage Summary:
- The guide now travels with the code on GitHub: docs/setup-guide/ carries the v1.2 PDF, its HTML source, all screenshots and the re-render recipe. download/ copy remains the user-facing delivery location.
`;

fs.appendFileSync("/home/z/my-project/worklog.md", ENTRY, "utf8");
console.log("worklog appended:", ENTRY.length, "chars");
