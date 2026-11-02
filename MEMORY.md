# Infranex BT — Project Memory

> Last updated: 2026-11-02 · Companion docs: [`ARCHITECTURE.md`](./ARCHITECTURE.md) ·
> [`RULES.md`](./RULES.md) · raw history: `worklog.md` (append-only)
> Purpose: everything a future session must know to be productive in the
> first 5 minutes — environment truths, runbooks, incident history, key facts.

---

## 1. Project Identity

**Infranex BT** — Bittensor Intelligence & Mining Operations Platform.
Next.js 16 SPA + Prisma + in-process workers. Owner requirement: **English
only UI**. Current scale: 19 views · 43 Prisma models · 38 API route groups ·
129 subnets tracked · 106 playbook rows · 112 overrides (69 with GPU data).

**Access (sandbox):** `POST /api/auth/login {"userId":"admin","code":"<redacted — set INFRANEX_ADMIN_CODE>"}` → cookie.
Verify app with `GET /` (307 → `/login` unauthed, 200 authed). The app is an
SPA — deep paths like `/subnets` 404 by design; use authed API calls.

---

## 2. Environment Truths (sandbox)

1. **Sandbox recycles happen without warning** and: wipe `db/custom.db`
   (all tables → 0 rows), kill processes, invalidate the GitHub PAT, and
   clear cookies. Source code (git-tracked files) survives; uncommitted
   work may not.
2. **Boot path (fixed 2026-11-02):** after recycle the platform runs
   `bun run dev` — which is now `bash run-prod-keepalive.sh` (package.json
   `"dev"`). The script boots the PRODUCTION standalone (full env incl.
   `INFRANEX_ALLOWED_ORIGINS`, RSS watchdog, auto-restart) and only falls
   back to `next dev` if `.next/standalone/server.js` is missing. A
   recycled sandbox therefore self-heals to production — no manual rescue.
   Real dev mode is `bun run dev:next`.
3. **NEVER `pkill -f server.js` / `pkill next dev`** — it kills the prod
   server. Target by exact PID. Also beware `pkill -o` (matches the OLDEST
   process, i.e. the real one, not the test instance).
   - `next-server` RENAMES its process title — `ps`/`pgrep -f server.js`
     find nothing. Find it with `ss -ltnp` (shows `users:(("next-server
     (v16...)",pid=…))`), or scan `/proc/*/cmdline`.
   - **PUBLISHED-ALIAS RULE (2026-11-02):** the `preview-chat-<chat_id>`
     published URL proxies to the PLATFORM's own supervised boot tree. If
     you kill that tree (even to free build memory), the published alias
     502s until the NEXT recycle re-registers it, while the canonical
     `x1vjv8jfmfp0-d.space-z.ai` host (raw port forward) keeps working.
     To free memory for a build, prefer building alongside the server with
     a lower heap, or accept the alias outage — never kill the platform
     tree unless the user is told first.
4. Container memory: ~4GB, no swap (supervisor attempts a 2GB swapfile once
   per sandbox). Production build needs `NODE_OPTIONS=--max-old-space-size=2048`
   and ~1.8GB free — a running server + workers can push the build into
   exit-137 (OOM kill). Check `free -m` first.
4b. **Health probes (HEALTH-PROBE-1/2, 2026-11-02):** the System & Errors
   panel must NEVER fetch external APIs from the browser (CORS-less 429s
   show as "Failed to fetch"; browsers can't set User-Agent). Both the
   Finney RPC and the TAO price feed are probed server-side now:
   `/api/chain-health` and `/api/price-health` (the latter runs the real
   `getPrices()` pipeline — Binance primary, CoinGecko fallback, stale-serve
   — so CoinGecko 429s show as metadata, not failures).
4c. **STALE-BOOT QUIRK (2026-11-02):** a recycle can boot the server from a
   snapshot where the project files are restored AFTER process start — the
   RUNNING server then serves an older BUILD_ID than `.next/BUILD_ID` on
   disk, and the server's tree is invisible to tool-call namespaces (can't
   be killed/restarted). After every recycle, compare the served build id
   (HTML comment `<!--BUILDID-->` on any page) vs `cat .next/BUILD_ID`.
   If stale: the newest code goes live at the NEXT recycle/restart — the
   disk copy is what boots. Don't burn time trying to kill an invisible
   main-netns process.
