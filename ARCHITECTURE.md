# Infranex BT — Architecture

> Version: 3.0 · Last updated: 2026-10-17
> This document reflects the **current** codebase. Historical MVP docs are in
> `docs/architecture/` (v2.0 scoring model) and
> `docs/Infranex_BT_Architecture_Documentation.pdf`. Product requirements:
> [`PRD.md`](./PRD.md). Engineering rules: [`RULES.md`](./RULES.md).

---

## 1. High-Level Shape

Single-page Next.js **App Router** application (one SPA shell at `/` plus
`/login`) backed by **API routes** and **Prisma**. Background **workers**
inside the Next.js process ingest chain and market data into snapshots that
the UI polls.

```
┌────────────────────────────────────────────────────────────────┐
│                      BITTENSOR FINNEY CHAIN                    │
│           (129 subnets · metagraphs · emissions · prices)      │
└──────────────┬─────────────────────────────────────────────────┘
               ▼
┌────────────────────────────────────────────────────────────────┐
│                     INGESTION / WORKERS                        │
│  src/lib/infranex/workers.ts (in-process, WorkerStatus table)  │
│  • chain worker      → fetchLiveSnapshot() → ChainSnapshot     │
│  • price worker      → TAO/USD (CoinGecko)                     │
│  • enrichment        → GitHub scraper → SubnetOverride         │
│  • requirements      → repo scrape → SubnetRequirements        │
└──────────────┬─────────────────────────────────────────────────┘
               ▼
┌────────────────────────────────────────────────────────────────┐
│                    PRISMA / SQLite (db/custom.db)              │
│   43 models — snapshots, overrides, playbook, judge, hosts,    │
│   deployments, portfolio, admin/audit (see §4)                 │
└──────────────┬─────────────────────────────────────────────────┘
               ▼
┌────────────────────────────────────────────────────────────────┐
│                     API ROUTES (38 groups)                     │
│  /api/network · /api/subnet-overrides · /api/playbook          │
│  /api/judge · /api/deployments · /api/daemon · /api/devops     │
│  /api/gpu-offers · /api/cpu-offers · /api/economics            │
│  /api/income · /api/theses · /api/admin · /api/auth …          │
└──────────────┬─────────────────────────────────────────────────┘
               ▼
┌────────────────────────────────────────────────────────────────┐
│                        SPA UI (19 views)                       │
│  src/components/views/*.tsx — one shell, client-side nav,      │
│  TanStack-style polling hooks, dark editorial theme            │
└────────────────────────────────────────────────────────────────┘
```

**Important:** the app is an SPA — `/subnets`, `/judge` etc. are *not* HTTP
routes. Verify pages via `GET /` (auth redirect → `/login`) and authed API
calls.

---

## 2. Directory Map

| Path | Role |
|------|------|
| `src/app/` | App Router: layout, `/` SPA shell, `/login`, `src/app/api/**` route handlers |
| `src/components/views/` | The 19 feature views (dashboard, subnets, judge, devops, …) |
| `src/components/subnets/` | Subnet feature components incl. `emission-leaderboard-panel.tsx` |
| `src/lib/infranex/` | Domain logic: `chain.ts` (snapshot fetch), `workers.ts`, `judge/` (types/service/apply), `github-scraper.ts`, `use-subnet-overrides.ts`, `data.ts` (curated seeds) |
| `src/lib/devops/` | Host/daemon/requirements tooling (incl. `subnet-requirements.ts` profiler) |
| `prisma/schema.prisma` | 43 models (SQLite in sandbox, Postgres in prod) |
| `scripts/` | Operational scripts — restore, rescrape, merge, verification (see §6) |
| `docs/` | Historical architecture PDFs, setup guides, subnet research notes (`sn*-readme.md`) |
| `worklog.md` | Append-only multi-agent work log |

---

## 3. Core Data Flows

### 3.1 Chain snapshot (the spine)

`fetchLiveSnapshot()` (`src/lib/infranex/chain.ts`) → `ChainSnapshot` row →
`GET /api/network` → `LiveSubnetMetrics[]`
(`emissionTaoPerDay`, `minerEmissionTaoPerDay`, `taoPriceUsd`,
`minersCount`, `source: live|cache|mock`) → all network views.

