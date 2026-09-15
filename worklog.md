
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
