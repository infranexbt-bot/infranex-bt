# Infranex BT — Design System

> Last updated: 2026-10-17 · Tokens extracted from `src/app/globals.css`,
> `src/app/layout.tsx`, and live components — not from memory.

---

## 1. Brand Direction — "Dark Editorial Terminal"

A dense, editorial dark theme tuned for reading numbers all day: near-black
surfaces, a signature **lime/chartreuse primary (HSL hue 84)** for the
"alive/on-chain" accent, serif-free grotesk display type, and mono for every
machine-generated number. Light mode exists but dark is the default
experience.

---

## 2. Typography

| Role | Family | CSS variable | Notes |
|------|--------|--------------|-------|
| Display / headings | **Space Grotesk** | `--font-display` → `--font-space-grotesk` | Page titles, view names, big numbers |
| Body / UI | **Inter** | `--font-sans` → `--font-inter` | Everything else; `system-ui` fallback |
| Mono / data | **JetBrains Mono** | `--font-mono` → `--font-jetbrains-mono` | Emission figures, hashes, commands, tables |

Loaded via `next/font/google` in `src/app/layout.tsx`; applied on `<body>`
as `font-sans antialiased`.

> ⚠️ Historical note: older docs claimed "Fraunces serif + Inter Tight".
> The code uses **Space Grotesk / Inter / JetBrains Mono**. This file wins.

---

## 3. Color Tokens (HSL, from `globals.css`)

### Dark theme (default experience)

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `240 6% 4%` | Page background (near-black, slight blue) |
| `--primary` | `84 85% 58%` | Signature lime/chartreuse — active states, key data |
| `--primary-foreground` | `240 10% 4%` | Text on primary |
| `--accent` | see tokens | Sidebar/selection accent |

### Light theme

| Token | Value |
|-------|-------|
| `--background` | `84 20% 98%` (warm paper white) |
| `--primary` | `84 68% 27%` (deep olive-green) |
| `--accent` | `84 50% 93%` |

Theme switching: `localStorage["infranex-theme"] === "dark"` toggles the
`dark` class on `<html>` (inline init script prevents flash — see
`THEME_INIT` in `layout.tsx`).

**Rule:** use shadcn semantic tokens (`bg-background`, `text-foreground`,
`border-border`, `text-primary`) — never raw hex values in components.

---

## 4. Semantic Badge & Bar Palette (data views)

Used by the Emission Leaderboard (`emission-leaderboard-panel.tsx`) and
subnet tables — reuse these for any classification surface:

| Meaning | Classes |
|---------|---------|
| GPU hardware | `border-violet-500/40 bg-violet-500/10 text-violet-300` |
| CPU hardware | `border-cyan-500/40 bg-cyan-500/10 text-cyan-300` |
| Unknown / muted | `border-border/60 text-muted-foreground` |
| Rank bars (share of emission, 1→8) | `bg-emerald-500`, `bg-cyan-500`, `bg-violet-500`, `bg-amber-500`, `bg-sky-500`, `bg-rose-500`, `bg-lime-500`, `bg-orange-500` |
| Positive / earning | emerald family |
| Live status | pulse dot + `text-emerald-400` |

---

## 5. Layout & Components

- **Shell** — single SPA layout: persistent sidebar (`--color-sidebar-*`
  tokens) + view area; views are client components switched in-place.
- **Primitives** — shadcn/ui only: `Card`, `Badge`, `Button`, `Dialog`,
  `Table`, etc. from `src/components/ui/`. Radix under the hood,
  `lucide-react` icons (e.g. `TrendingUp`, `Info`).
- **Density** — tables are tight: `py-1.5`–`py-2` rows, `text-sm` body,
  mono numerals right-aligned.
- **Collapse rule** — long leaderboards render top-20 + "Show all" toggle
  with an aggregate tail row; never dump 129 rows.
- **Tooltips** — `title` attributes on hardware/requirement chips carry the
  full detail (`8× H200 · ≥48GB VRAM`).
- **Number formatting** — `toLocaleString("en-US")`, 1 decimal default for
  TAO/day; always with units (`TAO/day`, `USD/day`, `GB`).
- **Currency** — USD derived from live `taoPriceUsd`; show "$" + thousands
  separators.

---

## 6. Motion & State

- Polling refresh: 30s (network snapshot), 60s (GPU offers) — reflected in
  small "live" pulse indicators, no full-screen spinners on background
  refresh.
- Loading states: skeleton/placeholder rows inside cards, never layout
  jumps.
- Empty states: one sentence + the action that fixes it (e.g. "No data —
  run the restore sequence").

---

## 7. Accessibility

- Minimum `text-sm` (14px) for data, `text-xs` only for meta labels.
- Color never the sole signal — badges carry text (`GPU`, `CPU`), bars sit
  next to numeric shares.
- Focus states inherit shadcn defaults (`ring-offset-background`).
