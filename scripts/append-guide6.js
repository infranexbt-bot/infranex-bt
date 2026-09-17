// Append the GUIDE-6 worklog entry (persisted script — never inline).
import fs from "node:fs";

const ENTRY = `
---
Task ID: GUIDE-6
Agent: main (Super Z)
Task: User approved adding Part H — "Judge Lab: test before you burn" to the PDF guide after the Judge Lab explanation in chat.

Work Log:
- CODE-VERIFIED Judge Lab before explaining: judge/types.ts (6-dimension catalog, 5 archetypes + priors, MinerSpec, cohort brutality bands, SimulationResult verdict thresholds); judge/simulate.ts (deterministic scoring curves — speed sigmoid vs deadline, availability QUADRATIC tail 99.5→0.90/95→0.25/90→0, quality concave, throughput saturating, price linear; composite = Σ weight×score; strong ≥75 / competitive ≥60 / marginal ≥45 / weak <45; cohort-aware percentile + medianMultiple; top-3 ranked recommendations with point gains); judge/service.ts (repo resolution from on-chain identity, 6h profile cache); use-judge.ts + judge-view.tsx UI flow.
- SCREENSHOT s18-judge-lab.png (agent-browser, fresh admin login, viewport 1600×1000 light theme, browser closed after): Judge Lab on SN64 — profile card (Market Clearing, 24 evidence hits, 66% confidence, Brutal 62/100, 256 registered / 17 earning / 6.6% earn ratio / 30% top-10% take, weights Price 58% Throughput 17% Speed 12% Uptime 7% Quality 5% Resource 2%), simulator at 4090 defaults (2.00s / 99.50% / 80% / 25 units/s / $0.50), Verdict panel 62.1 competitive ~p82 1.36× vs median + highest-leverage fixes (+14.5 price, +3.6 throughput, +0.7 resource fit). Diagnostic detour: initial probes suggested the VerdictPanel was missing — false alarm; exact-string check failed because text-eyebrow CSS-uppercases labels ("COHORT PERCENTILE") and the a11y snapshot clips below the fold. No app bug; fetch interceptor confirmed valid {ok, profile, result} responses throughout.
- GUIDE PATCH (v1.2 → v1.3, BOTH version strings bumped — cover chip + end footer): (1) Part E lead gained "The gate before you burn" note pointing to Part H as the free pre-registration check; (2) new Part H "Judge Lab — Test Before You Burn" inserted after Part G.2 before the Binance chapter — lead (what a judge is, $0 failure), steps H-1 mine the profile (evidence hits, confidence), H-2 read weights + cohort brutality, H-3 set real 4090 spec + run, H-4 read verdict + levers; Fig H-1 (s18); verdict-band table (strong/competitive/marginal/weak with burn guidance); pre-burn rule note (register only at competitive ≥60 AND >1.00× vs median; honest model-not-validator caveat; when to re-run — pre-registration gate, spec changes, incentive drift, G.2 weekly cadence).
- RE-RENDER pipeline (GUIDE-1 recipe): poster_validate check-html (1 benign cover_validate warning); html2pdf-next.js --nopaged 720x1020 → 24 pp (was 22), 2.9 MB, 26 figures, 6 tables; stamp-guide-pagenums.py (cover hidden, body 1..23) + metadata; pdf_qa --no-tables hard checks PASS, same cosmetic line-start-dash warning disproven by pypdf (zero line-start dashes). Text-extraction probes: cover Edition v1.3, no v1.2 anywhere, Part H + verdict table + pre-burn rule + gate note + 62.1/~p82/1.36× all present ("Re-mine profile"/"fixes" probes were pypdf fi-ligature artifacts, content confirmed via normalized search).
- No app code changed; 436-check baseline untouched.

Stage Summary:
- Guide v1.3 (24 pp) now includes Judge Lab as the pre-burn gate: Parts A-H cover wallet → provider → rent → install → judge-verified registration → operator routine, plus Binance funding. Deliverable refreshed in place at download/miner-setup-guide/ and synced to the repo archive at infranex-bt/docs/setup-guide/.
`;

fs.appendFileSync("/home/z/my-project/worklog.md", ENTRY, "utf8");
console.log("worklog appended:", ENTRY.length, "chars");