4e. **KERNEL-OOM THRESHOLD + COOPERATIVE SUPERVISOR (2026-11-02):** dmesg
   showed the kernel global-OOM kills next-server at **~1.68–2.25 GB RSS** —
   BELOW the old 1.8 GB watchdog limit, so the kernel always won the race,
   froze the whole sandbox, and the platform then served the user
   `{"error":"sandbox is inactive"}`. Fixes in run-prod-keepalive.sh:
   (a) RSS_LIMIT_KB=1433600 (1.4 GB) — supervisor restarts the server
   cleanly BEFORE the kernel acts; logs RSS ramps >800 MB to server.log;
   (b) cooperative flock on /tmp/infranex-supervisor.lock — a second
   instance (platform auto-run vs manual) BLOCKS on the lock, and on
   acquiring it probes :3000: if something answers it stands down, else it
   takes over. With flock -n the loser exited and if the reaper later
   killed the winner, nothing was left serving (observed twice).
   Tool-spawned setsid servers die within ~1–2 min / at the next tool
   call; ONLY the platform's `bun run dev` tree is durable. Platform-side
   10-min heartbeat cron (job 496139) wakes a sleeping sandbox and
   restarts :3000 if dead. `{"error":"sandbox is inactive"}` = sandbox
   asleep between messages — platform edge has nothing to proxy to; it
   self-heals on the next heartbeat/chat message, then refresh.
4d. **POST-RECYCLE TOPOLOGY (mapped 2026-11-02, recycle @10:06):** three
   isolated netns/pidns worlds:
   (a) tool-call world (what we see): Caddy :81 + zcode-driver (pid ~930)
   live HERE; `ss` shows only platform ports 81/12600/12700/19001/19005/19006.
   (b) platform service netns (invisible): runs the app that the CANONICAL
   host forwards to — it serves the PLATFORM'S PUBLISHED SNAPSHOT build
   (HTML comment BUILD_ID), NOT our supervisor's instance. Login + data
   APIs work there even when the build is old.
   (c) supervisor world (invisible): the recycle's `bun run dev` →
   run-prod-keepalive.sh instance; writes dev.log/server.log in the shared
   filesystem. Its `next dev` fallback bound :3000 fine — so it is in yet
   another netns, NOT the canonical-routed one.
   - Caddy :81 502s for EVERY Host header and its upstream connects to NO
     local TCP port (proven: bound ::1:3000 + v4 3001-3003/8080/8000/8081
     probes during requests — zero hits; admin API :2019 closed; Caddyfile
     root-readable only). Published alias = edge → Caddy :81 → dead upstream,
     and this SURVIVED a recycle (unlike the earlier PUBLISHED-ALIAS RULE
     case). Not fixable from inside; only the platform or a re-publish heals
     it. Canonical stays the reliable entry.
   - DO NOT hold :3000 in the tool netns long-term (run-local-upstream.sh
     kept here for reference): on future recycles the platform tree may run
     the app in THIS netns on :3000 (pre-2026-11-02 topology) and a
     permanent holder would fight it. Setsid revivals from tool calls are
     reaped between calls anyway.
5. Work happened in a different PID namespace per tool session — verify by
   HTTP (`curl localhost:3000`), not `ps`.
6. **OOM incident (2026-10-29):** next-server leaked to 2.5GB RSS over ~4h →
   kernel global OOM killed it AND the platform supervisor did not relaunch it
   (supervisor only boots the dev server on sandbox recycle). setsid/nohup
   revivals from tool calls only live for that one tool call. Fix: user
   restarts the sandbox (platform boot supervisor relaunches `bun run dev`);
   keeper cron now also preemptively restarts next-server when RSS > 2.2GB.
   E2E proof script: `scripts/e2e-smart-framework.sh` (revive + login +
   CRUD + browser, one call).

---

## 3. Restore Runbook (after recycle / DB wipe)

Verified 4× (see §5). Order matters.

```bash
cd /home/z/my-project
# 0. Wait for platform boot to finish (bun install / dev server up)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/   # 307 = up

# 1. Chain snapshot + base overrides (no GitHub scraping)
bun scripts/restore-after-recycle.ts
#    expect: block=..., subnets=129, "SubnetOverride base rows upserted: 112"

# 2. Playbook (MUST run after step 1 — validates netuids against overrides)
bun scripts/merge-playbook.ts
#    expect: "merged 106 playbook rows | repo-verified=98 derived=7 thin=1"

# 3. Hardware data (needed by the Emission Leaderboard "Hardware" column)
bun scripts/rescrape-requirements.ts
#    expect: ~112 attempted, ~109 ok, ~69 with GPU reqs (takes minutes)

# 4. Verify
#    login (see §1) → /api/network (source=live, 129 subnets)
#    → /api/playbook (meta.totalSubnets=106, incl. SN82 Noah batch-7)
#    → /api/subnet-overrides (112 rows, 69 with recommendedGpu)
```

Known-good numbers to compare against: SN0 ≈ 646 TAO/day, SN51 ≈ 640,
SN64 ≈ 398, TAO ≈ $270 (floats with the market). Hardware highlights:
SN51 `8x B300`, SN64 `8x H200`, SN34 `A100 80GB`, SN2/SN8 `CPU-only`.

`JudgeProfile`/`JudgeRun` rows are disposable — they rebuild on demand in
the Validator Lab.

---

## 4. Data Sources

