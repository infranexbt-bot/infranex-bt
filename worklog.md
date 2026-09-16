
---
Task ID: restore-and-run-1
Agent: main (Super Z)
Task: Restore infranex-bt from GitHub after sandbox reset and run the web app

Work Log:
- Found sandbox container reset — /home/z/my-project wiped (only download/skills/upload left)
- Ran fullstack init script (platform scaffold at workspace root)
- Cloned infranexbt-bot/infranex-bt (nextjs-platform branch) from GitHub — token still valid
- Copied repo into workspace root; removed scaffold conflicts (tailwind.config.ts, examples)
- Fixed package.json absolute paths (infranex-bt → workspace root)
- Generated APP_SESSION_SECRET + DEVOPS_SECRET into .env; kept platform DATABASE_URL
- bun install (91 pkgs), prisma generate + db push → db/custom.db created
- Restarted platform dev.sh — Next.js dev server on port 3000
- Recovered original login credentials from /tmp/my-project/infranex-users.local.json (5 users seeded)
- Browser-verified: login gate OK, admin login OK, dashboard renders LIVE Finney chain data
  (block 9,070,701, TAO $231.22, 129 subnets, 29,718 miners), CPU Guide multi-subnet picker
  works (17 subnets, SN67→SN123 switch verified), zero runtime errors in dev.log

Stage Summary:
- App is RUNNING on port 3000 with all 7 background workers active and writing to SQLite
- Login: admin / BRJ2-W2GT-WJNF-97VC (also ops01, ops02, analyst01, viewer01 — see scripts/users.local.json)
- Note: DB is FRESH (old container lost it) — deployments/wallets/settings history gone; chain snapshots re-accumulating

---
Task ID: judge-apply-1
Agent: main (Super Z)
Task: Build "Apply fix to deployment" bridge in Judge Lab (user request: yes do that)

Work Log:
- Explored judge types (Recommendation: dimensionKey/label/gain/text), daemon-bridge
  enqueueCommand + apply_config, miner-mindset applyRuntimeOptimization pattern
- Created src/lib/infranex/judge/apply.ts — JUDGE_FIX_RECIPES (quality→fp8+self-verify,
  resource_fit→awq4, throughput→vllm, speed→tensorrt, price→INFANEX_ASK_PRICE_USD from
  priceTargetUsd; availability deliberately manual) + applyJudgeFix() with revision
  snapshot → config env merge → daemon apply_config / mock tick / platform-only ladder