### 3.2 Subnet identity merge (client-side)

`mergeSubnets(snap, overrides)` in `subnets-view.tsx` resolves display names
and hardware by priority: **chain identity > SubnetOverride > curated seeds**.
The Emission Leaderboard derives `hwClass` (GPU/CPU/unknown), `gpuReq`,
`minVramGb` from the merged `recommendedGpu`/`minVramGb` fields
(`/api/subnet-overrides` → populated by `scripts/rescrape-requirements.ts`).

### 3.3 Validator Lab (judge pipeline)

`JudgeProfile` extractor (GitHub repo → 6 scoring dimensions → archetype +
confidence) → `JudgeRun` simulator (verdict, asking price, per-dimension
deltas) + cohort brutality from the live metagraph incentive vector →
`src/lib/infranex/apply.ts` (snapshot → Node Daemon push / platform-only /
mock).

### 3.4 Deployment engine

11-state machine (`requested → started`) in `Deployment` +
`DeploymentRevision`; provider adapters for **RunPod** (live) and **mock**
(dev); Node **Daemon** (`DaemonState`, `HostInstall`, `LocalCommand`,
`GpuSample`, `ProbeSample`) drives on-prem hosts; CPU track via
`/api/cpu-offers` + `/api/cpu-provision`.

### 3.5 Auth

Access-code login (`POST /api/auth/login {userId, code}`) → session cookie →
all state-changing APIs require it. `AppUser.role = admin` gates admin APIs;
actions land in `AuditLog`.

---

## 4. Data Model (43 Prisma models, grouped)

| Group | Models |
|-------|--------|
| Chain & subnet intel | `ChainSnapshot`, `SubnetOverride`, `SubnetPlaybook`, `SubnetRequirements`, `UidSnapshot` |
| Workers & triggers | `WorkerStatus`, `TriggerEvent`, `AutopilotRule`, `UpstreamState` |
| Hosts & deployments | `Deployment`, `DeploymentRevision`, `GpuHost`, `HostCheck`, `HostInstall`, `LocalHost`, `LocalCommand`, `DaemonState`, `ProviderKey` |
| Telemetry | `GpuSample`, `ProbeSample`, `TrafficSample`, `MinerLog`, `BenchmarkRun`, `AlertChannel` |
| Judge (Validator Lab) | `JudgeProfile`, `JudgeRun` |
| Economics & portfolio | `ProfitabilitySettings`, `EarningsDaily`, `SpendLedger`, `IncomeEntry`, `InvestmentThesis`, `WatchlistItem`, `PortfolioHolding`, `AsymmetricBet`, `TradeSetup`, `BotSignal`, `YieldPosition` |
| Diligence & trust | `DiligenceApproval`, `AgentNote`, `WalletProfile` |
| Platform & admin | `AppUser`, `PlatformSettings`, `AuditLog` |

---

## 5. Key Libraries

- **Next.js 16** (App Router, standalone output) · **React 19** · **TS 5**
- **Tailwind CSS 4** + **shadcn/ui** (Radix) + **lucide-react**
- **Prisma** ORM — SQLite sandbox / Postgres prod
- **@polkadot/api** — Bittensor chain RPC
- **Recharts** — charts
- **Bun** — runtime & script runner (`bun run dev`, `bun scripts/*.ts`)

---

## 6. Operational Runbooks (scripts/)

| Script | Purpose |
|--------|---------|
| `restore-after-recycle.ts` | **Post-wipe step 1** — refetch live snapshot → `ChainSnapshot` + base `SubnetOverride` upserts (no GitHub scraping) |
| `merge-playbook.ts` | **Post-wipe step 2** — rebuild `SubnetPlaybook` (validates netuids against overrides; run AFTER step 1) |
| `rescrape-requirements.ts` | **Post-wipe step 3 (when hardware data needed)** — GitHub scrape → `recommendedGpu`, `gpuCount`, hosting rules |
| `sync-overrides-standalone.ts` | Curated-seed override sync (insufficient alone — only ~8 seeds) |
| `run-prod-keepalive.sh` | Reference-only standalone server + RSS watchdog (dev server is the real runtime) |

Full incident history and sandbox-lifecycle knowledge: [`MEMORY.md`](./MEMORY.md).
