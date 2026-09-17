// Append the GUIDE-3 worklog entry (persisted script — never inline).
import fs from "node:fs";

const ENTRY = `
---
Task ID: GUIDE-3
Agent: main (Super Z)
Task: User asked for the post-deployment miner monitoring routine (what to check, where, with examples), then confirmed "yes" to baking it into the PDF guide as Part G — Living as a Miner.

Work Log:
- ANSWERED in chat first (all verified in code): lifecycle provisioning→installing→started→registered→earning; four strategy mindsets on the DevOps Strategy Board (POSTURE_META: earn_more/defend/optimize/steady — recommended DEFEND for weeks 1-2); UID Defense six risk codes (NOT_REGISTERED, ZERO_INCOME, EVICTABLE, UNDERPERFORMING, INCENTIVE_COLLAPSE, PERSISTENT_DECLINE — uid-defense.ts); Monitoring 09 cards (Started Miners, Daily Emission, Monthly Cost, Net Profit/mo + ROI, per-miner GPU util/temp/incentive sampled every 90 s pass).
- SCREENSHOTS (agent-browser, fresh admin login via /api/auth/login eval, viewport 1600x1000 to match existing figures, light theme consistent with s01-s14): images/s15-my-miners.png (portfolio + honest empty registered list), s16-monitoring.png (Trigger Center with 1 open RE-SYNC warning + money cards, TAO/USD $236.99, block 9,061,290), s17-strategy.png (DevOps Engine deck: counters, Autopilot policy-gated, Benchmarks axon latency, Ops Agent, External alerting webhooks). Browser closed after pass.
- GUIDE PATCH (v1.0 → v1.1): new Part G "Living as a Miner — The Operator Routine" inserted between Part F and the Binance chapter — lead with the lifecycle, posture note (DEFEND first), Fig G-1 strategy deck; steps G-1..G-5 (deployment card, UID Defense + 6-risk-code table + Fig G-2, Monitoring rows + Fig G-3, P&L card, RunPod runway $8.16/day math); Part G.2 "The Deeper Cadence" weekly/monthly table (My Miners trend, SN64 health, btcli wallet overview term block with example output, terminate stopped pods, audit scan, price re-check, revision updates, Analytics review); closing note on what the 90 s passes automate + the one-line daily routine.
- RE-RENDER pipeline (GUIDE-1 recipe): poster_validate check-html PASS (same benign cover_validate warning); html2pdf-next.js --nopaged 720x1020 → 22 pp (was 17), 2.7 MB, 24 figures, 5 tables; stamp-guide-pagenums.py re-stamped (cover hidden, body 1..21) + metadata; pdf_qa --no-tables all hard checks PASS, same cosmetic line-start-dash warning disproven by pypdf (zero line-start dashes). Text-extraction probes confirm Part G, risk codes, G-5, Deeper Cadence, btcli example, v1.1 all present.
- No app code changed; 436-check baseline untouched.

Stage Summary:
- Guide now covers the full miner lifecycle end-to-end: setup (Parts A-F) AND the ongoing operator routine (Part G). Deliverable refreshed in place: download/miner-setup-guide/gpu-miner-setup-guide.pdf (22 pp, v1.1) + HTML source + 3 new screenshots. User's standing job after go-live: 5-minute daily checklist G-1..G-5, 15-minute weekly cadence.
`;

fs.appendFileSync("/home/z/my-project/worklog.md", ENTRY, "utf8");
console.log("worklog appended:", ENTRY.length, "chars");
