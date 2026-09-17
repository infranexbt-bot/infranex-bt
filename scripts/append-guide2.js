// Append the GUIDE-2 worklog entry (persisted script — never inline).
import fs from "node:fs";

const ENTRY = `
---
Task ID: GUIDE-2
Agent: main (Super Z)
Task: User asked what the "Deploy a miner" button and the "DevOps Engine + Add GPU host" strip on the Deployments page are, whether they are required, and whether the setup guide covers them.

Work Log:
- ANSWERED from code (no guessing): devops-console.tsx Add GPU host dialog = SSH-connect a machine the operator ALREADY controls (own box or pod rented on the provider's own website); engine runs the same 10-step pipeline over that SSH. deploy-wizard.tsx rental path (step 3 rent -> step 4 install) creates the deployment and the platform registers/connects the rented pod itself — "GPU rented — installing requirements" toast, live install log in step 4. So for the user's rental flow: "Deploy a miner" (and/or the Mining Journey card) is the required door; "Add GPU host" is NOT needed.
- GUIDE PATCH: the delivered guide's Part C lead explained the two wizard doors (Journey card vs Deploy a miner) but never named the DevOps strip. Added a .note after the Part C lead (gpu-miner-setup-guide.html): what the strip is (own-machine SSH path), when it is needed (never for platform-rented pods), and the rule of thumb (rented here -> touch nothing in the strip; own the box -> Add GPU host).
- RE-RENDER pipeline (pdf skill, GUIDE-1 recipe): poster_validate check-html PASS (same single benign warning as baseline — cover_validate playwright-core unavailable); html2pdf-next.js --nopaged 720x1020 -> 17 pp (note pushed one page), 2.1 MB, 18 figures, 3 tables; stamp-guide-pagenums.py re-stamped (cover hidden, body 1..16) + metadata; pdf_qa --no-tables all hard checks PASS, 1 cosmetic line-start-dash warning disproven by pypdf extraction (zero line-start dashes). Verified the note text renders in the PDF ("Add GPU host" / "DevOps Engine strip" / "Rule of thumb" all present).
- Closed the dirty .alpha-price-history.json runtime cache with a chore commit per standing precedent.

Stage Summary:
- Guide now explicitly answers the user's exact question on-page: Part C carries a callout distinguishing the rental wizard from the bring-your-own-host DevOps path. Deliverable refreshed in place: download/miner-setup-guide/gpu-miner-setup-guide.pdf (17 pp) + HTML source. No app code touched; 436-check test baseline untouched.
`;

fs.appendFileSync("/home/z/my-project/worklog.md", ENTRY, "utf8");
console.log("worklog appended:", ENTRY.length, "chars");
