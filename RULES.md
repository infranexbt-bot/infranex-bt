# Infranex BT — Rules

> Last updated: 2026-10-17
> Engineering, operational, and product rules that every change to this
> codebase must follow. Broken rules = broken deployments; the operational
> ones were learned the hard way (see [`MEMORY.md`](./MEMORY.md)).

---

## 1. Product Rules

1. **English only** — all UI text, badges, chart labels, error messages, and
   docs are in English. No Chinese or other languages in the interface.
2. **Live data first** — network views must read from the chain snapshot
   (`/api/network`), never hardcode numbers. When the chain is unreachable,
   degrade to the last snapshot and surface the `source` badge
   (`live` / `cache` / `mock`).
3. **Miner-pool honesty** — whenever emission is shown, distinguish
   whole-subnet emission from the miner-side pool (incentive-uid split).
   Showing only the whole-subnet number is misleading and forbidden.
4. **No artificial endings** — documents/reports generated for the platform
   never end with "End of report" style markers.

---

## 2. Code Conventions

1. **TypeScript strict** — no `any` in new code; prefer shared types in
   `src/lib/infranex/` (e.g. `LiveSubnetMetrics`, `EmissionRow`).
2. **Components** — one view per file in `src/components/views/`; reusable
   feature components in `src/components/<feature>/` (e.g.
   `src/components/subnets/emission-leaderboard-panel.tsx`). UI primitives
   come from `src/components/ui/` (shadcn) — do not hand-roll buttons/cards.
3. **API routes** — group by resource under `src/app/api/<resource>/`; all
   handlers must (a) require an authed session for state changes, (b) return
   JSON with a stable shape, (c) never trust client-supplied netuid/host ids
   without validation.
4. **DB access** — Prisma only, schema in `prisma/schema.prisma`. Sandbox
   uses `db/custom.db` (SQLite); production may use Postgres. Do not write
   raw SQL in app code (operational scripts may use `sqlite3`/Prisma).
5. **Client data fetching** — polling hooks (30s network poll); no global
   state library; memoize merged views with `useMemo` (see
   `emissionRows` in `subnets-view.tsx`).
6. **Secrets** — server-side only, never `NEXT_PUBLIC_`. `.env` is
   gitignored.

---

## 3. UI / Design Rules

1. Follow [`DESIGN.md`](./DESIGN.md): dark editorial theme, Space Grotesk
   display / Inter body / JetBrains Mono, lime primary (hue 84), shadcn
   tokens.
2. Dense tables collapse by default (top-20 + expand toggle) — no
   unbounded lists in the DOM.
3. Every money/number cell states its unit (TAO/day, USD/day, GB VRAM).
4. Badges for classification (`GPU` / `CPU` / unknown) use the badge palette
   from DESIGN.md §4.

---

## 4. Operational Rules (sandbox) — CRITICAL

1. **NEVER `pkill "next dev"`** — the dev server is platform-supervised;
   killing it takes down the app until the platform restarts it. If a
   standalone server is needed: `cd /home/z/my-project && (setsid nohup bun run dev >/dev/null 2>&1 &)`.
2. **Background processes get reaped** between tool calls — nohup'd
   keepalive scripts do not survive; the platform dev server is the only
   durable runtime.
3. **Sandbox recycles wipe the DB** (`db/custom.db` → 0 rows) and may
   invalidate the GitHub PAT and cookies. After any recycle, run the restore
   sequence from `MEMORY.md` §Restore Runbook:
   `restore-after-recycle.ts` → `merge-playbook.ts` → (if hardware data
   needed) `rescrape-requirements.ts`.
4. **`/tmp` is not writable** — use project-root paths for temp files.
5. **Script persistence** — any script longer than ~10 lines is saved under
   `scripts/` first, then executed; fix by editing the file, not regenerating.
6. **SPA verification** — `GET /subnets` returns 404 by design; verify via
   `GET /` (expect 307 → `/login` unauthed, 200 authed) and authed API calls.

---

## 5. Verification Workflow (before any "done")

1. `bunx tsc --noEmit` — type check.
2. `NODE_OPTIONS=--max-old-space-size=2048 DATABASE_URL=file:/home/z/my-project/db/custom.db bun run build` — production build.
3. Restart durable dev server if needed (rule 4.1 pattern).
4. E2E: login via `POST /api/auth/login`, then hit the changed APIs and
   `GET /` expecting 200.
5. Append a section to `worklog.md` (append-only; template at the top of the
   file).

---

## 6. Git & Documentation Rules

1. `worklog.md` is **append-only** — never overwrite prior entries; every
   task appends a `---`-separated section with Task ID, agent, work log, and
   stage summary.
2. Docs live at the root (`README.md`, `PRD.md`, `ARCHITECTURE.md`,
   `RULES.md`, `DESIGN.md`, `MEMORY.md`) and must cross-reference each other.
   Historical material goes to `docs/`.
3. When a doc says "Last updated", keep it truthful — stale docs are worse
   than no docs (the README once claimed Fraunces fonts and 8 views; the
   code used Space Grotesk and had 19).
4. Commits: imperative mood, feature-scoped, e.g.
   `Emission leaderboard: Hardware column (GPU/CPU badge + repo-scraped GPU requirement + min VRAM)`.

---

## 7. Data-Integrity Rules

1. `SubnetPlaybook` rows validate their netuid against `SubnetOverride` —
   overrides must exist **before** `merge-playbook.ts` runs.
2. `rescrape-requirements.ts` is the only writer of scraped hardware fields
   (`recommendedGpu`, `gpuCount`, hosting rules) — never hand-edit them in
   the DB; add curated overrides in code instead.
3. Emission math: totals are derived from the snapshot, never cached across
   snapshots.
