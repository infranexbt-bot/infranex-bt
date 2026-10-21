# Infranex BT — Project Memory

> Last updated: 2026-10-17 · Companion docs: [`ARCHITECTURE.md`](./ARCHITECTURE.md) ·
> [`RULES.md`](./RULES.md) · raw history: `worklog.md` (append-only)
> Purpose: everything a future session must know to be productive in the
> first 5 minutes — environment truths, runbooks, incident history, key facts.

---

## 1. Project Identity

**Infranex BT** — Bittensor Intelligence & Mining Operations Platform.
Next.js 16 SPA + Prisma + in-process workers. Owner requirement: **English
only UI**. Current scale: 19 views · 43 Prisma models · 38 API route groups ·
129 subnets tracked · 106 playbook rows · 112 overrides (69 with GPU data).

**Access (sandbox):** `POST /api/auth/login {"userId":"admin","code":"BRJ2-W2GT-WJNF-97VC"}` → cookie.
Verify app with `GET /` (307 → `/login` unauthed, 200 authed). The app is an
SPA — deep paths like `/subnets` 404 by design; use authed API calls.

---

## 2. Environment Truths (sandbox)

1. **Sandbox recycles happen without warning** and: wipe `db/custom.db`
   (all tables → 0 rows), kill processes, invalidate the GitHub PAT, and
   clear cookies. Source code (git-tracked files) survives; uncommitted
   work may not.
2. **The dev server is platform-supervised.** It comes back automatically
   after recycle; `bun install` may still be running right after boot —
   wait for it.
3. **NEVER `pkill "next dev"`** — it kills the platform's server. A nohup'd
   standalone server does NOT survive between tool calls either (reaped).
   The dev server is the only durable runtime.
4. **`/tmp` is not writable** — use project-root paths for temp files.
5. Container memory: ~4GB, no swap. A production build needs
   `NODE_OPTIONS=--max-old-space-size=2048`.
6. Work happened in a different PID namespace per tool session — verify by
   HTTP (`curl localhost:3000`), not `ps`.

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
