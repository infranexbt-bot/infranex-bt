// Append the GUIDE-4 worklog entry (persisted script — never inline).
import fs from "node:fs";

const ENTRY = `
---
Task ID: GUIDE-4
Agent: main (Super Z)
Task: User asked whether WATCH-verdict subnets in Opportunities are minable now or should wait for RUN; approved adding a "Reading subnet verdicts" note to the guide.

Work Log:
- CODE-VERIFIED the verdict engine before answering: src/lib/utils.ts scoreBand() bands (score >= 60 RUN / 40-59 WATCH / < 40 AVOID) + opportunityBand() forced-AVOID when meetsMinimum === false (expected net < $300/mo default target); Miner's Ledger v2 5-pillar weights in miner-score.ts (net_roi 0.30, seat_safety 0.20, alpha_economics 0.20, earning_reality 0.15, fit_feasibility 0.15, newcomer-adjusted mid-pack economics); opportunities-view.tsx bands are view filters only; opportunity-table.tsx renders "Start mining" for every row with no band gate; deploy-wizard.tsx accepts any netuid (verdicts shown, not enforced); registration burn is per registration (~1 TAO, data.ts registrationCostTao) regardless of verdict. Distinguished from runway.ts "watch" (UID immunity runway — different feature).
- ANSWERED in chat: WATCH = amber second tier, advisory not a block — technically minable today, but mid-pack hovers near breakeven once rent is paid; recommendation: first miner stays on RUN-verified Chutes SN64; trying WATCH then migrating to RUN costs the burn twice; WATCH reasonable only with a specific edge (cheaper GPU, existing code for the niche, deliberate cheap experiment); AVOID = forced by the minimum-entry rule, respect it.
- GUIDE PATCH (v1.1 → v1.2): new "Reading the subnet verdicts — RUN / WATCH / AVOID" note inserted in Part C between the DevOps-strip note and step C1 (band thresholds, 5 pillar weights, WATCH-is-advice-not-a-lock, double-burn warning, first-miner→RUN rule); footer bumped to v1.2.
- RE-RENDER pipeline (GUIDE-1 recipe): poster_validate check-html PASS (same benign cover_validate warning); html2pdf-next.js --nopaged 720x1020 → 22 pp (unchanged — note fit without spilling), 2.7 MB, 24 figures, 5 tables; stamp-guide-pagenums.py re-stamped (cover hidden, body 1..21) + metadata; pdf_qa --no-tables 10 hard checks PASS, same cosmetic line-start-dash warning disproven by pypdf (zero line-start dashes). Text-extraction probes confirm the verdict note, v1.2, weight 30% all present ("First miner" probe was a line-wrap artifact — content confirmed).
- No app code changed; 436-check baseline untouched.

Stage Summary:
- User's WATCH question answered with code evidence: WATCH subnets are deployable today but the standing plan (RUN on SN64) remains the right first move. Guide v1.2 (22 pp) now documents how to read the verdicts. Deliverable refreshed in place: download/miner-setup-guide/gpu-miner-setup-guide.pdf.
`;

fs.appendFileSync("/home/z/my-project/worklog.md", ENTRY, "utf8");
console.log("worklog appended:", ENTRY.length, "chars");
