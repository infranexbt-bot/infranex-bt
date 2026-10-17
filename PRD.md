# Infranex BT — Product Requirements Document (PRD)

> Version: 2.1 · Last updated: 2026-10-17 · Status: **Active**
> Source of truth for what the product does and why. Architecture lives in
> [`ARCHITECTURE.md`](./ARCHITECTURE.md), UI conventions in
> [`DESIGN.md`](./DESIGN.md), engineering rules in [`RULES.md`](./RULES.md).

---

## 1. Product Vision

**Infranex BT** is a single-pane operations platform for the Bittensor network.
It answers, in one place and in real time, the three questions every subnet
miner, validator, and investor faces:

1. **Where is the money?** — which subnets emit the most TAO/day, how much of
   that reaches the miner pool, and what hardware does each subnet demand?
2. **What does it take to mine it?** — per-subnet setup playbooks, GPU/CPU
   requirements, hosting constraints, and one-click deployment to real GPU hosts.
3. **Am I actually earning?** — earnings tracking, profitability math,
   portfolio/thesis tracking, and system health for running operations.

The platform is a **decision engine wrapped around an execution engine**: it
scans the chain and the internet to score opportunities, then provisions
servers and launches miners to capture them.

---

## 2. Target Users & Personas

| Persona | Goal | Primary views |
|---------|------|---------------|
| **Miner Operator** (primary) | Find profitable subnets, deploy GPU/CPU miners, keep them running | Subnets, Miner Playbook, GPU Catalog, My Miners, Deployments, DevOps |
| **Validator / Evaluator** | Understand a subnet's validation rules before committing stake or hardware | Validator Lab, Subnets, Opportunities |
| **Investor / Analyst** | Track emissions, TAO price, portfolio and asymmetric bets | Dashboard, Analytics, Investment views, GPU Landscape |
| **Admin** | Manage users, platform settings, audit | Admin, System |

---

## 3. Functional Requirements

### 3.1 Live Chain & Market Data (FR-1)

- **FR-1.1** — Poll the Bittensor Finney chain every 30s and persist a
  `ChainSnapshot`: per-subnet emission (TAO/day), miner-pool split
  (incentive-uid emission), miner counts, TAO/USD price, block number.
- **FR-1.2** — Support **129+ subnets** with graceful degradation when the
  chain RPC is unreachable (serve last snapshot, mark `source` as
  `live`/`cache`/`mock`).
- **FR-1.3** — Expose the snapshot via `GET /api/network` and merge it with
  curated + scraped subnet metadata (names, GitHub, categories) before
  display.

### 3.2 Emission Leaderboard (FR-2)

- **FR-2.1** — Rank every earning subnet by **whole-subnet emission in
  TAO/day**; show each subnet's **share of total network emission** with a
  color bar.
- **FR-2.2** — Convert emission to **USD/day** at the live TAO price.
- **FR-2.3** — Show the **miner-side pool** (emission that reaches miner
  uids, not validators) in both TAO and USD, plus the miner count when
  known — this is the pool a miner actually competes for.
- **FR-2.4** — Show a **Hardware column** beside each subnet: GPU/CPU
  classification badge, the required GPU model (e.g. `8× H200`, `A100`,
  `B300`), and minimum VRAM when known. Data comes from repo scraping
  (`SubnetOverride.recommendedGpu`, `minVramGb`).
- **FR-2.5** — Collapse to top-20 by default with an expand toggle; aggregate
  the tail into a single summary row.

### 3.3 Subnet Intelligence & Playbook (FR-3)

- **FR-3.1** — Maintain a **Miner Playbook** (`SubnetPlaybook`, ~105 rows)
  built from each subnet's GitHub repo: setup steps, mining commands,
  validator requirements, hardware needs, and confidence level
  (repo-verified / derived / thin).
- **FR-3.2** — Scrape and refresh subnet requirements
  (`rescrape-requirements.ts`): recommended GPU, GPU count, min VRAM,
  hosting rules, GitHub URL, website, socials.
- **FR-3.3** — Present a per-subnet **Requirements dialog** (hardware,
  hosting, setup steps) directly in the Subnets view.

### 3.4 Validator Lab (FR-4)

- **FR-4.1** — Extract a **JudgeProfile** from a subnet's validator repo
  (GitHub): scoring dimensions, thresholds, and an archetype with a
  confidence score.
- **FR-4.2** — Simulate a **JudgeRun** against the user's node: derive the
  verdict (accept/reject), an asking price where applicable, and per-dimension
  deltas vs the cohort.