| Source | What | Where |
|--------|------|-------|
| Bittensor Finney RPC | 129 subnets, emissions, metagraph | `fetchLiveSnapshot()` → `ChainSnapshot` |
| CoinGecko | TAO/USD | price worker |
| GitHub repos | per-subnet requirements, GPU models, playbooks, judge profiles | `github-scraper.ts`, `rescrape-requirements.ts` |
| RunPod GraphQL | GPU offers (spot + on-demand) | `/api/gpu-offers` |
| Lium public API | SN51 live node feed (`https://lium.io/api/public/v1/nodes`) | research only |
| Lium validator source | `GPU_MODEL_RATES` idle-pay weights (`neurons/validators/src/services/const.py`) | research only |

---

## 5. Incident History (lessons baked into RULES.md)

| Date | Incident | Lesson |
|------|----------|--------|
| 2025-10 | Kernel OOM kill during prod build + client crash reports | cgroup ~4GB, no swap → build with max-old-space-size=2048 |
| multiple | "Playbook empty" → 4× full DB wipes on recycle | Restore runbook (§3) is canonical; sync-overrides-standalone alone is NOT enough (only 8 curated seeds) |
| 2025-10 | Self-inflicted: `pkill next dev` killed platform server | Never pkill; use platform dev server / setsid pattern |
| 2025-10 | nohup keepalive reaped between tool calls | Background processes are not durable; dev server is |
| 2025-10 | Git push 401 after recycle | PAT invalidated by recycle — need fresh token from owner; local commits queue up (e.g. `f3a06da` hardware column) |
| 2025-10 | `GET /subnets` → 404 "bug" report | SPA — verify via `/` + authed APIs |
| 2026-11-02 | Recycle → platform booted bare `next dev` (missing `INFRANEX_ALLOWED_ORIGINS`) → CSRF gate 403'd every public browser POST | Proper fix: `"dev"` now delegates to `run-prod-keepalive.sh` (prod standalone + full env + watchdog + `next dev` fallback); verified live on port 3999 before rollout |
| 2026-11-02 | Published alias 502 SURVIVED a recycle; canonical served stale snapshot build (health routes 404) | See §2 4d: canonical = platform's published snapshot (can't hot-swap); Caddy :81 upstream unreachable from inside; don't chase the alias — use canonical, wait for re-publish |
| 2026-11-02 | 3× kernel OOM killed next-server at 1.68–2.25 GB RSS (below the 1.8 GB watchdog) → sandbox freeze → user saw `{"error":"sandbox is inactive"}` on the published URL; after the 10:06 recycle the alias routes to tool-netns :3000 (was: Caddy :81 dead upstream) | See §2 4e: watchdog 1.4 GB + RSS telemetry + cooperative flock; 10-min heartbeat cron (job 496139); "sandbox is inactive" = sandbox asleep — heals on next heartbeat/message |

---

## 6. Feature State (as of 2026-10-17)

- ✅ **Emission Leaderboard** ("Top Subnets by Current Emission Share") —
  live TAO/day, share bars, USD, miner pool split, top-20 collapse, tail
  aggregate; **Hardware column** (GPU/CPU badge + `gpuReq` + min VRAM) fed
  by `/api/subnet-overrides` ← `rescrape-requirements.ts`.
- ✅ **Validator Lab** — JudgeProfile/JudgeRun/cohort brutality/apply
  (daemon push / platform-only / mock). Profiles rebuild on demand.
- ✅ **Miner Playbook** — 105 rows from repo scraping.
- ✅ Deployment engine (RunPod + mock), DevOps/daemon, CPU track.
- ⏳ Pending: git push (needs fresh PAT); optional offers not yet accepted —
  4090/5090/H200 earnings calculator, SN51 setup PDF playbook,
  miner-pool÷competition ratio column, SN51 price sweep in Validator Lab,
  PM2 support in deployment pipeline (older request).

---

## 7. Domain Notes — SN51 (lium.io)

GPU rental marketplace subnet; validator SSHes into miner nodes every
15 min (Sysbox, port rules, ≥100Mbps, Ubuntu 24.04, 8GB RAM, disk ≥1.5×
VRAM). Needs bare metal / privileged VM — RunPod/Vast container pods fail.
Idle-pay weights (`GPU_MODEL_RATES`): H200 0.56 > H200 NVL 0.49 > H100 0.10 >
B200/B300 & 4090 0.05 > PRO 6000 0.025 > 5090 0.025 > 4070/4080/5070/5080 0.
Top-10 providers capture ~99% of the miner pool. Market rates (2026-10):
4090 ~$0.35–0.75/hr, 5090 ~$0.45–1.19/hr; single-card idle pay negligible;
H200 is the real earner (~71% utilization). Miner start: `btcli register` →
Provider Portal + Discord (mandatory) → Sysbox+NVIDIA toolkit script →
`curl -fsSL https://lium.io/mine.sh | bash -s -- -k <hotkey_ss58>` → portal
node add.