- Created POST /api/judge/apply route (thin validation wrapper)
- judge-view.tsx: ApplyFixButton dialog per fix — deployment picker (same-subnet sort,
  SN badge, price-target preview from run's own priceScore math), post-apply result note
- Fixed Radix controlled-dialog bug: onOpenChange doesn't fire on programmatic open →
  fetch moved to click handler (openDialog); lint-clean (0 errors in touched files)
- Browser-verified end-to-end: sim → Apply → targon-demo-01 → config mutated
  (int4→fp8, +SELF_VERIFY, ask price 0.62→0.31 exactly matching computed target),
  2 revision snapshots created, mock tick note shown
- Committed bc77d4a; pushed to NEW branch platform-live (workspace repo history differs
  from GitHub nextjs-platform lineage — avoided force-push)

Stage Summary:
- Feature LIVE on https://preview (port 3000) + GitHub branch platform-live
- Judge fixes are now one-click applicable; price math self-consistent with judge engine

---
Task ID: judge-apply-visibility-1
Agent: main (Super Z)
Task: Fix "Apply button not found" in Judge Lab — verdict/Apply buttons only existed for the lifetime of one in-session simulation

Work Log:
- Diagnosed root cause: ApplyFixButton rendered only inside VerdictPanel, which renders solely from in-session `result` state (set by a fresh Run simulation). Page reload / nav away destroyed it; Recent runs list offered no way back. Backend (/api/judge/apply + judge/apply.ts) was already complete and working.
- use-judge.ts: widened JudgeRunRecord.result to full SimulationResult shape (dimensionScores + recommendations w/ dimensionKey) — the runs API already persisted it.
- judge-view.tsx: (1) restore-on-load effect — picking a subnet auto-restores its latest run's spec+result; (2) subnet picker onValueChange restores latest run instead of clearing; (3) Recent runs rows converted to clickable buttons (hover highlight, chevron, hint line) via restoreRun() with same-subnet edge handled; (4) Apply trigger button made prominent (default variant, h-7, shadow).
- revisions.ts: added "judge-fix" to RevisionCause union (fixes pre-existing TS error in judge/apply.ts snapshotRevision call).
- Verified typecheck clean (app sources only).

Stage Summary:
- Browser E2E verified: login → Judge Lab → click Targon run row → verdict restored w/ 3 Apply buttons → Apply (response_quality) → dialog lists targon-demo-01 → apply → "Simulated apply — mock deployment ticked".
- DB confirmed: deployment env now INFANEX_QUANT=fp8, INFANEX_SELF_VERIFY=1 (+ earlier INFANEX_ASK_PRICE_USD=0.31); revisions rev3/rev4 snapshot cause="judge-fix" note="before judge fix: Quality upshift (FP8 tier + self-verification)".
- Reload path verified: after reload → pick SN4 → verdict + Apply buttons auto-restore without re-running.
- Screenshots: tool-results/judge-apply-buttons.png, tool-results/judge-restored-verdict.png

---
Task ID: daemon-install-ui-1
Agent: main (Super Z)
Task: Walk user through daemon install — built the missing Install Daemon UI, found+fixed a fatal generated-script bug, proved the chain live

Work Log:
- Found POST /api/daemon/install existed (per-deployment Python daemon, one-shot HMAC secret) but NO UI surfaced it; runbook even pointed users to a panel button that didn't exist.
- Built src/components/deployments/daemon-install-dialog.tsx: editable platform URL (defaults to browser origin, localhost warning), generates script via the API, "Copy full setup command" (heredoc + nohup launch) + "Copy script only", 4-step instructions, secret-shown-once note.
- Wired "Install daemon" button into deployment cards (deployments-view.tsx) — shown for all non-terminal deployments.
- CRITICAL BUG: generated Python had a fatal SyntaxError — JS template literal in buildDaemonScript consumed the \n in the f-string at apply_config's env-export line (daemon-bridge.ts:463), producing an unterminated f-string. The daemon would have died on startup on ANY pod. Fixed with \\n escape.
- Verified: python AST parse of the real generated script OK; ran the daemon live (scripts/gen-daemon-test.ts regenerates it from DB secret via decryptSecret) → telemetry POST accepted → daemonState flipped status "pending" → "online" with lastSeenAt.
- Confirmed daemon telemetry/commands routes are HMAC-authed (no browser session needed from remote pods); install route stays session-guarded.

Stage Summary:
- Operator flow is now: Deployments → card → Install daemon → copy setup command → paste on GPU pod as root → chip online in ~60s → Judge Lab Apply pushes reach the real miner.
- Real-pod caveat: platform URL must be the public URL (preview URL now, VPS domain after migration); daemon process needs a supervisor (systemd/pm2) to survive pod reboots.

---
Task ID: daemon-systemd-autostart-1
Agent: main (Super Z)
Task: Add systemd auto-start generator to the daemon install dialog (user confirmed)

Work Log:
- Extracted the setup-command wrapper into a pure, testable module: src/lib/infranex/daemon-setup.ts (buildDaemonSetupCommand + DAEMON_UNINSTALL_COMMAND).
- Upgraded the installer: writes the daemon py, then systemd present → /etc/systemd/system/infranex-daemon.service (Restart=always, RestartSec=15, WantedBy=multi-user.target → survives pod reboots) + daemon-reload/enable/restart; no systemd (RunPod/Vast containers) → pkill old process + bash watchdog loop relaunch every 15s. Idempotent — re-paste updates in place. Prints "launcher=systemd" or "launcher=watchdog".
- Dialog updates: primary button now "Copy setup command (auto-start service)", steps + tip text refreshed, added a "copy uninstall command" link (disable/remove service + files).
- Fixed test-script Bun type error by using node:fs/child_process; added scripts/test-daemon-setup.ts sandbox E2E.

Stage Summary:
- Sandbox E2E PASS: bash -n OK; python AST OK; sandbox installer ran → chose launcher=watchdog (no systemd in this container, mirrors RunPod/Vast); daemonState flipped status "online" with fresh lastSeenAt. Test artifacts with embedded secrets deleted after run.
- Browser verified: dialog renders the full auto-start setup command + uninstall copy link.
- Operator experience: paste once as root → daemon installed, supervised, auto-starts on reboot; uninstall is one copy-paste.

---
Task ID: daemon-systemd-autostart-2
Agent: main (Super Z)
Task: Verify the systemd/watchdog auto-start installer end-to-end and harden migration paths

Work Log:
- Confirmed heredoc-marker safety: buildDaemonScript never emits INFRANEX_DAEMON_EOF / INFRANEX_UNIT_EOF (grep on generator source).
- Hardened daemon-setup.ts: systemd branch now pkills stray nohup/watchdog daemons before systemctl restart (exactly one daemon after migrating from the old nohup install); uninstall command now runs systemctl daemon-reload after removing the unit.
- Re-ran full E2E from the exact operator-paste command (scripts/gen-setup-command.ts, real secret from DB): bash -n PASS; executed in this container (no systemd → launcher=watchdog, same as RunPod/Vast); daemonState status=online with lastSeenAge 14s.
- Proved crash auto-restart: killed daemon PID 10360 → watchdog revived it as PID 10362 within 15s (log shows second "[infranex-daemon] up").
- Proved idempotency: re-pasting the setup command cleanly replaced the old watchdog+daemon pair.
- Extracted and reviewed the systemd unit: After/Wants=network-online.target, Restart=always, RestartSec=15, Environment=PYTHONUNBUFFERED=1, WantedBy=multi-user.target.
- Noted pkill -f caveat: pattern matches both daemon and watchdog cmdline (intended for cleanup; external pkill of daemon also drops the supervisor — systemd branch immune via Restart=always).
- Security cleanup: deleted tool-results/setup_command.sh, setup_sandbox.sh, sandbox/ tree (embedded HMAC secret); killed test daemon/watchdog processes.

Stage Summary:
- Auto-start installer verified real-world: paste once as root on the GPU pod → daemon supervised (systemd on VMs/bare metal, watchdog in containers) → survives crashes and pod reboots.
- src typecheck clean. Dialog text/button already matched the new behavior.

---
Task ID: daemon-install-automation-tip
Agent: main (Super Z)
Task: Answer "can daemon install be automated?" and surface the provider start-script path in the dialog

Work Log:
- Explained the chicken-and-egg boundary: before an agent exists on the pod, the platform has no channel to execute anything there, so first contact is necessarily out-of-band (SSH paste or provider start script).
- Added an "Automating across pods?" tip to DaemonInstallDialog: the setup command is self-contained + idempotent, so it can be pasted into RunPod template Start script / Vast.ai on-start script / Oracle-Hetzner cloud-init user-data; pods then self-install on first boot and refresh on every restart. Notes one-template-per-deployment (identity/secret is per-deployment).
- src typecheck clean.

Stage Summary:
- Manual paste remains the one-time bootstrap per pod; provider start scripts are the zero-code automation path; SSH auto-install and enrollment-token bootstrap one-liner identified as opt-in future work.

---
Task ID: git-push-platform-live-2
Agent: main (Super Z)
Task: Push accumulated work (daemon auto-start + dialog automation tip) to GitHub

Work Log:
- Located repo infranexbt-bot/infranex-bt via worklog; no remote/credentials in workspace after sandbox reset — user supplied a fresh classic token (ghp_...).
- ls-remote: nextjs-platform @ 3dab7af, platform-live @ bc77d4a (previous push point). Local HEAD ecbd57a confirmed descendant (fast-forward, no force).
- Pushed HEAD:platform-live — bc77d4a..ecbd57a; ls-remote verifies remote == local HEAD.
- Token NOT persisted (no remote added, nothing on disk); used ad-hoc in push URL only.
- Outstanding security items flagged to user: revoke the pasted token (plaintext in chat, classic repo-wide scope); .env still tracked in repo and present in pushed history.

Stage Summary:
- GitHub platform-live is now current with the workspace: systemd/watchdog auto-start installer, hardened setup module, dialog automation tip, E2E scripts, worklog.

---
Task ID: app-analysis-1
Agent: main (Super Z)
Task: Full product research — what the app is, menu-by-menu analysis, operating advice

Work Log:
- Mapped navigation: 15 views in 4 groups (Intelligence / Operations / Platform / Administration) from sidebar.tsx.
- Read README (product pitch, data sources, stack), per-view on-screen sections, devops trigger vocabulary, optimization action set, economics lib, docs/ tree (setup-guide + screenshots).
- Delivered in-chat analysis; no code changes.

Stage Summary:
- Product identified as: Bittensor intelligence + mining operations platform; core loop = research subnets → deploy miner → install daemon → judge → apply fixes → monitor/optimize.

---
Task ID: handbook-pdf-1
Agent: main (Super Z)
Task: Produce the Infranex BT Operator Handbook as a PDF (user: "save this and provide me pdf")

Work Log:
- Loaded pdf skill chain in full: SKILL.md, fonts.md, briefs/report.md (complete), typesetting/cover.md, overflow.md, palette.md, typography.md, pagination.md.
- Routed Report (English A4, no emoji). Cover: Template 07 Crystal Blue (fixed palette per cover.md) via html2poster.js at 794px; passed poster_validate check-html + cover_validate.js (no overlaps).
- Body: ReportLab TocDocTemplate + multiBuild, clickable TOC, FreeSerif + install_font_fallback, Template 07 body palette, dual page numbering (hidden cover / roman TOC / arabic body reset), CondPageBreak 25% before H1s, Paragraph-wrapped proportional tables with repeatRows, stat band + callout flowables.
- Fixed env issues: chinese/ has no static NotoSansSC (variable TTF unreadable by ReportLab -> pointed fallback names at NotoSerifSC statics); cover page 595.9pt vs A4 595.3pt -> tightened normalize tolerance to 0.4pt.
- QA chain: code.sanitize, meta.brand, pages.clean (0 blank), font.check (0 issues), toc.check (0 errors), pdf_qa.py PASS (12 checks).

Stage Summary:
- Deliverables: download/infranex-bt-operator-handbook.pdf (14 pages, ~197KB, vector, clickable TOC) + download/infranex-bt-handbook-cover.html (cover source).
- Scripts persisted: scripts/handbook_content.py (content), scripts/gen_handbook_pdf.py (builder), scripts/handbook_cover.html.

---
Task ID: operator-handbook-pdf-1
Agent: main (Super Z)
Task: Complete step-by-step workflow guide as PDF (user: "yes provide complete step by step guide of the workflow")

Work Log:
- Loaded pdf skill; routed to Creative Flow brief (handbook/guide); read creative-flow.md + fonts.md + overflow/pagination/typography/palette/cover/cover-backgrounds/charts typesetting files
- Verified exact UI workflow from source: deploy-wizard 5 steps (Subnet/Requirements/GPU/Install/Hotkey & run), daemon-install-dialog (SSH->paste->60s->Online, systemd vs watchdog, idempotent, provider start-script automation), judge-view (Re-mine profile -> Run simulation -> Verdict -> ApplyFixButton deployment picker -> apply_config push ladder), /api/judge/apply takes deploymentId
- Built 886-line HTML handbook (download/infranex-operator-handbook.html): Crystal Blue design (Template 07 dark cover #0a1628 + light-blue body #f5f8fc, one hue family ~215), 11 sections: cover, golden path (6-phase flow), Phase 0 setup, Phase 1 subnet, Phase 2 deploy wizard, Phase 3 daemon, Phase 4 judge+when-to-judge table, Phase 5 operate (14 triggers), troubleshooting, rhythms+quick reference, ending page
- poster_validate: fixed divider text-line collisions (pseudo-element ::after instead of DOM line), moved cover glows into cover background (no bleed), aligned screen bg; cover page itself 0 overlaps; remaining validator flags = body table cells (cover_validate is documented cover-ONLY, out of scope for flowing docs)
- Rendered via html2pdf-next.js (installed pagedjs via bun): 11 pages vector; bound 65 em-dashes to preceding words (nbsp) to fix line-start punctuation
- Post-process (scripts/postprocess_handbook.py): stamped Arabic page numbers 1-9 on body pages (cover+ending skipped), set metadata Title/Author Z.ai/Subject/Creator; pypdf extract_text KeyError(bbox) bug -> corruption scan via pymupdf instead: 0 U+FFFD
- pdf_qa final: all critical checks PASS (no overflow, no blank pages, fill ratio ok, full-bleed cover, symmetric margins, fonts embedded); 2 benign warnings = English opening quotes at line start (legitimate)

Stage Summary:
- DELIVERED: download/infranex-operator-handbook.pdf (11 pages, 450.6 KB, vector, page-numbered) + download/infranex-operator-handbook.html (editable source)
- Content: golden path one-liner (Subnet->GPU->Daemon online->Judge->Apply->Operate), daemon-before-judge timing rule, every button name verified against source

---
Task ID: deploy-page-simplify-1
Agent: main (Super Z)
Task: Simplify the deployment page — clear step-by-step deploy flow on a single page (user: "i need clear step by step options in the deployment page for deploying the miner in single page, simplify more")

Work Log:
- Rebuilt the deploy flow as an INLINE 4-step stepper on the Deployments page (no popup): 1 Subnet → 2 GPU (requirements strip folded into this step) → 3 Deploy (review summary + Rent & deploy + live install log) → 4 Go live (Register on-chain + Connect daemon + What's next)
- Created src/components/deployments/deploy-stepper.tsx (~700 lines): clickable step rail showing each step's picked value (α4 · Targon / RTX 4090 · $0.34/hr / installed / live UID), always-visible "Your picks" summary panel, auto-advance from install to Go live when miner starts, post-live "Deploy another miner" reset, wallet wizard + daemon dialogs bound to the in-flight deployment, steps lock once the GPU is rented
- Created deploy-preselect.ts module singleton (take-once semantics) replacing the app-root dialog singleton; page.tsx entry points now navigate to Deployments + preseed the stepper: opportunity "Start mining" → subnet, GPU catalog "Provision" → offer
- deployments-view.tsx: simplified header, stepper leads, cards below ("Your deployments · N active"), DevOps Engine demoted to collapsed <details> "Advanced — deploy on your own GPU hosts" at page bottom
- Deleted deploy-wizard.tsx (old 5-step dialog); fixed lint error in analytics-view.tsx (manual useMemo blocked React Compiler optimization)
- Wallet name prefill converted from setState-in-effect to derived-at-render (effWalletName) to satisfy react-hooks/set-state-in-effect
- Browser E2E (agent-browser): step 1 live chain list → select α4 Targon → step 2 requirement strip "Needs ≥ 24GB VRAM" + burn-entry warning + offer list + miner/wallet inputs → step 3 review rows + honest no-key error toast → (with mocked provider boundary) install log with step progression → auto-advance to step 4 (Register/daemon/next-steps blocks) → daemon dialog opens → DevOps section collapses/expands → "Start mining" preseeds α64 at step 2 → "Provision" preseeds H100 offer at step 1 → mobile 390px layout OK (2×2 grid)
- Verification notes: no provider keys in DB → /api/gpu-offers returns 0 offers (MOCK-PURGE-2, honest empty state); real rental path verified previously via same API/hooks; deployment lifecycle mocked at browser level only for UI-state verification

Stage Summary:
- Deploy flow is now ONE page, FOUR steps, zero popups; all entry points converge on it
- Lint 0 errors; tsc src/ clean; dev.log clean; committed locally (deploy-page-simplify-1)

---
Task ID: git-push-platform-live-3
Agent: main (Super Z)
Task: Push deploy-stepper work + pending snapshot to GitHub (user: "push this to github")

Work Log:
- Verified local main descends from platform-live tip ecbd57a (fast-forward, no force needed)
- Committed pending .alpha-price-history.json runtime snapshot (90e2ddc)
- Token from prior session still valid; used ad-hoc in push URL only, not persisted on disk
- Pushed main:platform-live → ecbd57a..90e2ddc; ls-remote confirms remote == local HEAD

Stage Summary:
- GitHub platform-live now current: single-page 4-step deploy stepper, preselect entry points,
  old wizard removed, price-history snapshot. 10 commits delivered this push.
- Standing reminder: revoke the shared token (plaintext in chat); .env still tracked in repo.

---
Task ID: deploy-pending-fix-1
Agent: main (Super Z)
Task: Diagnose "why is deployment showing Pending" (user screenshot: targon-01 frozen at Approve=Running) and fix the root cause

Work Log:
- Root cause: the deploy pipeline advances ONE state per tick, and ticks came ONLY from the
  browser (deploy-stepper.tsx / deployments-view.tsx pollers via POST /api/deployments/[id]/tick).
  No server worker called tickDeployment — so closing the dialog, backgrounding the tab, or a
  dev-server restart froze the deployment mid-pipeline forever (state "approved" renders as
  Approve=Running + all later steps Pending).
- Extra finding: DB was fresh (0 deployments) — the user's targon-01 was from a previous DB
  generation; and port 3000 was DOWN during the session: run-dev.sh / run-dev-keepalive.sh
  pointed at nonexistent /home/z/my-project/infranex-bt with a bogus DATABASE_URL (stale clone
  path from an earlier restore), and ad-hoc nohup/setsid server starts were killed when tool
  calls ended. Fixed both scripts to PROJECT_DIR=/home/z/my-project; now start the server via
  the platform's own .zscripts/dev.sh (bun install + db:push + next dev & + disown) — survives
  tool-call teardown.
- FIX (DEPLOY-2): new src/lib/infranex/deployment/ticker.ts — runDeploymentTickerPass() ticks
  every deployment in active states (requested/approved/provisioning/provisioned/setup/ready/
  deploying) every 5s. Terminal states excluded; "stopped" never auto-restarts; on-chain
  registration stays a manual action; provider failures land in "failed" with the real error
  (honest, no silent hang). Wired as worker #5 "deploy-ticker" in workers.ts (INTERVALS.deployTick).
- Verified: tsc clean on touched files, eslint 0 errors.
- E2E (scripts/test-deploy-ticker.ts): created mock deployment, NO browser, NO script-side
  ticks — server ticker advanced requested→approved→provisioning→provisioned→setup→ready→
  started in ~32s, all 6 steps done, then auto-cleanup deleted the row. PASS.

Stage Summary:
- Deployments can no longer freeze at "Pending": the pipeline self-advances server-side even
  with the browser closed; real provider errors surface as "failed" with the actual message.
- Dev server restored via platform dev.sh (pid changes across restarts; port 3000 confirmed).
- User guidance: targon-01 no longer exists (fresh DB) — redeploy from Deployments; if a deploy
  is ever interrupted, the ticker resumes it automatically within seconds.

---
Task ID: rename-validator-lab-1
Agent: main (Super Z)
Task: Rename "Judge Lab" to "Validator Lab" across user-facing UI (user asked for rename suggestions)

Work Log:
- Chose "Validator Lab" (user's first option; singular = correct Bittensor term; keeps the
  simulate+apply "lab" concept). Alternatives offered: Validator Scores, Score Simulator.
- Renamed user-facing strings only — sidebar label, page title + eyebrow, judge-view header/
  buttons/badges ("Quality Judge"→"Quality Validator", "Mining judge profile…", "Scoring
  against validator…"), cpu-guide-view guide copy (~15 strings: "judge profile/weights/shape/
  sim" → "validator …"), deploy-stepper + daemon-install-dialog copy, service-health runbook
  line, simulate.ts disclaimer. Internal identifiers untouched: /api/judge routes, judge-view/
  use-judge/apply.ts, JudgeKind + judgeKind + quality_judge type keys, route key "judge".
- Also reseeded users this session (fresh DB had 0 AppUser rows → login 401s) from the
  /tmp wipe-proof mirror; original codes preserved; session secret regenerated; server
  restarted via .zscripts/dev.sh; login verified 200 + session cookie.
- Verification: rg sweep shows zero user-facing "Judge" left (only internal keys/comments);
  tsc clean on src; eslint 0 errors (1 pre-existing unused-disable warning); live check:
  login → GET / HTML contains "Validator Lab", no "Judge Lab".

Stage Summary:
- Nav 04 is now "Validator Lab" everywhere the user can see; all judge APIs/types unchanged so
  zero functional risk. Handbook PDFs still say "Judge Lab" (static files) — regenerate on request.

---
Task ID: rename-validator-lab-2
Agent: main
Task: Second-pass sweep of "Judge Lab"/"judge" wording missed by the first rename pass (follow-up to rename-validator-lab-1).

Work Log:
- Swept src/ for remaining "Judge Lab"/"Judge for"/"Judge fix"/"judge profile" strings.
- User-visible strings renamed: extract.ts buildSummary outputs ("Judge for X classified…"
  → "Validator for X classified…"); apply.ts daemon apply note ("Re-run the Judge…" →
  "Re-run Validator Lab…"); revision snapshot cause "judge-fix" → "validator-fix" + note
  "before judge fix:" → "before validator fix:"; /api/judge/apply 500 fallback error
  "Judge fix apply failed" → "Validator fix apply failed".
- RevisionCause union updated in deployment/revisions.ts (judge-fix → validator-fix; DTO
  cause is RevisionCause|string so old DB rows still render); added violet chip style for
  "validator-fix" in revisions-dialog CAUSE_CHIP.
- Comment/doc consistency pass: apply.ts header, service.ts, types.ts, simulate.ts,
  use-judge.ts, extract.ts, judge-view.tsx, cpu-guide-view.tsx, api/judge/sync/route.ts.
  devops-monitor.ts "can't judge thermals" kept (English verb, not the feature).
- Internal identifiers intentionally stable: /api/judge/* routes, use-judge, JudgeKind,
  judgeKind, quality_judge, nav key "judge", JudgeProfile prisma model.
- Verification: rg sweep zero matches for "Judge Lab|Judge for|Judge fix|the Judge|judge
  profile|judge weights"; tsc clean on src/ (pre-existing errors only in scripts/ + skills/
  which are outside the app build); live: login 200, GET /api/judge/profiles?netuid=67 → 200
  with renamed summary text.

Stage Summary:
- Rename fully complete — zero user-visible or doc-level "Judge Lab"/"judge" wording left in
  src/; all APIs/types stable; committed locally as rename follow-up. NOT pushed yet: no git
  remote configured (prior push used ad-hoc token URL) and no stored credentials — awaiting
  fresh token or user-side push.

---
Task ID: git-push-platform-live-4
Agent: main
Task: Push rename follow-up + pending commits to infranexbt-bot/infranex-bt platform-live.

Work Log:
- User re-supplied GitHub PAT (same ghp_iXdt… as prior session); used as ad-hoc push URL,
  never written to disk or .git/config.
- git push main:platform-live → success (826d1dd..5d342d1). Remote head verified via
  ls-remote = 5d342d1 = local HEAD (5d342d1 is a platform autosave commit on top of the
  rename commit d92c754, matching the existing UUID-message autosave pattern in history).

Stage Summary:
- platform-live now contains: Validator Lab rename (826d1dd) + follow-up sweep (d92c754) +
  autosave (5d342d1). Token shared twice in chat — user should rotate/revoke and prefer
  fine-grained tokens (Contents: R/W, short expiry) for future pushes.

---
Task ID: operator-handbook-pdf-2
Agent: main (Super Z)
Task: Regenerate Operator Handbook PDFs with Validator Lab naming + recent platform updates (user: "provide updated operator handbook pdf").

Work Log:
- Reused the approved Creative Flow handbook (download/infranex-operator-handbook.html) —
  design untouched, content edits only. scripts/update_handbook_rename.py applied 44
  exact-match replacements (each asserted count==1; two section titles needed \u00a0 NBSP
  before the em-dash): Judge Lab -> Validator Lab across cover chips/path, golden path,
  phases 0-5, when-to-run table, troubleshooting, rhythms, quick reference, ending
  ("Mine. Validate. Apply. Repeat."); "simulated judge" -> "simulated validator";
  "re-judge" -> "re-validate"; cover edition 1 -> 2. Phase 2 lifecycle copy updated for
  DEPLOY-2: "auto-advances on the platform server even if you close the tab".
- Re-rendered via html2pdf-next.js (794x1123, Paged.js) -> postprocess_handbook.py (page
  numbers 1-9 on body pages, metadata Subject now says Validator Lab; corruption scan
  migrated to pymupdf to dodge pypdf KeyError(bbox)) -> pdf_qa: 11 checks PASS, same 2
  benign line-start-quote warnings as the approved original. PDF text scan: 0 judge, 17
  Validator Lab, 11 pages.
- Secondary ReportLab variant kept consistent: scripts/update_handbook2_rename.py updated
  handbook_content.py (12 targeted rules + global Judge Lab) + cover html (Validate-to-Apply
  loop, Edition 2); cover re-rendered via html2poster.js -> tool-results/handbook_cover.pdf;
  gen_handbook_pdf.py rebuilt body + merged -> download/infranex-bt-operator-handbook.pdf
  (14 pages). pdf_qa --skip-cover: full PASS, TOC populated. 0 judge mentions.

Stage Summary:
- DELIVERED: download/infranex-operator-handbook.pdf (11 pp, Edition 2, Validator Lab,
  server-side ticker documented) + infranex-bt-operator-handbook.pdf (14 pp, consistent).
  HTML sources delivered alongside per skill rule. Update scripts persisted for future edits.

---
Task ID: git-push-platform-live-5
Agent: main
Task: User-confirm sync of handbook updates to GitHub.

Work Log:
- Verified working tree clean (runtime churn swept into platform autosave 4a8ee58).
- Pushed da3f281..4a8ee58 main:platform-live; ls-remote confirms remote head = local head.

Stage Summary:
- platform-live fully synced: Validator Lab rename + Edition 2 handbooks + autosave.

---
Task ID: overlay-1-2-gap-fixes
Agent: main (Super Z)
Task: Fix the two per-subnet requirements gaps: (1) profiler ignores user-provided
SubnetOverride.githubUrl, (2) pod docker image came from fake category templates.

Work Log:
- OVERLAY-1 (subnet-requirements.ts): override layer added to buildProfile —
  SubnetOverride.githubUrl (normalized: bare domains, .git suffix, /tree/branch)
  now takes precedence over the on-chain identity link; "override" provenance
  source + validation notes; confidence logic unchanged.
- OVERLAY-1 (override route): PUT/DELETE now invalidate the 6h SubnetRequirements
  cache so the next pull re-fetches from the user's repo immediately.
- OVERLAY-2 (config.ts): pod image no longer fake "bittensor/*" placeholders —
  resolvePodImage() selects runpod/pytorch CUDA devel image matched to the
  subnet's parsed min CUDA (11.8 / 12.1 ladder; RunPod deploy API has no command
  override, so pod image must be keep-alive + sshd). SubnetProfileHint passed
  from POST /api/deployments (pullSubnetRequirements, cached) into
  createDeployment → buildDeploymentConfig: imageSource + repoDockerfileBase
  recorded, entrypoint/python/cuda from profile. Repo's real Dockerfile still
  rules the miner image via in-pod docker build (installer step 5).
- Robust Dockerfile FROM parsing: multi-stage → last concrete FROM; skips
  ${VAR} indirection and scratch; --platform flag handled.
- engine.ts: approve-step mode line no longer infers from imageName; profileHint
  plumbed through CreateDeploymentInput.
- UI: deployments-view shows "Repo Dockerfile base" row; client type mirror synced.
- Tests: scripts/test-overlay-fixes.ts (25 unit checks) PASS;
  scripts/test-profiler-e2e.ts (10 authenticated e2e checks incl. override
  round-trip PUT→repo wins→invalid URL rejected→DELETE reverts) PASS;
  test-tier2.ts 58 PASS / 0 FAIL; test-tier4.ts PASS; tsc clean for touched code.
- Committed cb62b1a. NOT pushed: no git remote/credentials in workspace (by
  design after PAT exposure) — push to infranexbt-bot/infranex-bt platform-live
  pending fresh fine-grained token from user.

Stage Summary:
- Both gaps fixed and verified e2e. Deployment configs now carry
  imageSource="subnet-requirements" + repoDockerfileBase; profiler honors team
  overrides with cache invalidation. Local commit cb62b1a awaits push.

---
Task ID: tao-opportunity-score-1
Agent: main (Super Z)
Task: Research TAO staking/delegation and build the "TAO Opportunity Score"
home-screen feature (mine vs stake, in numbers — the user's killer feature).

Work Log:
- Research (web search, Sept 2026): root staking = TAO-denominated, ~5.25-5.65%
  APY market estimates, validator take 9-20% (chain default 18%); dTAO subnet
  staking = alpha-denominated, dividends lane ≈42% of subnet emission, alpha
  price risk + pool slippage; root yield decays over time. TAO spot ≈ $225.
- staking.ts (new): root strategy from market baseline (chain proxy as note —
  live run showed the naive emission/stake proxy reads 1.39% vs observed 4-5%,
  so baseline is authoritative); subnet pool strategies = emission×365/stake ×
  0.42 × (1−take) × (1−2% fee), thin pools skipped, deep+calm → medium risk.
- opportunity-score.ts (new): best mining runner (Miner's Ledger full P&L,
  meetsMinimum, optional GPU cap) vs best staking lane, compared on monthly
  net ROI %; score = 50+50·tanh(edge/8); confidence weighted; ₹ projections.
- dashboard-view.tsx: OpportunityScoreCard hero — score ring, recommended
  strategy block (mine X: ₹/mo, TAO/mo, GPU, risk, confidence), alternative
  block (stake: net APY, ₹/mo on capital), capital input (localStorage),
  notes, Open opportunities link.
- Verified e2e: 21 synthetic checks PASS; live Finney scan (129 subnets,
  TAO $221): score 98 → mine Chutes SN64 (₹1,35,625/mo net, 8.571 TAO/mo,
  RTX 4090, low risk, 62% conf) vs stake rec4ll 67.5% net APY (high risk);
  browser-verified rendering via agent-browser screenshots; tier2 58 PASS;
  lint + tsc clean.
- Committed 7702586. Push to platform-live still pending user token (both
  this and cb62b1a — overlay fixes — are local).

Stage Summary:
- Feature LIVE on the dashboard. Phase 2 candidates: live FX rate, validator
  take picker (9-18%), staking execution via wallet integration, auto-rebalance.

---
Task ID: trust-loop-1
Agent: main (Super Z)
Task: Build the Trust Loop — projected vs actual earnings per miner, with calibration
feeding the TAO Opportunity Score (my pick from the "what should we build next" shortlist).

Work Log:
- Found the old estimatedRevenue still came from CATEGORY_REVENUE_ESTIMATE (fake
  category templates) — Trust Loop starts by making the projection real.
- Prisma: Deployment += projectedMonthlyTao, projectedGrossMonthlyUsd,
  projectedNetMonthlyUsd, projectionSource, projectionRampWeeks, projectedAt (db pushed).
- trust.ts (new): computeDeploymentProjection (live chain per-earning-miner rate,
  loadProfitabilityConfig for net leg; honest null when chain offline/zero emission);
  evaluateTrust bands (on-track >=0.85 / lagging >=0.60 / off-track, warming-up <3
  earning days due to bond-EMA ramp, no-baseline/no-data honest states); getTrustReport
  (per-miner rows from EarningsDaily + SpendLedger, portfolio pace + verdict counts,
  calibration = day-weighted accuracy over miners with 7+ earning days).
- opportunity-score.ts: TrustCalibrationInput option; headline confidence now RETURNED
  (was computed but dropped) and blended 70% model + 30% observed accuracy when
  calibration has >=7 miner-days; note explains the provenance.
- config.ts: cost.revenueSource ("live-chain" | "category-fallback"), projection option;
  engine.ts: projection plumbed into createDeployment + DeploymentRecord/toRecord;
  POST /api/deployments snapshots the projection at creation.
- UI: GET /api/trust + use-trust.ts hook (+ verdict chip styles); miners-view verdict
  chip + "Proj. vs actual" TAO/mo column (est chip for pre-trust rows); dashboard
  TrustLoopCard ("Did we earn the promise?" — projected vs actual pace, fleet accuracy,
  verdict counts, calibration note, honest empty state) + score card confidence chip
  uses the calibrated headline.
- Debugging note: tool-output renderer in this session eats literal "[m" sequences —
  cost 3 detours; config.ts was never broken (IMAGES[major] intact, bun build OK).
- Dev server had to be restarted after prisma db push (stale client made new columns
  read undefined). Port-3000 tangle cleaned; relaunched via nohup run-dev.sh.
- Tests: scripts/test-trust-loop.ts 27 PASS (verdict units, calibration blend incl.
  thin-sample rejection + clamping, live SN8 projection, authed e2e: seeded fleet
  A on-track 90% / B off-track 50% / C warming-up / D no-data, calibration only from
  >=7-day miners, spend rollup; cleanup verified). tier2 58 PASS, tier4 76 PASS,
  tsc + eslint clean (tier2/tier4 gained revenueSource field).
- Browser-verified: dashboard Trust card + empty state render, My Miners renders,
  0 page errors. Committed 75eaba5. NOT pushed (still awaiting user's fine-grained
  PAT; pending pushes now: cb62b1a, 7702586, 75eaba5).

Stage Summary:
- Trust Loop LIVE: every new deployment carries a chain-measured promise, actuals are
  paced into verdicts, and the Opportunity Score's confidence is now earned from
  observed accuracy once 7+ miner-days exist. Next candidates: stake portfolio
  (read-only first), auto-rebalance, live FX + validator-take picker.

---
Task ID: score-runnerups-1
Agent: main (Super Z)
Task: Answer "why does the TAO Opportunity Score show only Chutes subnets?" and fix the visibility gap behind it.

Work Log:
- Diagnosed live: the score runs ALL 128 mining subnets through the Miner's
  Ledger, but only 7 clear the net-profit bar (net>0 AND meetsMinimum) —
  Chutes SN64 leads that pool at ~471%/mo net ROI (RTX 4090, $1.6k/mo net),
  followed by Epago #36 (447%/mo, H200), Targon #4 (304%), NOVA #68 (257%),
  Teutonic #3 (139%), KubeTEE #90 (52%), SN35 (84%). 118/128 are net-negative
  under current cost settings (GPU rent > emission share).
- Root cause of the perception: the hero card is a single verdict by design
  (1 mining pick + 1 staking lane) AND it computed alternatives (top-3
  runners) but never rendered them — the losing subnets were invisible.
- Fix (opportunity-score.ts): exposed miningCandidates + miningEvaluated on
  the result; new always-on note "Verdict = best of N net-positive mining
  subnets (128 evaluated) vs best staking lane — runner-ups were scored,
  just not picked".
- Fix (dashboard-view.tsx): Runner-ups chip row under Alternative — mining
  runner-ups (netuid, name, ROI %/mo, GPU) + staking runner-ups (name, net
  APY), excluding picked netuids; footer now reads "Scored 128 mining
  subnets · 7 net-positive — the card pits the best against the best staking
  lane"; notes slice 3→4.
- Verified: unit tests ALL PASS, live smoke test shows the new note, tier2
  58 PASS / 0 FAIL, tsc + eslint clean, browser-verified both screenshot
  regions (runner-ups chips + notes/footer), 0 page errors.
- Committed 8b17e97. Push still pending user's fine-grained PAT (pending:
  cb62b1a, 7702586, 75eaba5, 8b17e97).

Stage Summary:
- The card no longer looks Chutes-only: runner-ups are visible with their
  ROI/APY, and the note + footer explain the pool size. Chutes still wins
  on live data — that is the honest verdict, now transparently justified.

---
Task ID: hydration-guard-1
Agent: main (Super Z)
Task: Review uploaded console error (hydration mismatch) from Pasted Content_1789503719417.txt.

Work Log:
- Read the full 508-line React 19 error capture. Cataloged every diff node:
  ALL were the same attribute `fdprocessedid="<random id>"` on buttons and
  inputs (13 sidebar links, header search, theme toggle, notifications and
  avatar dropdowns, hero buttons, capital input, table sort buttons, every
  row action trigger). Zero content/prop/structure mismatches.
- Verified `fdprocessedid` appears nowhere in the codebase; web search
  confirms the source: McAfee WebAdvisor extension (also FDM/form-filler
  tools) stamps it onto every interactive element before React hydrates.
- Verdict: NOT an app bug — external DOM mutation; React leaves the
  attribute, app unaffected. But console noise buries real errors.
- Hardening (layout.tsx EXTENSION-GUARD-1): pre-hydration inline script
  strips [fdprocessedid] and a 20s attribute-filtered MutationObserver
  catches late stamps; disconnects after hydration window.
- Verified in browser: guard script served; manually stamped attribute
  auto-removed in <1s; login → dashboard hydrates with 0 console errors;
  tsc + eslint clean.
- Committed 10f0601. Push queue: cb62b1a, 7702586, 75eaba5, 8b17e97,
  10f0601 (all awaiting user's fine-grained PAT).

Stage Summary:
- Console error diagnosed as extension interference (McAfee WebAdvisor /
  similar), with app-side guard shipped so every user's console stays clean
  regardless of extensions. User-side option: test in incognito or disable
  the extension — error vanishes either way.

---
Task ID: github-push-1
Agent: main (Super Z)
Task: "Save the project and push to GitHub."

Work Log:
- Verified local state clean: committed the pending alpha-price-history
  scanner sync (5762fdb) and the one-shot push helper (ffa1758).
- Secret-scanned all tracked files before push: no live credentials; the
  only match is a truncated, unusable ghp_iXdt… prefix in historical notes.
- Confirmed NO credentials exist in the environment (no env token, no
  ~/.git-credentials, no ~/.netrc, no gh CLI) — remote was removed by
  design after the old PAT exposure.
- Created scripts/push-live.sh: pushes main → platform-live on
  infranexbt-bot/infranex-bt; token passed transiently via TOKEN env var,
  embedded only in the one-shot push URL, never persisted.

Stage Summary:
- Everything is saved and push-ready. BLOCKED only on a fresh fine-grained
  PAT (repo: infranexbt-bot/infranex-bt only; Contents: Read/Write; short
  expiry). User supplies TOKEN → `bash scripts/push-live.sh` → done.

---
Task ID: github-push-2
Agent: main (Super Z)
Task: Execute the GitHub push with the user-supplied token.

Work Log:
- User re-supplied the same classic PAT (ghp_iXdt…). Verified via API: HTTP
  200 on infranexbt-bot/infranex-bt; default branch nextjs-platform; public
  repo; platform-live head was 4a8ee58 (auto-checkpoint).
- Fetched platform-live and compared: remote had ZERO commits not in local
  main (strict ancestor) → clean fast-forward, no force needed.
- Pushed via scripts/push-live.sh (token transient in one-shot URL):
  4a8ee58..2c41cfc main -> platform-live. 16 commits landed, incl. Trust
  Loop (75eaba5), score runner-ups (8b17e97), hydration guard (10f0601).
- Post-push verification: remote head = 2c41cfc (matches local main);
  spot-checked opportunity-score.ts and layout.tsx EXTENSION-GUARD-1 present
  on platform-live via raw fetch.
- Hygiene: rg over .git/ metadata found zero token traces; no git remote
  configured (still credential-free by design); token not written to any
  file or config.

Stage Summary:
- ALL pending work is now on GitHub platform-live. Follow-up for the user:
  rotate/revoke the PAT (it has now been shared in chat twice) and generate
  a fresh fine-grained one only when the next push is needed.

---
Task ID: stake-portfolio-1
Agent: main (Super Z)
Task: User confirmed "yes" — build the read-only Stake Portfolio view and answer (1) where earned alpha shows up, (2) how alpha converts to TAO.

Work Log:
- Probed live Finney (spec 458, block 9.07M) to find supported queries:
  TotalHotkeyAlpha is a DOUBLE MAP (hotkey, netuid) → u64 rao; no
  stakeInfo/swapRuntimeApi in polkadot-js types → α→TAO must come from
  the platform's own pool spot prices. Probe saved as scripts/probe-stake-queries.ts.
- Built src/lib/infranex/stake-portfolio.ts: batched .multi reads of
  TotalHotkeyAlpha across all ~129 netuids per hotkey, Owner(hotkey) →
  coldkey, system.account(cold) free/reserved TAO, positions priced at
  subnet moving price with 24h drift; pure buildHotkeyPortfolio() for
  unit tests; human units (rao/1e9).
- API GET /api/wallets/stake-portfolio: ?hotkey= (max 8, SS58-validated)
  else platform registry (WalletProfile.hotAddress + Deployment.hotkey);
  enriches with EarningsDaily lifetime rollup, wallet labels, deployment
  counts. Read-only — no signing, no secrets (WALLET-ECON-1 respected).
- UI: Stake Portfolio card in My Miners (stake-portfolio-card.tsx) —
  totals row (staked α TAO value / coldkey free TAO / lifetime mined),
  per-hotkey positions table, "How payouts work" guide answering both
  questions in-product (btcli wallet overview / stake remove / taostats),
  honest empty states. use-stake-portfolio.ts polls every 60s.
- Tests: scripts/test-stake-portfolio.ts — 25 PASS / 0 FAIL (unit math,
  live chain: 1.2335 α on α64 Chutes @ 0.2977 = 0.3672 TAO = $80.72,
  coldkey free 0.044 TAO; API 401 gate + query/registry resolution).
- tsc + eslint clean; browser-verified empty AND populated states
  (temp wallet profile registered, screenshotted, deleted) — 0 console
  errors. Committed 9278986.

Stage Summary:
- Platform now answers the payout questions natively: alpha lands as
  staked α on the hotkey (visible in card / btcli wallet overview /
  taostats), unstake (btcli stake remove) converts α→TAO onto the
  coldkey free balance (also shown in card). Push pending user's fresh
  fine-grained PAT (queue: 9278986). Reminder: old classic PAT ghp_iXdt…
  shared twice in chat — must be revoked.

---
Task ID: runbook-cashout-1
Agent: main (Super Z)
Task: User confirmed "yes" — add a Cash-out runbook entry (alpha → TAO → exchange) to the Runbook view.

Work Log:
- Read runbook-view.tsx structure (phase cards + threshold strip + warnings).
- Added RUNBOOK-2 card between Phase 3 grid and the registration reminder:
  4 numbered steps with btcli command blocks (wallet overview → stake
  remove incl. --all-alpha + safe-staking note → wallet balance → wallet
  transfer with test-transfer rule) + 4 watch-outs (execution-time pool
  rate, root needs no conversion, mnemonic never online, test transfers).
- Header quick-action row: added "Stake Portfolio" button (jump to the
  STAKE-PORTFOLIO-1 card), kept DevOps + Monitoring; intro paragraph
  mentions the cash-out runbook.
- Verified: tsc clean (my files), eslint OK, browser screenshot of the
  rendered card — 0 console errors. Committed eceb79e (an automated
  checkpoint dee0e73 had captured the same edit mid-flight — both in
  history, no content conflict).

Stage Summary:
- The full mining loop is now documented in-product: mine → watch alpha
  accrue (Stake Portfolio card) → cash out (Runbook cash-out steps) →
  transfer to exchange. Push queue for platform-live: 9278986, e8c344d,
  eceb79e (+ checkpoint dee0e73) — awaiting user's fresh fine-grained
  PAT; classic PAT ghp_iXdt… still must be revoked.

---
Task ID: research-epago-1
Agent: main (Super Z)
Task: Research why Dashboard says "Mine Epago α36" while Opportunities shows Epago 46.9/WATCH

Work Log:
- Read both scoring engines: dashboard = opportunity-score.ts (computeOpportunityScore), opportunities = use-network.ts mergeOpportunities → miner-score.ts (Miner's Ledger v2)
- Logged in via API (admin), pulled live snapshot /tmp/network.json (block 9,078,200, TAO $217.82)
- Ran engine on live data via scripts/research-epago-mismatch.ts:
  * Epago composite 46.9 → WATCH, rank 19/128; pillars net_roi 97, seat_safety 12, alpha_econ 52.2, earning_reality 8, fit 25
  * Dashboard: Epago #1 of 7 net-positive by ROI%/mo (575.6%/mo, net $15,267/mo) vs staking 5.63%/mo → ring 98
- Found data bug: chain.ts:739 emissionEnabled = !emEnabled?.isEmpty — RPC subnetEmissionEnabled returns empty for SN29/35/36; scanner marks them FALSE while their own per-neuron emission vectors show 7.0 / 6.5 / 55.6 TAO/day actively paid (SN36: 19 miners, 2 rewarded, price 0.094 TAO)
- Flag floors 3 pillars in miner-score.ts (seat_safety→12, earning_reality→8, fit→25)
- Counterfactual via scripts/research-epago-counterfactual.ts: flag=true → composite 64.7 → RUN (pages would agree)
- Side finding: dashboard confidence 54% is itself dragged down by the buggy composite (o.confidence = score/100 = 0.47)

Stage Summary:
- Root cause is TWO-fold: (1) by design the pages score different things (ROI%/mo mine-vs-stake verdict vs 5-pillar composite with RUN/WATCH/AVOID bands); (2) a scanner bug (emissionEnabled=false for actively-emitting SN29/35/36) suppresses Epago's composite by ~17.8 pts → 46.9 WATCH instead of ~64.7 RUN
- Scripts saved: scripts/research-epago-mismatch.ts, scripts/research-epago-counterfactual.ts
- Proposed fixes (NOT applied — user asked for research only): derive emissionEnabled from measured emission when storage returns empty; optionally risk-annotate the dashboard pick

---
Task ID: fix-epago-mismatch-2
Agent: main (Super Z)
Task: Apply both fixes for the Dashboard "Mine Epago α36" vs Opportunities 46/WATCH mismatch (user approved)

Work Log:
- Fix 1 (scanner): chain.ts — emissionEnabled now trusts the storage bool when present (incl. isFalse), and falls back to MEASURED last-epoch emission (epochAlphaRao > 0) when the RPC returns None/empty. Root cause: subnetEmissionEnabled returned None for actively-emitting SN29/35/36, flooring 3 of 5 Miner's Ledger pillars.
- Fix 2 (dashboard): dashboard-view.tsx OpportunityScoreCard — new ledgerCheck memo (mergeOpportunities) cross-checks the recommended mining pick against the Miner's Ledger; when its band is WATCH/AVOID the card renders a "{band} on Opportunities" badge (next to risk/confidence chips) plus an explanatory note with an "Review the breakdown" link to Opportunities. Badge hidden for RUN picks. Recommendation ranking unchanged (ROI-only) by design.
- Typecheck: bunx tsc --noEmit — zero errors in app src (only pre-existing skill-script errors).
- Restarted dev server via .zscripts/dev.sh (setsid detached). NOTE: plain nohup'd background servers get reaped between tool sessions — always restart via .zscripts/dev.sh.
- Live verification after fresh scan (block 9,078,312):
  * emissionEnabled FALSE count: 3 → 0; SN36 Epago flag now TRUE (55.6 TAO/day)
  * Epago Opportunities: 46.9 WATCH #19/128 → 64.7 RUN #1/128, risk medium → low
  * Dashboard: still "Mine Epago α36" (ROI 574%/mo unchanged), confidence 54% → 66%
  * Browser-verified dashboard card (screenshot download/dashboard-opp-score-card.png) + Opportunities row; zero console errors
  * Badge logic simulated (scripts/verify-badge-logic.ts): hidden for current all-RUN top-3; renders for WATCH/AVOID picks

Stage Summary:
- Both fixes applied and verified end-to-end on live Finney data; the Dashboard/Opportunities discrepancy is resolved (both pages now agree Epago = RUN #1, ROI 574%/mo)
- Scripts: scripts/verify-fix.ts, scripts/verify-badge-logic.ts (plus earlier research scripts)

---
Task ID: seat-safety-dash-1
Agent: main (Super Z)
Task: Add Seat Safety readout to the Dashboard recommendation card (user: "yes add seat safety")

Work Log:
- dashboard-view.tsx OpportunityScoreCard: new Seat Safety panel inside the
  recommended-strategy block (renders whenever a mining pick has a Ledger row,
  RUN band included — not tied to the WATCH/AVOID badge)
  * Header: Armchair icon + "Seat safety · can you get in — and keep the seat?"
    + pillar score x/100 color-coded (>=60 success, 40-59 warning, <40 destructive)
  * 5 fact chips off the merged row: Seats free/total (or "full — burn entry"),
    Burn ~TAO (formatBurnTao), Immunity ~h (blocks x 12s), Top-10% take %,
    Seats earning % — every chip null-guarded + hover-title explained
  * Footer line: weighs 20% of Ledger composite; open slots register directly,
    full subnet burn replaces worst non-immune UID, immunity = earning runway
- Imports: formatBurnTao from miner-score, Armchair from lucide
- Typecheck clean (only pre-existing skill-script errors); verified live in
  browser: Epago pick shows 48/100 (warning), 237 of 256 free, ~1.000 TAO burn,
  ~16.7h immunity, top-10% take 100%, seats earning 11% — matches SN36 chain
  data (19 registered, 2 rewarded); screenshot download/dashboard-seat-safety.png;
  0 console/page errors. Committed 1ebdb28.

Stage Summary:
- Dashboard decision card now covers BOTH halves of the mine decision: ROI
  (score ring + strategy rows) and seat risk (WATCH/AVOID badge + Seat Safety
  panel). Push queue: +1ebdb28 (awaiting user's fresh fine-grained PAT).

---
Task ID: score-clarity-1
Agent: main (Super Z)
Task: Check why Dashboard ring shows 98 for Epago while Opportunities shows 64.7 (user report)

Work Log:
- Verified on fresh live snapshot (block 9,078,382, TAO $217.2) via
  scripts/research-epago-mismatch.ts: ring = 98, Ledger = 64.7 (rank #1, RUN,
  pillars net_roi 97 / seat 47.9 / alpha 52.2 / earning 27.3 / fit 76.3)
- CONFIRMED BY DESIGN, no engine bug:
  * Ring 98 = 50 + 50*tanh((mine ROI - stake ROI)/8) clamped [3,98] — the
    conviction in the MINE-vs-STAKE verdict on monthly net ROI. Epago
    572.8%/mo vs staking 5.63%/mo → edge ~567 → tanh saturates → ring pegged
    at its 98 ceiling. Any runaway ROI subnet lands here.
  * Ledger 64.7 = 5-pillar composite of Epago AS A SEAT (weighted: 29.1 ROI +
    9.58 seat + 10.44 alpha + 4.1 earning + 11.44 fit). Dragged by Earning
    Reality 27.3 (11% seats earning, top-10% take 100%, ~11.4wk ramp) and
    Seat Safety 47.9 — the jackpot-seat profile.
- UX gap fixed (engines untouched): dashboard hid the Ledger composite for
  RUN picks → the two numbers could never be reconciled on-screen.
  * Ledger chip now always renders for mining picks: "RUN · Ledger 64.7"
    (band-colored; hover title explains both scores + why they differ)
  * Ring inner label "score" → "mine vs stake"
  * Caption under ring: "Ring = mine-vs-stake ROI edge · Ledger = subnet
    seat quality (Opportunities)"
- Typecheck clean; browser-verified (screenshot download/dashboard-score-
  clarity.png): ring "98 MINE VS STAKE", chip "RUN · LEDGER 64.7", caption
  live; 0 console/page errors. Committed (see git log).

Stage Summary:
- 98 vs 64.7 is two questions, not a bug: ring = how decisively mining beats
  staking (ROI edge, ceiling 98); Ledger = how good the subnet is as a mining
  seat (5 pillars). Dashboard now shows BOTH, so the split is self-evident.
- Watch item: ring pegged at 98 for ANY runaway ROI pick — if the user wants
  the ring to reflect seat risk too, that's an engine design change (blend
  band into score), NOT a data fix; needs explicit user decision.

---
Task ID: ring-seat-cap-1
Agent: main (Super Z)
Task: Implement seat-quality cap on the TAO Opportunity Score ring (user approved "ok implement it")

Work Log:
- opportunity-score.ts: edge score split out (tanh mine-vs-stake edge,
  unchanged); new seat cap when recommended is a mining pick:
  score = min(edgeScore, clamp(ledger + 20, 45, 98)); staking picks
  uncapped; cap-bite pushes a transparency note with both numbers.
  Header/interface comments updated.
- dashboard-view.tsx: Ledger chip hover title now says the ring is
  "capped by this Ledger score + 20 headroom"; ring caption line now
  "Ring = mine-vs-stake ROI edge, capped by Ledger seat quality".
- tsc clean. Live verify (block ~9,078,4xx): ring 84.6 (was 98),
  cap note "Ring capped by seat quality — Ledger 64.6 + 20 headroom;
  the ROI edge alone would show 98.", chip RUN · LEDGER 64.6, seat
  panel 48/100, 0 console/page errors. Screenshot
  download/dashboard-ring-cap.png. Committed.

Stage Summary:
- Ring semantics: mine-vs-stake ROI edge conviction, bounded by pick
  quality. 98 now requires Ledger >= 78 (clean seat + blowout edge) —
  regains discriminating power; AVOID picks headline <= ~65 max.
- Epago today: 84.6 ring / 64.6 Ledger RUN #1 / 570.8%/mo — coherent.