- **FR-4.3** — Measure **cohort brutality** from the live metagraph incentive
  vector so the user knows how forgiving the subnet's competition is.
- **FR-4.4** — **Apply** a passing profile to a target host via the Node
  Daemon push, platform-only snapshot, or a mock adapter.

### 3.5 Deployment Engine & DevOps (FR-5)

- **FR-5.1** — Provision GPU hosts via **provider adapters** (RunPod live,
  mock for development) with an 11-state deployment machine
  (`requested → started`).
- **FR-5.2** — Build miner configs: docker image, miner command, ports, env
  vars; keep every revision (`DeploymentRevision`).
- **FR-5.3** — Node **Daemon** integration for on-prem hosts: host checks,
  install steps, local commands, GPU samples, probe/traffic samples, miner
  logs.
- **FR-5.4** — CPU track: CPU offers ingestion and CPU provisioning
  (`/api/cpu-offers`, `/api/cpu-provision`).
- **FR-5.5** — Autopilot rules (`AutopilotRule`) that trigger deployments or
  alerts on chain/market conditions (`TriggerEvent`).

### 3.6 Economics & Portfolio (FR-6)

- **FR-6.1** — Profitability settings and per-subnet earnings estimates
  (EarningsDaily, SpendLedger, IncomeEntry).
- **FR-6.2** — Investment tracking: theses, watchlist, holdings, asymmetric
  bets, trade setups, bot signals, yield positions.

### 3.7 Observability & Admin (FR-7)

- **FR-7.1** — System health checks for chain / price / GPU / API
  dependencies; runtime error log view.
- **FR-7.2** — Monitoring view over workers, probes, alerts
  (`AlertChannel`, `BenchmarkRun`, `UpstreamState`).
- **FR-7.3** — Access-code authentication (`AppUser`), admin role, audit log,
  platform settings.
- **FR-7.4** — **All UI text in English** (explicit product requirement from
  the owner).

---

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | **Resilience** — sandbox/database wipes must be recoverable in minutes via the documented restore sequence (`MEMORY.md` → Restore Runbook). |
| NFR-2 | **Performance** — chain polling ≤30s; UI interactions <100ms perceived; large tables virtualized or capped (top-20 collapse). |
| NFR-3 | **Security** — provider API keys server-side only, never `NEXT_PUBLIC_`; access-code auth on all state-changing APIs; audit log for admin actions. |
| NFR-4 | **Portability** — run on SQLite (`db/custom.db`) in the sandbox and Postgres (Neon) in production via Prisma. |
| NFR-5 | **Observability** — every background worker reports to `WorkerStatus`; every deployment state transition persisted. |
| NFR-6 | **English-only UI** — all user-facing strings, badges, and charts in English. |

---

## 5. Feature → View Map

| View | Purpose | Key API |
|------|---------|---------|
| Dashboard | Network overview, KPIs, top movers | `/api/network`, `/api/prices` |
| Opportunities | Scored subnet opportunities (3-pillar model) | `/api/economics` |
| Subnets | Live subnet table + **Emission Leaderboard** + requirements dialogs | `/api/network`, `/api/subnet-overrides`, `/api/playbook` |
| Miner Playbook | Per-subnet mining guides | `/api/playbook` |
| Validator Lab | Judge profiles, runs, apply | `/api/judge` |
| GPU Catalog / GPU Landscape | GPU offers, pricing, landscape | `/api/gpu-offers`, `/api/gpu-landscape` |
| CPU views | CPU offers + guide | `/api/cpu-offers` |
| My Miners / Deployments | Fleet + 11-state deployments | `/api/deployments`, `/api/daemon` |
| DevOps / Runbook / Monitoring / Optimization / System | Ops, health, alerts | `/api/devops`, `/api/monitoring`, `/api/alerts` |
| Analytics / Investment views | Earnings, theses, trades | `/api/income`, `/api/theses`, `/api/trades` |
| Admin | Users, settings, audit | `/api/admin`, `/api/settings` |

---

## 6. Out of Scope (v2.x)

- Running validator software for the user (simulation + apply only).
- Non-Bittensor chains (TAO only, CoinGecko for FIAT pricing).
- Mobile-native apps (responsive web only).
- Multi-user SaaS tenancy — single-operator deployment with role-based users.

---

## 7. Success Metrics

- Snapshot freshness: <60s lag from chain state.
- Playbook coverage: ≥100 subnets with repo-verified guides.
- Hardware classification coverage: ≥60% of listed subnets with a GPU/CPU
  verdict (currently 69/112).
- Restore time after sandbox recycle: <10 minutes end-to-end.
- Zero unauthed access to state-changing APIs.
